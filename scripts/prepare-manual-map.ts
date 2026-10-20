import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { openDatabase } from '../src/server/database.js';

// Offline synthetic fixtures only. Existing public provider login supplies every
// authenticated identity; no provider, session or production route is replaced.
const [kind, inputDirectory, userId] = process.argv.slice(2);
let source: Database.Database | undefined;
try {
  if (process.env.NODE_ENV === 'production' || !inputDirectory || !userId)
    throw new Error('Use a stopped disposable development installation and a verified user ID.');
  const directory = realpathSync(inputDirectory);
  if (
    directory !== resolve(inputDirectory) ||
    dirname(directory) !== realpathSync(tmpdir()) ||
    !/^skyttel-manual-map-[\w-]+$/.test(basename(directory))
  )
    throw new Error(
      'Use the documented fresh skyttel-manual-map- directory under the temporary directory.',
    );
  source = new Database(join(directory, 'verified.sqlite'), {
    readonly: true,
    fileMustExist: true,
  });
  const user = source.prepare('SELECT 1 FROM user WHERE id=?').get(userId);
  const account = source
    .prepare("SELECT 1 FROM account WHERE userId=? AND providerId IN ('google','microsoft')")
    .get(userId);
  if (!user || !account)
    throw new Error('Sign in through the configured provider before preparing the fixture.');
  if (kind === 'second-household') {
    if (source.prepare('SELECT 1 FROM membership WHERE userId=?').get(userId))
      throw new Error('Use the verified test user who has not joined any household.');
    if (!source.prepare('SELECT 1 FROM installation WHERE id=1').get())
      throw new Error('Create Linden through the app before preparing the second household.');
    source.close();
    source = openDatabase(join(directory, 'verified.sqlite'));
    const database = source;
    database
      .transaction(() => {
        database
          .prepare('INSERT INTO household (id,name,createdAt) VALUES (?,?,?)')
          .run('manual-other-household', 'Eken', new Date().toISOString());
        database
          .prepare('INSERT INTO membership (householdId,userId,role) VALUES (?,?,?)')
          .run('manual-other-household', userId, 'member');
      })
      .immediate();
    console.log(
      'Prepared Eken for the verified user in verified.sqlite. Restart the same development installation.',
    );
  } else {
    throw new Error('Unknown fixture.');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Fixture preparation failed.');
  process.exitCode = 1;
} finally {
  source?.close();
}
