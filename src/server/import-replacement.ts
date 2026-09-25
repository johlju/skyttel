import { createHash } from 'node:crypto';
import { closeSync, openSync, readSync } from 'node:fs';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { contentOwner } from './content-identities.js';
import { validateImportReferences } from './import-references.js';
import type { ImportContent } from './import-schema.js';
import { MapError } from './map-error.js';
import { projectDraftScope } from './project-content-scope.js';

const tables = [
  ['objectTypes', 'object_type', []],
  ['objectTypeFields', 'object_type_fields', ['fields']],
  ['relationshipTypes', 'relationship_type', []],
  ['relationshipTypeLabels', 'relationship_type_labels', []],
  ['removedTypes', 'removed_type', []],
  ['objects', 'map_object', ['financialFacts', 'customValues']],
  ['relationships', 'map_relationship', ['endDate']],
  ['drafts', 'map_draft', ['changes', 'relationships', 'objectTypes', 'relationshipTypes']],
  ['saves', 'map_save', ['receipt']],
  ['history', 'map_history', ['changes']],
  ['operations', 'historical_operation', []],
  ['positions', 'personal_position', []],
  ['viewSettings', 'personal_view_settings', ['settings']],
] as const;

function scopedRows(database: Database.Database, table: string, householdId: string) {
  if (table === 'object_type_fields' || table === 'relationship_type_labels') {
    const parent = table === 'object_type_fields' ? 'object_type' : 'relationship_type';
    return database
      .prepare(
        `SELECT child.* FROM ${table} child JOIN ${parent} parent ON parent.id = child.typeId WHERE parent.householdId = ? ORDER BY child.typeId`,
      )
      .iterate(householdId);
  }
  if (table === 'removed_type')
    return database
      .prepare(`SELECT * FROM removed_type WHERE
    (kind = 'objectType' AND typeId IN (SELECT id FROM object_type WHERE householdId = ?)) OR
    (kind = 'relationshipType' AND typeId IN (SELECT id FROM relationship_type WHERE householdId = ?)) ORDER BY kind, typeId`)
      .iterate(householdId, householdId);
  return database
    .prepare(`SELECT * FROM ${table} WHERE householdId = ? ORDER BY rowid`)
    .iterate(householdId);
}

/** Captures concurrent changes to private and shared content, without authentication data. */
export function householdContentFingerprint(database: Database.Database, householdId: string) {
  const hash = createHash('sha256');
  hash.update(
    JSON.stringify(database.prepare('SELECT * FROM household WHERE id = ?').get(householdId)),
  );
  for (const table of [
    ...tables.map(([, table]) => table),
    'profile_image',
    'content_identity',
    'map_operation',
  ]) {
    hash.update(table);
    for (const result of scopedRows(database, table, householdId)) {
      const row = result as Record<string, unknown>;
      const bytes = row.bytes;
      if (Buffer.isBuffer(bytes)) {
        hash.update(bytes);
        delete row.bytes;
      }
      hash.update(JSON.stringify(row));
    }
  }
  return hash.digest('hex');
}

export function assertImportCollisions(
  database: Database.Database,
  householdId: string,
  content: ImportContent,
) {
  const referencedTables = {
    object: 'map_object',
    relationship: 'map_relationship',
    objectType: 'object_type',
    relationshipType: 'relationship_type',
  };
  validateImportReferences(content, (kind, id) => {
    if (
      database
        .prepare(`SELECT 1 FROM ${referencedTables[kind]} WHERE id = ? AND householdId != ?`)
        .get(id, householdId)
    )
      throw new MapError('archive_identity_conflict', 409);
  });
  for (const [name, table] of [
    ['objects', 'map_object'],
    ['relationships', 'map_relationship'],
    ['objectTypes', 'object_type'],
    ['relationshipTypes', 'relationship_type'],
    ['images', 'profile_image'],
    ['history', 'map_history'],
  ] as const) {
    const collision = database.prepare(`SELECT 1 FROM ${table} WHERE id = ? AND householdId != ?`);
    for (const row of content[name])
      if (collision.get(row.id, householdId)) throw new MapError('archive_identity_conflict', 409);
  }
}

