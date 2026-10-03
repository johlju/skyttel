import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test } from 'vitest';
import { openDatabase } from '../../../src/server/database.js';
import { applicationFixture } from './fixture.js';

test('migration 024 retains an existing actor draft choice while adding default widths', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'skyttel-width-upgrade-'));
  const previous = join(directory, 'migrations');
  mkdirSync(previous);
  for (const name of readdirSync(resolve('migrations')).filter((name) => name < '024'))
    copyFileSync(resolve('migrations', name), join(previous, name));
  const old = await applicationFixture({ migrationsDirectory: previous });
  try {
    const actor = old.client();
    await actor.signIn();
    const { user } = await (await actor.request('/api/bootstrap')).json();
    old.database
      .prepare('INSERT INTO conversation_preferences(userId, showDraftOnStart) VALUES (?, 1)')
      .run(user.id);
    const snapshot = join(directory, 'skyttel.sqlite');
    await old.database.backup(snapshot);
    const upgraded = openDatabase(snapshot);
    try {
      expect(
        upgraded.prepare('SELECT * FROM conversation_preferences WHERE userId = ?').get(user.id),
      ).toEqual({
        userId: user.id,
        showDraftOnStart: 1,
        textWidth: 400,
        draftWidth: 340,
      });
      expect(
        upgraded.prepare('SELECT MAX(version) AS version FROM schema_migration').get(),
      ).toEqual({ version: 24 });
    } finally {
      upgraded.close();
    }
  } finally {
    old.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
