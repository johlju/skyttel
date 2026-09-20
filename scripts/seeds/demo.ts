import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { changeMembership } from '../../src/server/administration.js';
import { internalEmail } from '../../src/server/auth.js';
import type { Config } from '../../src/server/config.js';
import { createHousehold } from '../../src/server/households.js';
import { householdMap } from '../../src/server/map.js';

// Add new demo data here, or call additional fixture modules from this function.
// The setup command wraps all fixtures in the same transaction as the reset.
export function seedDemo(database: Database.Database, config: Config) {
  const administratorId = randomUUID();
  const now = Date.now();
  const { provider, subject } = config.firstAdmin;
  const { email } = internalEmail(provider, subject);
  database
    .prepare('INSERT INTO user (id, name, email, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)')
    .run(administratorId, 'Development administrator', email, now, now);
  database
    .prepare(
      `INSERT INTO account (id, accountId, providerId, userId, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(randomUUID(), subject, provider, administratorId, now, now);
  const result = createHousehold(database, config, administratorId, 'TestHousehold');
  if ('error' in result) throw new Error('demo_household_setup_failed');
  const map = householdMap(database, administratorId, result.household.id);
  const initial = map.read();
  const ids = new Map<string, string>();
  const objects = [
    ['lo', 'Person', 'Lo Exempel', 'Använder familjens musik.'],
    ['alex', 'Person', 'Alex Exempel', 'Står på abonnemanget.'],
    ['kim', 'Person', 'Kim Exempel', 'Betalar abonnemanget.'],
    ['service', 'Tjänst', 'Molnmusik', 'Påhittad musiktjänst.'],
    ['company', 'Företag', 'Molnmusik AB', 'Påhittad tjänsteleverantör.'],
    ['association', 'Förening', 'Lindens musikförening', 'En förening, skild från tjänsten.'],
    [
      'account',
      'Tjänstekonto',
      'Familjens musikkonto',
      'Samma konto även när e-postadressen ändras.',
    ],
    [
      'second-account',
      'Tjänstekonto',
      'Föreningens musikkonto',
      'Delar kontaktadress med familjekontot.',
    ],
    [
      'subscription',
      'Abonnemang',
      'Familjens Molnmusik',
      'Ett enda avtalsobjekt. Påhittat pris: 149 kr per månad.',
    ],
    ['email', 'E-postadress', 'familjen@example.test', 'Delas av Alex och Kim.'],
    ['new-email', 'E-postadress', 'musik@example.test', 'Föreslagen ny inloggningsadress.'],
    ['card', 'Kort', 'Familjens musikkort', 'Påhittat kort utan kortnummer.'],
    ['bank', 'Bankkonto', 'Hushållets betalkonto', 'Betalar kortfakturan.'],
    [
      'linked-bank',
      'Bankkonto',
      'Kortets kontokoppling',
      'Ospecificerat bankkonto; ingen bank eller ägare antas.',
    ],
  ];
  for (const [key, type, name, description] of objects) {
    const id = randomUUID();
    ids.set(key, id);
    map.propose({
      version: map.read().draft.version,
      id,
      baseRevision: null,
      value: {
        typeId: initial.types.find((value) => value.name === type)?.id,
        name,
        description,
        ...(key === 'linked-bank' ? { identity: 'unspecified' } : {}),
      },
    });
  }
  const links = [
    ['company', 'Erbjuder', 'service'],
    ['account', 'Tillhör tjänsten', 'service'],
    ['second-account', 'Tillhör tjänsten', 'service'],
    ['subscription', 'Tillhör tjänsten', 'service'],
    ['subscription', 'Gäller tjänstekontot', 'account'],
    ['account', 'Inloggningsadress', 'email'],
    ['account', 'Kontaktadress', 'email'],
    ['second-account', 'Kontaktadress', 'email'],
    ['alex', 'Använder', 'email'],
    ['kim', 'Använder', 'email'],
    ['subscription', 'Står på avtalet', 'alex'],
    ['kim', 'Betalar', 'subscription'],
    ['lo', 'Använder', 'service'],
    ['alex', 'Använder', 'service'],
    ['account', 'Äger', 'alex'],
    ['subscription', 'Betalas med', 'card'],
    ['card', 'Kontokoppling', 'linked-bank'],
    ['card', 'Kortfakturan betalas från', 'bank'],
    ['service', 'Används av', 'lo', 'uncertain'],
    ['second-account', 'Äger', '', 'unknown'],
    ['association', 'Används av', '', 'none'],
  ];
  for (const [source, type, target, knowledge] of links) {
    map.proposeRelationship({
      version: map.read().draft.version,
      id: randomUUID(),
      baseRevision: null,
      value: {
        typeId: initial.relationshipTypes.find((value) => value.name === type)?.id,
        sourceId: ids.get(source),
        targetId: target ? ids.get(target) : null,
        knowledge: knowledge ?? 'known',
      },
    });
  }
  map.save({ version: map.read().draft.version, operationId: randomUUID() });
  const saved = map.read();
  const lo = saved.objects.find((value) => value.id === ids.get('lo'));
  if (!lo) throw new Error('demo_person_missing');
  map.propose({
    version: saved.draft.version,
    id: lo.id,
    baseRevision: lo.revision,
    value: {
      ...lo,
      name: 'Lo Lind',
    },
  });
  const loginType = saved.relationshipTypes.find((value) => value.name === 'Inloggningsadress');
  const login = saved.relationships.find((value) => value.typeId === loginType?.id);
  if (!login) throw new Error('demo_relationship_missing');
  map.proposeRelationship({
    version: map.read().draft.version,
    id: login.id,
    baseRevision: login.revision,
    value: { ...login, targetId: ids.get('new-email') },
  });

  // A fictional former member supplies a real, separately saved correction.
  // There is no provider account or session for this history-only identity.
  const contributorId = randomUUID();
  database
    .prepare('INSERT INTO user (id, name, email, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)')
    .run(contributorId, 'Robin Demo', `${contributorId}@example.test`, now, now);
  database
    .prepare('INSERT INTO membership (householdId, userId, role) VALUES (?, ?, ?)')
    .run(result.household.id, contributorId, 'member');
  const contributorMap = householdMap(database, contributorId, result.household.id);
  contributorMap.propose({
    version: contributorMap.read().draft.version,
    id: lo.id,
    baseRevision: lo.revision,
    value: { ...lo, name: 'Lo Berg', description: 'Spelar piano i musikföreningen.' },
  });
  contributorMap.save({
    version: contributorMap.read().draft.version,
    operationId: randomUUID(),
  });
  changeMembership(database, administratorId, result.household.id, contributorId, null);
  return result.household;
}
