import { createHash, randomUUID } from 'node:crypto';
import {
  chmodSync,
  createReadStream,
  createWriteStream,
  mkdirSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { type FileHandle, mkdir, open, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { finished, pipeline } from 'node:stream/promises';
import Database from 'better-sqlite3';
import { ZipFile } from 'yazl';
import {
  type ExportManifest,
  type ExportPart,
  exportLifetimeMs,
  type ReadyExport,
} from '../shared/household-export.js';
import { AdministrationError } from './administration.js';
import { assertContentAvailable } from './content-maintenance.js';
import { householdAccess } from './households.js';

type Job = {
  id: string;
  actorId: string;
  householdId: string;
  directory: string;
  controller: AbortController;
  settled: Promise<unknown>;
  state: 'preparing' | 'ready' | 'reading';
  contentVersion: number;
  bytes: number;
  expiresAt: string;
  timer?: NodeJS.Timeout;
  stream?: ReturnType<typeof createReadStream>;
};
type Store = { directory: string; jobs: Map<string, Job> };
const stores = new WeakMap<Database.Database, Store>();

/** One application instance owns this private temporary directory. */
export function initializeHouseholdExports(database: Database.Database) {
  if (stores.has(database)) return;
  const directory = join(dirname(database.name), '.skyttel-exports');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  // No pending export survives process restart. Remove abandoned partial files.
  for (const name of readdirSync(directory))
    rmSync(join(directory, name), { recursive: true, force: true });
  stores.set(database, { directory, jobs: new Map() });
}

function storeFor(database: Database.Database) {
  initializeHouseholdExports(database);
  return stores.get(database) as Store;
}

function authorize(database: Database.Database, actorId: string, householdId: string) {
  if (householdAccess(database, actorId, householdId)?.role !== 'administrator')
    throw new AdministrationError('forbidden', 403);
  assertContentAvailable(database, householdId);
}

async function discard(store: Store, job: Job) {
  job.controller.abort();
  job.stream?.destroy();
  clearTimeout(job.timer);
  await job.settled;
  if (job.stream) await finished(job.stream).catch(() => {});
  await rm(job.directory, { recursive: true, force: true });
  store.jobs.delete(job.id);
}

function reportCleanupFailure() {
  console.error(JSON.stringify({ event: 'export_cleanup_failed' }));
}

/** Await before erasure/checkpoint: closes readers, aborts downloads, removes copies. */
export async function invalidateHouseholdExports(
  database: Database.Database,
  householdId: string,
  actorId?: string,
) {
  const store = stores.get(database);
  if (!store) return;
  await Promise.all(
    [...store.jobs.values()]
      .filter((job) => job.householdId === householdId && (!actorId || job.actorId === actorId))
      .map((job) => discard(store, job)),
  );
}

const collections = [
  ['objectTypes', 'SELECT * FROM object_type WHERE householdId = ? ORDER BY id', []],
  [
    'objectTypeFields',
    'SELECT f.* FROM object_type_fields f JOIN object_type t ON t.id = f.typeId WHERE t.householdId = ? ORDER BY f.typeId',
    ['fields'],
  ],
  ['relationshipTypes', 'SELECT * FROM relationship_type WHERE householdId = ? ORDER BY id', []],
  [
    'relationshipTypeLabels',
    'SELECT l.* FROM relationship_type_labels l JOIN relationship_type t ON t.id = l.typeId WHERE t.householdId = ? ORDER BY l.typeId',
    [],
  ],
  [
    'removedTypes',
    `SELECT r.* FROM removed_type r WHERE
    (r.kind = 'objectType' AND r.typeId IN (SELECT id FROM object_type WHERE householdId = ?)) OR
    (r.kind = 'relationshipType' AND r.typeId IN (SELECT id FROM relationship_type WHERE householdId = ?)) ORDER BY kind, typeId`,
    [],
  ],
  [
    'objects',
    'SELECT * FROM map_object WHERE householdId = ? ORDER BY id',
    ['financialFacts', 'customValues'],
  ],
  [
    'relationships',
    'SELECT * FROM map_relationship WHERE householdId = ? ORDER BY id',
    ['endDate'],
  ],
  [
    'drafts',
    'SELECT * FROM map_draft WHERE householdId = ? ORDER BY userId',
    ['changes', 'relationships', 'objectTypes', 'relationshipTypes'],
  ],
  [
    'saves',
    'SELECT * FROM map_save WHERE householdId = ? ORDER BY userId, operationId',
    ['receipt'],
  ],
  ['history', 'SELECT * FROM map_history WHERE householdId = ? ORDER BY id', ['changes']],
  [
    'operations',
    'SELECT * FROM map_operation WHERE householdId = ? UNION ALL SELECT * FROM historical_operation WHERE householdId = ? ORDER BY userId, operationId',
    [],
  ],
  [
    'positions',
    'SELECT * FROM personal_position WHERE householdId = ? ORDER BY userId, objectId',
    [],
  ],
  [
    'viewSettings',
    'SELECT * FROM personal_view_settings WHERE householdId = ? ORDER BY userId',
    ['settings'],
  ],
] as const;

async function snapshot(database: Database.Database, job: Job): Promise<ExportManifest> {
  const reader = new Database(database.name, { readonly: true, fileMustExist: true });
  const handles: FileHandle[] = [];
  try {
    reader.exec('BEGIN');
    authorize(reader, job.actorId, job.householdId);
    const household = reader
      .prepare('SELECT * FROM household WHERE id = ?')
      .get(job.householdId) as { contentVersion: number };
    job.contentVersion = household.contentVersion;
    const content = await open(join(job.directory, 'content.json'), 'wx', 0o600);
    handles.push(content);
    const images = await open(join(job.directory, 'images.bin'), 'wx', 0o600);
    handles.push(images);
    const contentHash = createHash('sha256');
    const imageHash = createHash('sha256');
    let contentBytes = 0;
    let imageBytes = 0;
    async function write(value: string) {
      job.controller.signal.throwIfAborted();
      const bytes = Buffer.from(value);
      contentBytes += bytes.length;
      if (!Number.isSafeInteger(contentBytes)) throw new Error('export_size_unrepresentable');
      contentHash.update(bytes);
      await content.writeFile(bytes);
    }
    await write(`{"household":${JSON.stringify(household)},"identities":[`);
    const identityQuery = `SELECT id, name FROM content_identity WHERE householdId = @householdId AND id IN (
      SELECT userId FROM map_draft WHERE householdId = @householdId
      UNION SELECT userId FROM map_save WHERE householdId = @householdId
      UNION SELECT userId FROM map_history WHERE householdId = @householdId
      UNION SELECT userId FROM map_operation WHERE householdId = @householdId
      UNION SELECT userId FROM historical_operation WHERE householdId = @householdId
      UNION SELECT createdBy FROM profile_image WHERE householdId = @householdId
      UNION SELECT userId FROM personal_position WHERE householdId = @householdId
      UNION SELECT userId FROM personal_view_settings WHERE householdId = @householdId
    ) ORDER BY id`;
    let first = true;
    for (const identity of reader
      .prepare(identityQuery)
      .iterate({ householdId: job.householdId })) {
      await write(`${first ? '' : ','}${JSON.stringify(identity)}`);
      first = false;
    }
    await write(']');
    for (const [name, sql, jsonFields] of collections) {
      await write(`,${JSON.stringify(name)}:[`);
      first = true;
      const parameters =
        name === 'removedTypes' || name === 'operations'
          ? [job.householdId, job.householdId]
          : [job.householdId];
      for (const result of reader.prepare(sql).iterate(...parameters)) {
        const row = result as Record<string, unknown>;
        for (const field of jsonFields)
          if (typeof row[field] === 'string') row[field] = JSON.parse(row[field]);
        await write(`${first ? '' : ','}${JSON.stringify(row)}`);
        first = false;
      }
      await write(']');
    }
    await write(',"images":[');
    first = true;
    for (const result of reader
      .prepare('SELECT * FROM profile_image WHERE householdId = ? ORDER BY id')
      .iterate(job.householdId)) {
      job.controller.signal.throwIfAborted();
      const { bytes, ...image } = result as { bytes: Buffer; [key: string]: unknown };
      const offset = imageBytes;
      imageBytes += bytes.length;
      if (!Number.isSafeInteger(imageBytes)) throw new Error('export_size_unrepresentable');
      await images.writeFile(bytes);
      imageHash.update(bytes);
      await write(
        `${first ? '' : ','}${JSON.stringify({ ...image, offset, length: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })}`,
      );
      first = false;
    }
    await write(']}');
    const { version: schemaVersion } = reader
      .prepare('SELECT max(version) AS version FROM schema_migration')
      .get() as { version: number };
    reader.exec('COMMIT');
    const parts: ExportPart[] = [
      { path: 'content.json', bytes: contentBytes, sha256: contentHash.digest('hex') },
      { path: 'images.bin', bytes: imageBytes, sha256: imageHash.digest('hex') },
    ];
    return {
      format: 'skyttel-household',
      version: 1,
      createdAt: new Date().toISOString(),
      householdId: job.householdId,
      schemaVersion,
      parts,
    };
  } finally {
    if (reader.inTransaction) reader.exec('ROLLBACK');
    reader.close();
    await Promise.all(handles.map((handle) => handle.close()));
  }
}

async function generate(database: Database.Database, job: Job) {
  await mkdir(job.directory, { mode: 0o700 });
  const manifest = await snapshot(database, job);
  await writeFile(join(job.directory, 'manifest.json'), JSON.stringify(manifest), {
    mode: 0o600,
    flag: 'wx',
  });
  const zip = new ZipFile();
  const output = zip.outputStream as Readable;
  zip.on('error', (error) => output.destroy(error));
  for (const name of ['manifest.json', 'content.json', 'images.bin'])
    zip.addFile(join(job.directory, name), name, {
      compress: name !== 'images.bin',
      mode: 0o100600,
    });
  zip.end();
  await pipeline(
    output,
    createWriteStream(join(job.directory, 'archive.zip'), { mode: 0o600, flags: 'wx' }),
    { signal: job.controller.signal },
  );
  job.bytes = (await stat(join(job.directory, 'archive.zip'))).size;
  if (!Number.isSafeInteger(job.bytes)) throw new Error('export_size_unrepresentable');
  for (const name of ['manifest.json', 'content.json', 'images.bin'])
    await rm(join(job.directory, name));
}

export async function prepareHouseholdExport(
  database: Database.Database,
  actorId: string,
  householdId: string,
  signal?: AbortSignal,
): Promise<ReadyExport> {
  authorize(database, actorId, householdId);
  const store = storeFor(database);
  // A single writer keeps disk and compression work bounded. Ready archives
  // remain available until consumed, cancelled or expired.
  if ([...store.jobs.values()].some((job) => job.state === 'preparing'))
    throw new AdministrationError('export_busy', 409);
  for (const job of [...store.jobs.values()])
    if (job.actorId === actorId && job.householdId === householdId) await discard(store, job);
  if (store.jobs.size >= 2 || [...store.jobs.values()].some((job) => job.state === 'preparing'))
    throw new AdministrationError('export_busy', 409);
  authorize(database, actorId, householdId);
  const id = randomUUID();
  const job: Job = {
    id,
    actorId,
    householdId,
    directory: join(store.directory, id),
    controller: new AbortController(),
    settled: Promise.resolve(),
    state: 'preparing',
    contentVersion: 0,
    bytes: 0,
    expiresAt: new Date(Date.now() + exportLifetimeMs).toISOString(),
  };
  store.jobs.set(id, job);
  const abort = () => job.controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  const generation = generate(database, job);
  job.settled = generation.catch(() => {});
  try {
    await generation;
    job.controller.signal.throwIfAborted();
    authorize(database, actorId, householdId);
    if (!currentGeneration(database, job)) throw new AdministrationError('export_unavailable', 409);
    job.state = 'ready';
    job.expiresAt = new Date(Date.now() + exportLifetimeMs).toISOString();
    job.timer = setTimeout(() => {
      void discard(store, job).catch(reportCleanupFailure);
    }, exportLifetimeMs).unref();
    return { id, bytes: job.bytes, expiresAt: job.expiresAt };
  } catch (error) {
    const cancelled = job.controller.signal.aborted;
    await discard(store, job);
    if (cancelled) throw new AdministrationError('export_cancelled', 409);
    throw error;
  } finally {
    signal?.removeEventListener('abort', abort);
  }
}

function currentGeneration(database: Database.Database, job: Job) {
  return (
    (
      database.prepare('SELECT contentVersion FROM household WHERE id = ?').get(job.householdId) as
        | { contentVersion: number }
        | undefined
    )?.contentVersion === job.contentVersion
  );
}

export async function cancelHouseholdExport(
  database: Database.Database,
  actorId: string,
  householdId: string,
  id: string,
) {
  authorize(database, actorId, householdId);
  const store = storeFor(database);
  const job = store.jobs.get(id);
  if (job?.actorId === actorId && job.householdId === householdId) await discard(store, job);
}

export async function downloadHouseholdExport(
  database: Database.Database,
  actorId: string,
  householdId: string,
  id: string,
) {
  authorize(database, actorId, householdId);
  const store = storeFor(database);
  const job = store.jobs.get(id);
  if (
    !job ||
    job.actorId !== actorId ||
    job.householdId !== householdId ||
    job.state !== 'ready' ||
    job.controller.signal.aborted
  )
    throw new AdministrationError('export_unavailable', 404);
  if (Date.parse(job.expiresAt) <= Date.now() || !currentGeneration(database, job)) {
    await discard(store, job);
    throw new AdministrationError('export_unavailable', 404);
  }
  job.state = 'reading';
  job.stream = createReadStream(join(job.directory, 'archive.zip'));
  void finished(job.stream)
    .catch(() => {})
    .then(() => discard(store, job))
    .catch(reportCleanupFailure);
  return {
    body: Readable.toWeb(job.stream, {
      strategy: { highWaterMark: 64 * 1024, size: (chunk: Uint8Array) => chunk.byteLength },
    }) as ReadableStream<Uint8Array>,
    bytes: job.bytes,
  };
}
