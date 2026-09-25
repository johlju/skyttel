import type Database from 'better-sqlite3';
import { householdMap } from '../../src/server/map.js';

// Fixture arrangement only. All measurements and assertions use the running app.
export function seedLargeMap(database: Database.Database, userId: string, householdId: string) {
  const map = householdMap(database, userId, householdId);
  const state = map.read();
  const types = ['Person', 'Tjänst', 'Abonnemang', 'Bankkonto', 'Bostad'].map((name) => {
    const type = state.types.find((item) => item.name === name);
    if (!type) throw new Error(`Missing fixture type: ${name}`);
    return type;
  });
  const edgeTypes = ['Använder', 'Betalar', 'Gäller'].map((name) => {
    const type = state.relationshipTypes.find((item) => item.name === name);
    if (!type) throw new Error(`Missing fixture relationship type: ${name}`);
    return type;
  });
  const object = database.prepare(`INSERT INTO map_object
    (id, householdId, typeId, revision, name, description, identity, financialFacts, lifecycle)
    VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)`);
  const edge = database.prepare(`INSERT INTO map_relationship
    (id, householdId, typeId, revision, sourceId, targetId, knowledge, lifecycle)
    VALUES (?, ?, ?, 1, ?, ?, ?, ?)`);
  database.transaction(() => {
    for (let index = 0; index < 500; index += 1) {
      object.run(
        `large-${index}`,
        householdId,
        types[index % types.length].id,
        `Provobjekt ${String(index).padStart(3, '0')}`,
        `Påhittat sammanhang ${Math.floor(index / 25)}. Inga verkliga hushållsuppgifter.`,
        index % 11 === 0 ? 'unspecified' : null,
        JSON.stringify({
          price:
            index % 4 === 0
              ? { knowledge: 'unknown' }
              : index % 4 === 1
                ? { knowledge: 'none' }
                : { knowledge: index % 4 === 2 ? 'uncertain' : 'known', value: '149' },
        }),
        index % 17 === 0 ? 'ended' : null,
      );
    }
    for (let index = 0; index < 1500; index += 1) {
      const source = Math.floor(index / 3);
      const offset = (index % 3) + 1;
      const missing = index % 19 === 0;
      edge.run(
        `large-edge-${index}`,
        householdId,
        edgeTypes[index % 3].id,
        `large-${source}`,
        missing ? null : `large-${Math.floor(source / 25) * 25 + ((source + offset) % 25)}`,
        missing ? (index % 2 ? 'none' : 'unknown') : index % 7 === 0 ? 'uncertain' : 'known',
        index % 29 === 0 ? 'ended' : null,
      );
    }
  })();
}
