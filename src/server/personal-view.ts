import type Database from 'better-sqlite3';
import { z } from 'zod';
import {
  defaultViewSettings,
  type PersonalPosition,
  type PersonalView,
  type ViewSettings,
} from '../shared/personal-view.js';
import { assertContentVersion } from './content-maintenance.js';
import { householdMap } from './map.js';
import { MapError } from './map-error.js';

const version = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER - 1);
const coordinate = z.number().min(-10000).max(10000);
const movement = z
  .object({
    id: z.string().min(1).max(128),
    version,
    contentVersion: z.number().int().min(1).optional(),
    position: z.object({ x: coordinate, y: coordinate, z: coordinate }).strict(),
  })
  .strict();
const preferences = z
  .object({
    version,
    contentVersion: z.number().int().min(1).optional(),
    settings: z
      .object({
        invertX: z.boolean(),
        invertY: z.boolean(),
        axisCorner: z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right']),
        axisPinned: z.boolean(),
        stars: z.boolean(),
        allLabels: z.boolean(),
      })
      .strict(),
  })
  .strict();

/** Personal presentation has per-object versions, independent of the shared map. */
export function personalView(database: Database.Database, actorId: string, householdId: string) {
  let userId = actorId;
  let contentVersion = 1;
  function transaction<T>(action: (ids: Set<string>) => T) {
    return database
      .transaction(() => {
        // Read current membership and this user's draft inside the write lock.
        const map = householdMap(database, actorId, householdId).read();
        userId = map.userId;
        contentVersion = map.contentVersion;
        const ids = new Set(map.objects.map(({ id }) => id));
        for (const change of map.draft.changes) ids.add(change.id);
        return action(ids);
      })
      .immediate();
  }
  function settings(): PersonalView['settings'] {
    const row = database
      .prepare(
        'SELECT version, settings FROM personal_view_settings WHERE householdId = ? AND userId = ?',
      )
      .get(householdId, userId) as { version: number; settings: string } | undefined;
    return row
      ? { ...(JSON.parse(row.settings) as ViewSettings), version: row.version }
      : { ...defaultViewSettings, version: 0 };
  }
  function positions() {
    return database
      .prepare(
        'SELECT objectId AS id, version, x, y, z FROM personal_position WHERE householdId = ? AND userId = ? ORDER BY objectId',
      )
      .all(householdId, userId) as PersonalPosition[];
  }
  return {
    read(): PersonalView {
      return transaction((ids) => ({
        contentVersion,
        positions: positions().filter(({ id }) => ids.has(id)),
        settings: settings(),
      }));
    },
    move(body: Record<string, unknown>) {
      return transaction((ids) => {
        assertContentVersion(database, householdId, body.contentVersion);
        const parsed = movement.safeParse(body);
        if (!parsed.success) throw new MapError('invalid_request', 400);
        const { id, version, position } = parsed.data;
        if (!ids.has(id)) throw new MapError('object_unavailable', 400);
        const current = positions().find((item) => item.id === id);
        if ((current?.version ?? 0) !== version) throw new MapError('position_conflict');
        database
          .prepare(`INSERT INTO personal_position (householdId, userId, objectId, version, x, y, z) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(householdId, userId, objectId) DO UPDATE SET version = excluded.version, x = excluded.x, y = excluded.y, z = excluded.z`)
          .run(householdId, userId, id, version + 1, position.x, position.y, position.z);
        return { id, version: version + 1, ...position };
      });
    },
    configure(body: Record<string, unknown>) {
      return transaction(() => {
        assertContentVersion(database, householdId, body.contentVersion);
        const parsed = preferences.safeParse(body);
        if (!parsed.success) throw new MapError('invalid_request', 400);
        const { version, settings: next } = parsed.data;
        if (settings().version !== version) throw new MapError('view_settings_conflict');
        database
          .prepare(`INSERT INTO personal_view_settings (householdId, userId, version, settings) VALUES (?, ?, ?, ?)
          ON CONFLICT(householdId, userId) DO UPDATE SET version = excluded.version, settings = excluded.settings`)
          .run(householdId, userId, version + 1, JSON.stringify(next));
        return { ...next, version: version + 1 };
      });
    },
  };
}
