CREATE TABLE personal_position (
  householdId TEXT NOT NULL REFERENCES household(id) ON DELETE CASCADE,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  objectId TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version > 0),
  x REAL NOT NULL,
  y REAL NOT NULL,
  z REAL NOT NULL,
  PRIMARY KEY(householdId, userId, objectId)
);
CREATE TABLE personal_view_settings (
  householdId TEXT NOT NULL REFERENCES household(id) ON DELETE CASCADE,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK(version > 0),
  settings TEXT NOT NULL,
  PRIMARY KEY(householdId, userId)
);
