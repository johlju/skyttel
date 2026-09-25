import { createHash, randomUUID } from 'node:crypto';
import { chmodSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { mkdir, open, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type Database from 'better-sqlite3';
import {
  assertContentAvailable,
  assertContentVersion,
  type ContentMaintenance,
  contentMaintenance,
} from './content-maintenance.js';
import { invalidateHouseholdExports } from './household-export.js';
import { householdAccess } from './households.js';
import { importUploadLimit, validateImportArchive } from './import-archive.js';
import {
  assertImportCollisions,
  householdContentFingerprint,
  replaceHouseholdContent,
} from './import-replacement.js';
import type { ImportContent } from './import-schema.js';
import { MapError } from './map-error.js';

type ReadyImport = {
  id: string;
  actorId: string;
  householdId: string;
  directory: string;
  contentVersion: number;
  fingerprint: string;
  content: ImportContent;
  expiresAt: string;
  timer?: NodeJS.Timeout;
};
type Store = {
  directory: string;
  jobs: Map<string, ReadyImport>;
  uploading?: { householdId: string; controller: AbortController; settled: Promise<void> };
  running: Set<string>;
  abandoned: Map<string, { householdId: string; directory: string }>;
};
const stores = new WeakMap<Database.Database, Store>();
const lifetimeMs = 10 * 60 * 1000;

export function initializeHouseholdImports(database: Database.Database) {
  if (stores.has(database)) return;
  const directory = join(dirname(database.name), '.skyttel-imports');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  for (const entry of readdirSync(directory))
    rmSync(join(directory, entry), { recursive: true, force: true });
  // A prepared transaction never applied; cleanup means replacement committed.
  // Startup removes all temporary material before releasing either durable gate.
  if (
    database
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'content_maintenance'")
      .get()
  )
    database
      .prepare(`UPDATE content_maintenance SET phase = CASE phase WHEN 'cleanup' THEN 'completed' ELSE 'failed' END,
    payload = NULL, error = CASE phase WHEN 'prepared' THEN 'import_interrupted' ELSE NULL END, updatedAt = ?
    WHERE kind = 'import' AND phase IN ('prepared', 'cleanup')`)
      .run(new Date().toISOString());
  stores.set(database, { directory, jobs: new Map(), running: new Set(), abandoned: new Map() });
}
function storeFor(database: Database.Database) {
  initializeHouseholdImports(database);
  return stores.get(database) as Store;
}
function authorize(database: Database.Database, actorId: string, householdId: string) {
  if (householdAccess(database, actorId, householdId)?.role !== 'administrator')
    throw new MapError('forbidden', 403);
}
function counts(content: ImportContent) {
  return Object.fromEntries(
    Object.entries(content)
      .filter(([, value]) => Array.isArray(value))
      .map(([name, value]) => [name, (value as unknown[]).length]),
  );
}
function readyStatus(job: ReadyImport) {
  return {
    id: job.id,
    status: 'ready' as const,
    contentVersion: job.contentVersion,
    sourceHouseholdId: job.content.household.id,
    counts: counts(job.content),
    expiresAt: job.expiresAt,
  };
}
function durableStatus(job: ContentMaintenance) {
  return {
    id: job.id,
    status: job.phase,
    contentVersion: job.contentVersion,
    counts: JSON.parse(job.counts) as Record<string, number>,
    ...(job.error ? { error: job.error } : {}),
  };
}
function storedImport(database: Database.Database, householdId: string, id: string) {
  return database
    .prepare(
      "SELECT * FROM content_maintenance WHERE householdId = ? AND id = ? AND kind = 'import'",
    )
    .get(householdId, id) as ContentMaintenance;
}
// Trusted housekeeping must still release a gate when its original actor loses
// authority during asynchronous cleanup. It never changes household content.
function settleImport(
  database: Database.Database,
  householdId: string,
  id: string,
  expected: 'prepared' | 'cleanup',
  error: string | null,
) {
  database
    .prepare(`UPDATE content_maintenance SET phase = ?, payload = NULL, error = ?, updatedAt = ?
    WHERE householdId = ? AND id = ? AND kind = 'import' AND phase = ?`)
    .run(
      expected === 'cleanup' ? 'completed' : 'failed',
      error,
      new Date().toISOString(),
      householdId,
      id,
      expected,
    );
  return storedImport(database, householdId, id);
}
async function discard(store: Store, job: ReadyImport) {
  clearTimeout(job.timer);
  await rm(job.directory, { recursive: true, force: true });
  store.jobs.delete(job.id);
}

/** Commit a maintenance gate first so no new upload can enter while this awaits. */
export async function invalidateHouseholdImports(
  database: Database.Database,
  householdId: string,
  { exceptImportId }: { exceptImportId?: string } = {},
) {
  const store = storeFor(database);
  const upload = store.uploading;
  if (upload?.householdId === householdId) {
    upload.controller.abort();
    await upload.settled;
  }
  // A failed upload may have failed its first removal too. Keep that path
  // registered until deletion succeeds; erasure must not report completion.
  for (const [id, abandoned] of store.abandoned) {
    if (abandoned.householdId !== householdId) continue;
    await rm(abandoned.directory, { recursive: true, force: true });
    store.abandoned.delete(id);
  }
  for (const job of [...store.jobs.values()])
    if (job.householdId === householdId && job.id !== exceptImportId) await discard(store, job);
}

export async function prepareHouseholdImport(
  database: Database.Database,
  actorId: string,
  householdId: string,
  contentVersion: number,
  request: Request,
) {
  authorize(database, actorId, householdId);
  assertContentAvailable(database, householdId);
  assertContentVersion(database, householdId, contentVersion);
  if (!request.body) throw new MapError('invalid_archive', 400);
  const store = storeFor(database);
  if (store.uploading || store.jobs.size >= 2) throw new MapError('import_busy');
  const fingerprint = householdContentFingerprint(database, householdId);
  const id = randomUUID();
  const directory = join(store.directory, id);
  const controller = new AbortController();
  const signal = AbortSignal.any([request.signal, controller.signal]);
  let resolveSettled: () => void = () => {};
  const settled = new Promise<void>((resolve) => {
    resolveSettled = resolve;
  });
  store.uploading = { householdId, controller, settled };
  store.abandoned.set(id, { householdId, directory });
  try {
    await mkdir(directory, { mode: 0o700 });
    const file = await open(join(directory, 'archive.zip'), 'wx', 0o600);
    try {
      let bytes = 0;
      const reader = request.body.getReader();
      let cancellation: Promise<void> | undefined;
      const abort = () => {
        cancellation = reader.cancel();
        void cancellation.catch(() => {});
      };
      signal.addEventListener('abort', abort, { once: true });
      try {
        while (true) {
          signal.throwIfAborted();
          const { done, value } = await reader.read();
          signal.throwIfAborted();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > importUploadLimit) throw new MapError('archive_too_large', 400);
          await file.writeFile(value);
        }
      } finally {
        signal.removeEventListener('abort', abort);
        await (cancellation ?? reader.cancel());
        reader.releaseLock();
      }
    } finally {
      await file.close();
    }
    const content = await validateImportArchive(directory, signal);
    signal.throwIfAborted();
    authorize(database, actorId, householdId);
    assertContentAvailable(database, householdId);
    assertContentVersion(database, householdId, contentVersion);
    assertImportCollisions(database, householdId, content);
    const job: ReadyImport = {
      id,
      actorId,
      householdId,
      directory,
      contentVersion,
      fingerprint,
      content,
      expiresAt: new Date(Date.now() + lifetimeMs).toISOString(),
    };
    job.timer = setTimeout(() => {
      void discard(store, job).catch(() =>
        console.error(JSON.stringify({ event: 'import_cleanup_failed' })),
      );
    }, lifetimeMs).unref();
    store.jobs.set(id, job);
    store.abandoned.delete(id);
    return readyStatus(job);
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    store.abandoned.delete(id);
    if (error instanceof MapError) throw error;
    throw new MapError(signal.aborted ? 'import_cancelled' : 'invalid_archive', 400);
  } finally {
    store.uploading = undefined;
    resolveSettled();
  }
}

export function householdImportStatus(
  database: Database.Database,
  actorId: string,
  householdId: string,
  id: string,
) {
  authorize(database, actorId, householdId);
  const store = storeFor(database);
  const durable = database
    .prepare('SELECT 1 FROM content_maintenance WHERE householdId = ? AND id = ? AND kind = ?')
    .get(householdId, id, 'import');
  if (durable) return durableStatus(contentMaintenance(database, householdId, actorId).read(id));
  const job = store.jobs.get(id);
  if (
    !job ||
    job.actorId !== actorId ||
    job.householdId !== householdId ||
    Date.parse(job.expiresAt) <= Date.now()
  )
    throw new MapError('import_unavailable', 404);
  return readyStatus(job);
}

export async function confirmHouseholdImport(
  database: Database.Database,
  actorId: string,
  householdId: string,
  id: string,
  body: Record<string, unknown>,
) {
  authorize(database, actorId, householdId);
  if (
    body.confirmed !== true ||
    !Number.isSafeInteger(body.contentVersion) ||
    Object.keys(body).some((key) => !['confirmed', 'contentVersion'].includes(key))
  )
    throw new MapError('invalid_request', 400);
  const store = storeFor(database);
  const maintenance = contentMaintenance(database, householdId, actorId);
  const requestHash = createHash('sha256')
    .update(JSON.stringify({ confirmed: true, contentVersion: body.contentVersion }))
    .digest('hex');
  const status = householdImportStatus(database, actorId, householdId, id);
  if (status.status !== 'ready') {
    const durable = maintenance.read(id);
    if (durable.requestHash !== requestHash || durable.kind !== 'import')
      throw new MapError('operation_conflict');
    if (status.status === 'completed' || status.status === 'failed' || store.running.has(id))
      return status;
    if (status.status === 'cleanup') {
      await rm(join(store.directory, id), { recursive: true, force: true });
      store.jobs.delete(id);
      const completed = settleImport(database, householdId, id, 'cleanup', null);
      authorize(database, actorId, householdId);
      return durableStatus(completed);
    }
  }
  const job = store.jobs.get(id);
  if (!job || job.householdId !== householdId || job.actorId !== actorId)
    throw new MapError('import_unavailable', 404);
  if (status.status === 'ready')
    maintenance.begin(
      {
        id,
        kind: 'import',
        contentVersion: body.contentVersion as number,
        requestHash,
        payload: '{}',
      },
      () => {
        if (
          body.contentVersion !== job.contentVersion ||
          householdContentFingerprint(database, householdId) !== job.fingerprint
        )
          throw new MapError('content_conflict');
        assertImportCollisions(database, householdId, job.content);
      },
    );
  clearTimeout(job.timer);
  store.running.add(id);
  try {
    await invalidateHouseholdImports(database, householdId, { exceptImportId: id });
    await invalidateHouseholdExports(database, householdId);
    maintenance.apply(id, () =>
      replaceHouseholdContent(database, householdId, job.content, job.directory),
    );
    await discard(store, job);
    const completed = settleImport(database, householdId, id, 'cleanup', null);
    authorize(database, actorId, householdId);
    return durableStatus(completed);
  } catch (error) {
    const phase = storedImport(database, householdId, id).phase;
    if (phase === 'prepared') {
      await discard(store, job);
      const failed = settleImport(
        database,
        householdId,
        id,
        'prepared',
        error instanceof MapError ? error.code : 'import_failed',
      );
      authorize(database, actorId, householdId);
      return durableStatus(failed);
    }
    // The replacement committed. Keep its durable cleanup gate and report its
    // actual phase so the client can recover instead of retrying old content.
    authorize(database, actorId, householdId);
    return durableStatus(storedImport(database, householdId, id));
  } finally {
    store.running.delete(id);
  }
}
