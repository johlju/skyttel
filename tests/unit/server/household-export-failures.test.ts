import { readdirSync } from 'node:fs';
import { type FileHandle, open } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { expect, test, vi } from 'vitest';
import { applicationFixture } from './fixture.js';

vi.mock('node:fs/promises', { spy: true });

test('failure opening the second output file closes the first handle and releases the SQLite snapshot', async () => {
  const fixture = await applicationFixture();
  const client = fixture.client();
  await client.signIn();
  const { household } = await (await client.json('/api/households', { name: 'Linden' })).json();
  const real = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  let first: FileHandle | undefined;
  vi.mocked(open).mockImplementation(async (path, flags, mode) => {
    if (String(path).endsWith('images.bin')) throw new Error('Synthetic disk failure');
    const handle = await real.open(path, flags, mode);
    if (String(path).endsWith('content.json')) first = handle;
    return handle;
  });
  const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const result = await client.json(`/api/households/${household.id}/exports`, {});
    expect(result.status).toBe(500);
    expect(await result.json()).toEqual({ error: 'internal_error' });
    if (!first) throw new Error('The first output file must be opened before the injected failure');
    await expect(first.read(Buffer.alloc(1), 0, 1, 0)).rejects.toMatchObject({ code: 'EBADF' });
    expect(fixture.database.pragma('wal_checkpoint(TRUNCATE)')).toEqual([
      { busy: 0, log: 0, checkpointed: 0 },
    ]);
    expect(readdirSync(join(dirname(fixture.config.databasePath), '.skyttel-exports'))).toEqual([]);
    expect(diagnostic.mock.calls).toEqual([[JSON.stringify({ event: 'request_failed' })]]);
  } finally {
    vi.mocked(open).mockRestore();
    diagnostic.mockRestore();
    fixture.close();
  }
});
