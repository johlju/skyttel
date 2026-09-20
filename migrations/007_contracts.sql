ALTER TABLE map_object ADD COLUMN financialFacts TEXT;

CREATE TRIGGER household_contract_types AFTER INSERT ON household BEGIN
INSERT INTO object_type (id, householdId, revision, name, description)
SELECT lower(hex(randomblob(16))), NEW.id, 1, 'Bostad', 'En bostad som kan omfattas av flera avtal.'
WHERE NOT EXISTS (SELECT 1 FROM object_type WHERE householdId = NEW.id AND name = 'Bostad');
INSERT INTO object_type (id, householdId, revision, name, description)
SELECT lower(hex(randomblob(16))), NEW.id, 1, 'Garage', 'Ett garage, skilt från avtalet som gäller det.'
WHERE NOT EXISTS (SELECT 1 FROM object_type WHERE householdId = NEW.id AND name = 'Garage');
INSERT INTO object_type (id, householdId, revision, name, description)
SELECT lower(hex(randomblob(16))), NEW.id, 1, 'Fordon', 'Ett fordon, oberoende av finansiering, ägande och användning.'
WHERE NOT EXISTS (SELECT 1 FROM object_type WHERE householdId = NEW.id AND name = 'Fordon');
INSERT INTO object_type (id, householdId, revision, name, description)
SELECT lower(hex(randomblob(16))), NEW.id, 1, 'Avtal', 'En överenskommelse mellan parter.'
WHERE NOT EXISTS (SELECT 1 FROM object_type WHERE householdId = NEW.id AND name = 'Avtal');
INSERT INTO object_type (id, householdId, revision, name, description)
SELECT lower(hex(randomblob(16))), NEW.id, 1, 'Hyresavtal', 'Ett avtal om hyra. Återkommande betalning gör det inte till ett abonnemang.'
WHERE NOT EXISTS (SELECT 1 FROM object_type WHERE householdId = NEW.id AND name = 'Hyresavtal');
INSERT INTO object_type (id, householdId, revision, name, description)
SELECT lower(hex(randomblob(16))), NEW.id, 1, 'Låneavtal', 'Ett avtal om lån, skilt från senast uppgiven skuld.'
WHERE NOT EXISTS (SELECT 1 FROM object_type WHERE householdId = NEW.id AND name = 'Låneavtal');
INSERT INTO object_type (id, householdId, revision, name, description)
SELECT lower(hex(randomblob(16))), NEW.id, 1, 'Kreditavtal', 'Ett avtal om kredit. Beviljat kreditutrymme och utnyttjad kredit är olika uppgifter.'
WHERE NOT EXISTS (SELECT 1 FROM object_type WHERE householdId = NEW.id AND name = 'Kreditavtal');
INSERT INTO object_type (id, householdId, revision, name, description)
SELECT lower(hex(randomblob(16))), NEW.id, 1, 'Avbetalningsavtal', 'Ett avtal om att betala ett köp i delar.'
WHERE NOT EXISTS (SELECT 1 FROM object_type WHERE householdId = NEW.id AND name = 'Avbetalningsavtal');
INSERT INTO object_type (id, householdId, revision, name, description)
SELECT lower(hex(randomblob(16))), NEW.id, 1, 'Försäkringsavtal', 'Ett avtal om försäkring, skilt från det som försäkras.'
WHERE NOT EXISTS (SELECT 1 FROM object_type WHERE householdId = NEW.id AND name = 'Försäkringsavtal');
INSERT INTO relationship_type (id, householdId, revision, name, description)
SELECT lower(hex(randomblob(16))), NEW.id, 1, 'Gäller', 'Från avtal till det objekt som avtalet gäller.'
WHERE NOT EXISTS (SELECT 1 FROM relationship_type WHERE householdId = NEW.id AND name = 'Gäller');
INSERT INTO relationship_type (id, householdId, revision, name, description)
SELECT lower(hex(randomblob(16))), NEW.id, 1, 'Finansierar', 'Från finansieringsavtal till det objekt som finansieras.'
WHERE NOT EXISTS (SELECT 1 FROM relationship_type WHERE householdId = NEW.id AND name = 'Finansierar');
INSERT INTO relationship_type (id, householdId, revision, name, description)
SELECT lower(hex(randomblob(16))), NEW.id, 1, 'Försäkrar', 'Från försäkringsavtal till det objekt som försäkras.'
WHERE NOT EXISTS (SELECT 1 FROM relationship_type WHERE householdId = NEW.id AND name = 'Försäkrar');
INSERT INTO relationship_type (id, householdId, revision, name, description)
SELECT lower(hex(randomblob(16))), NEW.id, 1, 'Hyresvärd', 'Från hyresavtal till den person, det företag eller den förening som hyr ut.'
WHERE NOT EXISTS (SELECT 1 FROM relationship_type WHERE householdId = NEW.id AND name = 'Hyresvärd');
INSERT INTO relationship_type (id, householdId, revision, name, description)
SELECT lower(hex(randomblob(16))), NEW.id, 1, 'Långivare', 'Från låneavtal eller kreditavtal till den person, det företag eller den förening som lämnar lånet eller krediten.'
WHERE NOT EXISTS (SELECT 1 FROM relationship_type WHERE householdId = NEW.id AND name = 'Långivare');
END;

WITH definitions(name, description) AS (VALUES
  ('Bostad', 'En bostad som kan omfattas av flera avtal.'),
  ('Garage', 'Ett garage, skilt från avtalet som gäller det.'),
  ('Fordon', 'Ett fordon, oberoende av finansiering, ägande och användning.'),
  ('Avtal', 'En överenskommelse mellan parter.'),
  ('Hyresavtal', 'Ett avtal om hyra. Återkommande betalning gör det inte till ett abonnemang.'),
  ('Låneavtal', 'Ett avtal om lån, skilt från senast uppgiven skuld.'),
  ('Kreditavtal', 'Ett avtal om kredit. Beviljat kreditutrymme och utnyttjad kredit är olika uppgifter.'),
  ('Avbetalningsavtal', 'Ett avtal om att betala ett köp i delar.'),
  ('Försäkringsavtal', 'Ett avtal om försäkring, skilt från det som försäkras.')
)
INSERT INTO object_type (id, householdId, revision, name, description)
SELECT lower(hex(randomblob(16))), household.id, 1, definitions.name, definitions.description
FROM household CROSS JOIN definitions
WHERE NOT EXISTS (
  SELECT 1 FROM object_type
  WHERE householdId = household.id AND name = definitions.name
);

WITH definitions(name, description) AS (VALUES
  ('Gäller', 'Från avtal till det objekt som avtalet gäller.'),
  ('Finansierar', 'Från finansieringsavtal till det objekt som finansieras.'),
  ('Försäkrar', 'Från försäkringsavtal till det objekt som försäkras.'),
  ('Hyresvärd', 'Från hyresavtal till den person, det företag eller den förening som hyr ut.'),
  ('Långivare', 'Från låneavtal eller kreditavtal till den person, det företag eller den förening som lämnar lånet eller krediten.')
)
INSERT INTO relationship_type (id, householdId, revision, name, description)
SELECT lower(hex(randomblob(16))), household.id, 1, definitions.name, definitions.description
FROM household CROSS JOIN definitions
WHERE NOT EXISTS (
  SELECT 1 FROM relationship_type
  WHERE householdId = household.id AND name = definitions.name
);
