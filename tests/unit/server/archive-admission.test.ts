import { chmodSync, readdirSync, statfsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { invalidateHouseholdExports } from '../../../src/server/household-export.js';
import { invalidateHouseholdImports } from '../../../src/server/household-import.js';
import { applicationFixture } from './fixture.js';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, statfsSync: vi.fn(actual.statfsSync) };
});
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, readFile: vi.fn(actual.readFile) };
});

let fixture: Awaited<ReturnType<typeof applicationFixture>>;
let client: ReturnType<typeof fixture.client>;
let householdId: string;
let path: string;
let archive: Uint8Array;

beforeEach(async () => {
  vi.mocked(statfsSync).mockReset();
  vi.mocked(readFile).mockReset();
  fixture = await applicationFixture();
  client = fixture.client();
  await client.signIn();
  const { household } = await (await client.json('/api/households', { name: 'Linden' })).json();
  householdId = household.id;
  path = `/api/households/${householdId}`;
  const ready = await (await client.json(`${path}/exports`, {})).json();
  archive = new Uint8Array(
    await (await client.request(`${path}/exports/${ready.id}`)).arrayBuffer(),
  );
  await invalidateHouseholdExports(fixture.database, householdId);
});

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await invalidateHouseholdImports(fixture.database, householdId);
  await invalidateHouseholdExports(fixture.database, householdId);
  fixture.close();
});

function smallVolume() {
  const actual = statfsSync(dirname(fixture.database.name));
  vi.mocked(statfsSync).mockReturnValue({ ...actual, bsize: 1024, bavail: 1000 * 1024 });
}

function upload(bytes = archive) {
  return client.request(`${path}/imports`, {
    method: 'POST',
    headers: {
      origin: fixture.config.origin,
      'content-type': 'application/zip',
      'X-Skyttel-Content-Version': '1',
    },
    body: bytes as BodyInit,
  });
}

test('import and export share capacity and cancellation releases it only after file removal', async () => {
  smallVolume();
  const imported = await upload();
  expect(imported.status).toBe(201);
  const ready = await imported.json();
  const rejected = await client.json(`${path}/exports`, {});
  expect(rejected.status).toBe(503);
  expect(await rejected.json()).toEqual({ error: 'archive_storage_unavailable' });
  expect((await client.json(`${path}/imports/${ready.id}/cancel`, {})).status).toBe(200);
  expect(readdirSync(join(dirname(fixture.database.name), '.skyttel-imports'))).toEqual([]);
  expect((await client.json(`${path}/exports`, {})).status).toBe(201);
});

test('an image part above 64 MiB is rejected before extraction and releases its reservation', async () => {
  smallVolume();
  const oversized = Buffer.from(archive);
  for (let offset = 0; offset < oversized.length - 46; offset++) {
    if (oversized.readUInt32LE(offset) !== 0x02014b50) continue;
    const length = oversized.readUInt16LE(offset + 28);
    if (oversized.subarray(offset + 46, offset + 46 + length).toString() === 'images.bin') {
      oversized.writeUInt32LE(64 * 1024 * 1024 + 1, offset + 24);
      // Stored entries must have matching compressed and uncompressed sizes.
      oversized.writeUInt32LE(64 * 1024 * 1024 + 1, offset + 20);
      break;
    }
  }
  const result = await upload(oversized);
  expect(await result.json()).toEqual({ error: 'archive_too_large' });
  expect(readdirSync(join(dirname(fixture.database.name), '.skyttel-imports'))).toEqual([]);
  expect((await upload()).status).toBe(201);
});

test('export stops before writing an image part above 64 MiB and releases capacity on failure', async () => {
  const { userId } = await (await client.request(`${path}/map`)).json();
  fixture.database.transaction(() => {
    const insert = fixture.database.prepare(
      'INSERT INTO profile_image VALUES (?, ?, ?, ?, zeroblob(262144), 1, 1)',
    );
    for (let index = 0; index < 257; index++)
      insert.run(`large-image-${index}`, householdId, 'synthetic-object', userId);
  })();
  const response = await client.json(`${path}/exports`, {});
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: 'archive_too_large' });
  expect(readdirSync(join(dirname(fixture.database.name), '.skyttel-exports'))).toEqual([]);
  fixture.database.prepare('DELETE FROM profile_image WHERE householdId = ?').run(householdId);
  expect((await client.json(`${path}/exports`, {})).status).toBe(201);
});

test('a stalled upload expires after five minutes, removes files and permits a fresh import', async () => {
  smallVolume();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  let entered = () => {};
  const reading = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const pending = client.request(`${path}/imports`, {
    method: 'POST',
    headers: {
      origin: fixture.config.origin,
      'content-type': 'application/zip',
      'X-Skyttel-Content-Version': '1',
    },
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(archive.slice(0, 1));
      },
      pull() {
        entered();
        return new Promise<void>(() => {});
      },
      // Even a source that never acknowledges cancellation must not keep
      // the preparation slot or its disk reservation indefinitely.
      cancel() {
        return new Promise<void>(() => {});
      },
    }),
    duplex: 'half',
  } as RequestInit);
  await reading;
  await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
  expect(await (await pending).json()).toEqual({ error: 'import_preparation_timeout' });
  vi.useRealTimers();
  expect(readdirSync(join(dirname(fixture.database.name), '.skyttel-imports'))).toEqual([]);
  expect((await upload()).status).toBe(201);
});

