import {
  closeSync,
  copyFileSync,
  mkdtempSync,
  openSync,
  readdirSync,
  realpathSync,
  rmSync,
} from 'node:fs';
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
  const user = source
    .prepare('SELECT id,name,email,emailVerified,image,createdAt,updatedAt FROM user WHERE id=?')
    .get(userId) as Record<string, string | number | null> | undefined;
  const accounts = source
    .prepare(
      "SELECT id,accountId,providerId,userId,createdAt,updatedAt FROM account WHERE userId=? AND providerId IN ('google','microsoft')",
    )
    .all(userId) as Record<string, string | number | null>[];
  if (!user || !accounts.length)
    throw new Error('Sign in through the configured provider before preparing the fixture.');
  if (kind === 'second-household') {
    if (source.prepare('SELECT 1 FROM membership WHERE userId=?').get(userId))
      throw new Error('Use the verified test user who has not joined any household.');
    if (!source.prepare('SELECT 1 FROM installation WHERE id=1').get())
      throw new Error('Create Linden through the app before preparing the second household.');
    source.close();
    source = new Database(join(directory, 'verified.sqlite'), { fileMustExist: true });
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
  } else if (kind === 'legacy-contracts') {
    if (
      !source
        .prepare("SELECT 1 FROM membership WHERE userId=? AND role='administrator'")
        .get(userId)
    )
      throw new Error('The legacy fixture requires the verified test administrator.');
    const migrations = mkdtempSync(join(directory, 'legacy-migrations-'));
    let legacy: Database.Database | undefined;
    try {
      for (const name of readdirSync('migrations').filter(
        (name) => name.endsWith('.sql') && name < '007',
      ))
        copyFileSync(join('migrations', name), join(migrations, name));
      const destination = join(directory, 'legacy.sqlite');
      closeSync(openSync(destination, 'wx', 0o600));
      legacy = openDatabase(destination, { migrationsDirectory: migrations });
      const database = legacy;
      database
        .transaction(() => {
          for (const [table, rows] of [
            ['user', [user]],
            ['account', accounts],
          ] as const)
            for (const row of rows) {
              const keys = Object.keys(row);
              database
                .prepare(
                  `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
                )
                .run(...keys.map((key) => row[key]));
            }
          const householdId = 'manual-legacy-household';
          database
            .prepare('INSERT INTO household (id,name,createdAt) VALUES (?,?,?)')
            .run(householdId, 'Linden', new Date().toISOString());
          database
            .prepare('INSERT INTO membership VALUES (?,?,?)')
            .run(householdId, userId, 'administrator');
          database.prepare('INSERT INTO installation VALUES (1,?)').run(householdId);
          const type = {
            id: 'household-home-type',
            householdId,
            revision: 7,
            name: 'Bostad',
            description: 'Hushållets egen beskrivning av bostad',
          };
          database
            .prepare(
              'INSERT INTO object_type VALUES (@id,@householdId,@revision,@name,@description)',
            )
            .run(type);
          database
            .prepare('INSERT INTO relationship_type VALUES (?,?,4,?,?)')
            .run(
              'household-landlord-role',
              householdId,
              'Hyresvärd',
              'Hushållets egen beskrivning av hyresvärd',
            );
          const before = {
            id: 'home-before-upgrade',
            householdId,
            typeId: type.id,
            revision: 1,
            name: 'Björkbacken',
            description: '',
          };
          database
            .prepare(
              'INSERT INTO map_object (id,householdId,typeId,revision,name,description) VALUES (@id,@householdId,@typeId,@revision,@name,@description)',
            )
            .run(before);
          database
            .prepare('INSERT INTO map_draft (householdId,userId,version,changes) VALUES (?,?,3,?)')
            .run(
              householdId,
              userId,
              JSON.stringify([
                {
                  id: before.id,
                  before,
                  after: { typeId: type.id, name: 'Björkbacken hemma', description: '' },
                  type,
                },
              ]),
            );
        })
        .immediate();
      console.log(
        'Prepared legacy.sqlite before migration 007. Start the current app on that file to upgrade. No sessions or provider tokens were copied.',
      );
    } finally {
      legacy?.close();
      rmSync(migrations, { recursive: true, force: true });
    }
  } else {
    throw new Error('Unknown fixture.');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Fixture preparation failed.');
  process.exitCode = 1;
} finally {
  source?.close();
}
