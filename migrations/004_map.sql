CREATE TABLE object_type (
  id TEXT PRIMARY KEY NOT NULL,
  householdId TEXT NOT NULL REFERENCES household(id),
  revision INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL
);
INSERT INTO object_type SELECT lower(hex(randomblob(16))), id, 1, 'Person',
  'En person i hushållets karta. Ger inte tillgång till Skyttel.' FROM household;
CREATE TABLE map_object (
  id TEXT PRIMARY KEY NOT NULL,
  householdId TEXT NOT NULL REFERENCES household(id),
  typeId TEXT NOT NULL REFERENCES object_type(id),
  revision INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX map_object_household ON map_object(householdId);
CREATE TABLE map_draft (
  householdId TEXT NOT NULL REFERENCES household(id),
  userId TEXT NOT NULL REFERENCES user(id),
  version INTEGER NOT NULL,
  changes TEXT NOT NULL,
  PRIMARY KEY(householdId, userId)
);
CREATE TABLE map_save (
  operationId TEXT NOT NULL,
  householdId TEXT NOT NULL REFERENCES household(id),
  userId TEXT NOT NULL REFERENCES user(id),
  draftVersion INTEGER NOT NULL,
  receipt TEXT NOT NULL,
  PRIMARY KEY(householdId, userId, operationId)
);
CREATE TABLE map_history (
  id INTEGER PRIMARY KEY,
  householdId TEXT NOT NULL REFERENCES household(id),
  userId TEXT NOT NULL REFERENCES user(id),
  operationId TEXT NOT NULL,
  savedAt TEXT NOT NULL,
  changes TEXT NOT NULL
);