test('failed cancellation keeps its reservation until a successful cleanup retry', async () => {
  smallVolume();
  const ready = await (await upload()).json();
  const directory = join(dirname(fixture.database.name), '.skyttel-imports', ready.id);
  chmodSync(directory, 0o000);
  try {
    expect(
      await (await client.json(`${path}/imports/${ready.id}/cancel`, {})).json(),
    ).toMatchObject({ status: 'cancel-cleanup' });
    expect((await client.json(`${path}/exports`, {})).status).toBe(503);
  } finally {
    chmodSync(directory, 0o700);
  }
  expect((await client.json(`${path}/imports/${ready.id}/cancel`, {})).status).toBe(200);
  expect((await client.json(`${path}/exports`, {})).status).toBe(201);
});

test('request cancellation and validation failure release admission for the next import', async () => {
  smallVolume();
  expect((await upload(new Uint8Array([1, 2, 3]))).status).toBe(400);
  const response = await client.request(`${path}/imports`, {
    method: 'POST',
    headers: {
      origin: fixture.config.origin,
      'content-type': 'application/zip',
      'X-Skyttel-Content-Version': '1',
    },
    body: archive as BodyInit,
    signal: AbortSignal.abort(),
  });
  expect(await response.json()).toEqual({ error: 'import_cancelled' });
  expect(readdirSync(join(dirname(fixture.database.name), '.skyttel-imports'))).toEqual([]);
  expect((await upload()).status).toBe(201);
});

test('a ready export prevents import admission until its download is cleaned up', async () => {
  smallVolume();
  const ready = await (await client.json(`${path}/exports`, {})).json();
  expect((await upload()).status).toBe(503);
  expect(
    (await (await client.request(`${path}/exports/${ready.id}`)).arrayBuffer()).byteLength,
  ).toBeGreaterThan(0);
  await vi.waitFor(() => {
    expect(readdirSync(join(dirname(fixture.database.name), '.skyttel-exports'))).toEqual([]);
  });
  expect((await upload()).status).toBe(201);
});

test('validation cannot publish a ready import after the preparation deadline even before its timer runs', async () => {
  smallVolume();
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  const started = performance.now();
  const clock = vi.spyOn(performance, 'now').mockReturnValue(started);
  vi.mocked(readFile).mockImplementation(async (...args) => {
    const result = await actual.readFile(...args);
    if (String(args[0]).endsWith('content.json')) clock.mockReturnValue(started + 300_001);
    return result;
  });
  expect(await (await upload()).json()).toEqual({ error: 'import_preparation_timeout' });
  expect(readdirSync(join(dirname(fixture.database.name), '.skyttel-imports'))).toEqual([]);
  vi.mocked(readFile).mockReset();
  clock.mockRestore();
  expect((await upload()).status).toBe(201);
});

test('the final database collision scan cannot publish a review after the deadline', async () => {
  smallVolume();
  const started = performance.now();
  const clock = vi.spyOn(performance, 'now').mockReturnValue(started);
  const prepare = fixture.database.prepare.bind(fixture.database);
  const delay = vi.spyOn(fixture.database, 'prepare').mockImplementation((sql: string) => {
    // Inject latency at the SQLite boundary; execute the real collision query.
    if (sql === 'SELECT 1 FROM map_history WHERE id = ? AND householdId != ?')
      clock.mockReturnValue(started + 300_001);
    return prepare(sql);
  });
  expect(await (await upload()).json()).toEqual({ error: 'import_preparation_timeout' });
  expect(readdirSync(join(dirname(fixture.database.name), '.skyttel-imports'))).toEqual([]);
  delay.mockRestore();
  clock.mockRestore();
  expect((await upload()).status).toBe(201);
});

test('capturing the current household is included in the preparation deadline', async () => {
  smallVolume();
  const started = performance.now();
  const clock = vi.spyOn(performance, 'now').mockReturnValue(started);
  const prepare = fixture.database.prepare.bind(fixture.database);
  const delay = vi.spyOn(fixture.database, 'prepare').mockImplementation((sql: string) => {
    if (sql === 'SELECT * FROM household WHERE id = ?') clock.mockReturnValue(started + 300_001);
    return prepare(sql);
  });
  expect(await (await upload()).json()).toEqual({ error: 'import_preparation_timeout' });
  expect(readdirSync(join(dirname(fixture.database.name), '.skyttel-imports'))).toEqual([]);
  delay.mockRestore();
  clock.mockRestore();
  expect((await upload()).status).toBe(201);
});
