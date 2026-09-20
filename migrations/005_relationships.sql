ALTER TABLE map_object ADD COLUMN identity TEXT;
ALTER TABLE map_draft ADD COLUMN relationships TEXT NOT NULL DEFAULT '[]';
CREATE TABLE relationship_type (
  id TEXT PRIMARY KEY NOT NULL,
  householdId TEXT NOT NULL REFERENCES household(id),
  revision INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL
);
CREATE TABLE map_relationship (
  id TEXT PRIMARY KEY NOT NULL,
  householdId TEXT NOT NULL REFERENCES household(id),
  typeId TEXT NOT NULL REFERENCES relationship_type(id),
  revision INTEGER NOT NULL,
  sourceId TEXT NOT NULL REFERENCES map_object(id),
  targetId TEXT REFERENCES map_object(id),
  knowledge TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX relationship_endpoints ON map_relationship
  (householdId, typeId, sourceId, coalesce(targetId, '')) WHERE deleted = 0;
CREATE TRIGGER household_family_types AFTER INSERT ON household BEGIN
INSERT INTO object_type VALUES (lower(hex(randomblob(16))), NEW.id, 1, 'Tjänst', '');
INSERT INTO object_type VALUES (lower(hex(randomblob(16))), NEW.id, 1, 'Tjänstekonto', '');
INSERT INTO object_type VALUES (lower(hex(randomblob(16))), NEW.id, 1, 'Abonnemang', '');
INSERT INTO object_type VALUES (lower(hex(randomblob(16))), NEW.id, 1, 'E-postadress', '');
INSERT INTO object_type VALUES (lower(hex(randomblob(16))), NEW.id, 1, 'Bankkonto', '');
INSERT INTO object_type VALUES (lower(hex(randomblob(16))), NEW.id, 1, 'Kort', '');
INSERT INTO object_type VALUES (lower(hex(randomblob(16))), NEW.id, 1, 'Företag', '');
INSERT INTO object_type VALUES (lower(hex(randomblob(16))), NEW.id, 1, 'Förening', '');
INSERT INTO relationship_type VALUES (lower(hex(randomblob(16))), NEW.id, 1, 'Tillhör tjänsten', 'Från tjänstekonto eller abonnemang till tjänst.');
INSERT INTO relationship_type VALUES (lower(hex(randomblob(16))), NEW.id, 1, 'Gäller tjänstekontot', 'Från abonnemang till tjänstekonto.');
INSERT INTO relationship_type VALUES (lower(hex(randomblob(16))), NEW.id, 1, 'Erbjuder', 'Från tjänsteleverantör till tjänst.');
INSERT INTO relationship_type VALUES (lower(hex(randomblob(16))), NEW.id, 1, 'Inloggningsadress', 'Från tjänstekonto till e-postadress.');
INSERT INTO relationship_type VALUES (lower(hex(randomblob(16))), NEW.id, 1, 'Kontaktadress', 'Från tjänstekonto till e-postadress.');
INSERT INTO relationship_type VALUES (lower(hex(randomblob(16))), NEW.id, 1, 'Använder', 'Från person till det som personen använder.');
INSERT INTO relationship_type VALUES (lower(hex(randomblob(16))), NEW.id, 1, 'Står på avtalet', 'Från avtal till avtalspart.');
INSERT INTO relationship_type VALUES (lower(hex(randomblob(16))), NEW.id, 1, 'Äger', 'Från objekt till ägare.');
INSERT INTO relationship_type VALUES (lower(hex(randomblob(16))), NEW.id, 1, 'Betalar', 'Från person till avtal.');
INSERT INTO relationship_type VALUES (lower(hex(randomblob(16))), NEW.id, 1, 'Betalas med', 'Från avtal till betalningsmedel.');
INSERT INTO relationship_type VALUES (lower(hex(randomblob(16))), NEW.id, 1, 'Kontokoppling', 'Från kort till bankkonto.');
INSERT INTO relationship_type VALUES (lower(hex(randomblob(16))), NEW.id, 1, 'Kortfakturan betalas från', 'Från kort till bankkontot som betalar kortfakturan.');
INSERT INTO relationship_type VALUES (lower(hex(randomblob(16))), NEW.id, 1, 'Används av', 'Från objekt till person som använder det.');
END;
INSERT INTO object_type SELECT lower(hex(randomblob(16))), id, 1, 'Tjänst', '' FROM household;
INSERT INTO object_type SELECT lower(hex(randomblob(16))), id, 1, 'Tjänstekonto', '' FROM household;
INSERT INTO object_type SELECT lower(hex(randomblob(16))), id, 1, 'Abonnemang', '' FROM household;
INSERT INTO object_type SELECT lower(hex(randomblob(16))), id, 1, 'E-postadress', '' FROM household;
INSERT INTO object_type SELECT lower(hex(randomblob(16))), id, 1, 'Bankkonto', '' FROM household;
INSERT INTO object_type SELECT lower(hex(randomblob(16))), id, 1, 'Kort', '' FROM household;
INSERT INTO object_type SELECT lower(hex(randomblob(16))), id, 1, 'Företag', '' FROM household;
INSERT INTO object_type SELECT lower(hex(randomblob(16))), id, 1, 'Förening', '' FROM household;
INSERT INTO relationship_type SELECT lower(hex(randomblob(16))), id, 1, 'Tillhör tjänsten', 'Från tjänstekonto eller abonnemang till tjänst.' FROM household;
INSERT INTO relationship_type SELECT lower(hex(randomblob(16))), id, 1, 'Gäller tjänstekontot', 'Från abonnemang till tjänstekonto.' FROM household;
INSERT INTO relationship_type SELECT lower(hex(randomblob(16))), id, 1, 'Erbjuder', 'Från tjänsteleverantör till tjänst.' FROM household;
INSERT INTO relationship_type SELECT lower(hex(randomblob(16))), id, 1, 'Inloggningsadress', 'Från tjänstekonto till e-postadress.' FROM household;
INSERT INTO relationship_type SELECT lower(hex(randomblob(16))), id, 1, 'Kontaktadress', 'Från tjänstekonto till e-postadress.' FROM household;
INSERT INTO relationship_type SELECT lower(hex(randomblob(16))), id, 1, 'Använder', 'Från person till det som personen använder.' FROM household;
INSERT INTO relationship_type SELECT lower(hex(randomblob(16))), id, 1, 'Står på avtalet', 'Från avtal till avtalspart.' FROM household;
INSERT INTO relationship_type SELECT lower(hex(randomblob(16))), id, 1, 'Äger', 'Från objekt till ägare.' FROM household;
INSERT INTO relationship_type SELECT lower(hex(randomblob(16))), id, 1, 'Betalar', 'Från person till avtal.' FROM household;
INSERT INTO relationship_type SELECT lower(hex(randomblob(16))), id, 1, 'Betalas med', 'Från avtal till betalningsmedel.' FROM household;
INSERT INTO relationship_type SELECT lower(hex(randomblob(16))), id, 1, 'Kontokoppling', 'Från kort till bankkonto.' FROM household;
INSERT INTO relationship_type SELECT lower(hex(randomblob(16))), id, 1, 'Kortfakturan betalas från', 'Från kort till bankkontot som betalar kortfakturan.' FROM household;
INSERT INTO relationship_type SELECT lower(hex(randomblob(16))), id, 1, 'Används av', 'Från objekt till person som använder det.' FROM household;