/** Called only under the durable maintenance gate and its replacement transaction. */
export function replaceHouseholdContent(
  database: Database.Database,
  householdId: string,
  content: ImportContent,
  directory: string,
) {
  assertImportCollisions(database, householdId, content);
  const bindings = database
    .prepare('SELECT id, userId FROM content_identity WHERE householdId = ? AND userId IS NOT NULL')
    .all(householdId) as { id: string; userId: string }[];
  database
    .prepare(
      `INSERT OR IGNORE INTO retired_operation SELECT householdId, operationId FROM map_operation WHERE householdId = ?`,
    )
    .run(householdId);
  database.prepare('DELETE FROM map_operation WHERE householdId = ?').run(householdId);
  for (const operationId of new Set(
    [...content.operations, ...content.saves].map((row) => row.operationId),
  ))
    database
      .prepare('INSERT OR IGNORE INTO retired_operation VALUES (?, ?)')
      .run(householdId, operationId);
  database
    .prepare(`DELETE FROM removed_type WHERE
    (kind = 'objectType' AND typeId IN (SELECT id FROM object_type WHERE householdId = ?)) OR
    (kind = 'relationshipType' AND typeId IN (SELECT id FROM relationship_type WHERE householdId = ?))`)
    .run(householdId, householdId);
  for (const table of [
    'map_relationship',
    'map_object',
    'map_draft',
    'map_history',
    'map_save',
    'historical_operation',
    'personal_position',
    'personal_view_settings',
    'profile_image',
    'object_type',
    'relationship_type',
    'content_identity',
  ])
    database.prepare(`DELETE FROM ${table} WHERE householdId = ?`).run(householdId);
  for (const identity of content.identities) {
    const trusted =
      content.household.id === householdId
        ? bindings.find((row) => row.id === identity.id)?.userId
        : undefined;
    database
      .prepare('INSERT INTO content_identity (householdId, id, name, userId) VALUES (?, ?, ?, ?)')
      .run(householdId, identity.id, identity.name, trusted ?? null);
  }
  // Membership is unchanged. Missing or foreign owners get distinct new identities.
  for (const member of database
    .prepare('SELECT userId FROM membership WHERE householdId = ?')
    .all(householdId) as { userId: string }[])
    contentOwner(database, householdId, member.userId);
  const imageFile = openSync(join(directory, 'images.bin'), 'r');
  try {
    for (const image of content.images) {
      const bytes = Buffer.alloc(image.length);
      if (readSync(imageFile, bytes, 0, bytes.length, image.offset) !== bytes.length)
        throw new MapError('invalid_archive', 400);
      database
        .prepare('INSERT INTO profile_image VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(
          image.id,
          householdId,
          image.objectId,
          image.createdBy,
          bytes,
          image.width,
          image.height,
        );
    }
  } finally {
    closeSync(imageFile);
  }
  for (const [name, table, jsonFields] of tables) {
    for (const value of content[name]) {
      const row: Record<string, unknown> = { ...value };
      if (name === 'drafts')
        Object.assign(
          row,
          projectDraftScope(value as ImportContent['drafts'][number], householdId),
        );
      if ('householdId' in row) row.householdId = householdId;
      for (const field of jsonFields)
        if (row[field] !== null) row[field] = JSON.stringify(row[field]);
      const columns = Object.keys(row);
      database
        .prepare(
          `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
        )
        .run(...Object.values(row));
    }
  }
  database
    .prepare('UPDATE household SET name = ?, createdAt = ? WHERE id = ?')
    .run(content.household.name, content.household.createdAt, householdId);
  if ((database.pragma('foreign_key_check') as unknown[]).length)
    throw new MapError('invalid_archive', 400);
  return Object.fromEntries(
    Object.entries(content)
      .filter(([, value]) => Array.isArray(value))
      .map(([name, rows]) => [name, (rows as unknown[]).length]),
  );
}
