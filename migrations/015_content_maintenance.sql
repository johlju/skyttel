-- Historical content ownership is independent of authentication and membership.
CREATE TABLE content_identity (
  householdId TEXT NOT NULL REFERENCES household(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  userId TEXT REFERENCES user(id) ON DELETE SET NULL,
  PRIMARY KEY(householdId, id),
  UNIQUE(householdId, userId)
);
INSERT INTO content_identity (householdId, id, name, userId)
SELECT DISTINCT owners.householdId, owners.userId, user.name, owners.userId FROM (
  SELECT householdId, userId FROM membership
  UNION SELECT householdId, userId FROM map_draft
  UNION SELECT householdId, userId FROM map_save
  UNION SELECT householdId, userId FROM map_history
  UNION SELECT householdId, userId FROM map_operation
  UNION SELECT householdId, createdBy AS userId FROM profile_image
  UNION SELECT householdId, userId FROM personal_position
  UNION SELECT householdId, userId FROM personal_view_settings
) owners JOIN user ON user.id = owners.userId;

-- A newly admitted member gets a new owner; matching archive IDs do not bind it.
CREATE TRIGGER membership_content_identity AFTER INSERT ON membership
WHEN NOT EXISTS (SELECT 1 FROM content_identity
  WHERE householdId = NEW.householdId AND userId = NEW.userId)
BEGIN
  INSERT INTO content_identity (householdId, id, name, userId)
  SELECT NEW.householdId,
    CASE WHEN EXISTS (SELECT 1 FROM content_identity
      WHERE householdId = NEW.householdId AND id = NEW.userId)
    THEN lower(hex(randomblob(16))) ELSE NEW.userId END,
    user.name, user.id FROM user WHERE id = NEW.userId;
END;

DROP TRIGGER household_content_version_cleanup;

CREATE TABLE map_draft_replacement (
  householdId TEXT NOT NULL REFERENCES household(id),
  userId TEXT NOT NULL,
  version INTEGER NOT NULL,
  changes TEXT NOT NULL, relationships TEXT NOT NULL DEFAULT '[]', objectTypes TEXT NOT NULL DEFAULT '[]', relationshipTypes TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY(householdId, userId),
  FOREIGN KEY(householdId, userId) REFERENCES content_identity(householdId, id)
);
INSERT INTO map_draft_replacement SELECT * FROM map_draft;
DROP TABLE map_draft;
ALTER TABLE map_draft_replacement RENAME TO map_draft;

CREATE TABLE map_save_replacement (
  operationId TEXT NOT NULL,
  householdId TEXT NOT NULL REFERENCES household(id),
  userId TEXT NOT NULL,
  draftVersion INTEGER NOT NULL,
  receipt TEXT NOT NULL,
  PRIMARY KEY(householdId, userId, operationId),
  FOREIGN KEY(householdId, userId) REFERENCES content_identity(householdId, id)
);
INSERT INTO map_save_replacement SELECT * FROM map_save;
DROP TABLE map_save;
ALTER TABLE map_save_replacement RENAME TO map_save;

CREATE TABLE map_history_replacement (
  id INTEGER PRIMARY KEY,
  householdId TEXT NOT NULL REFERENCES household(id),
  userId TEXT NOT NULL,
  operationId TEXT NOT NULL,
  savedAt TEXT NOT NULL,
  changes TEXT NOT NULL,
  FOREIGN KEY(householdId, userId) REFERENCES content_identity(householdId, id)
);
INSERT INTO map_history_replacement SELECT * FROM map_history;
DROP TABLE map_history;
ALTER TABLE map_history_replacement RENAME TO map_history;

CREATE TABLE map_operation_replacement (
  operationId TEXT NOT NULL,
  householdId TEXT NOT NULL REFERENCES household(id) ON DELETE CASCADE,
  userId TEXT NOT NULL,
  draftVersion INTEGER NOT NULL,
  contentVersion INTEGER NOT NULL,
  createdAt TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending', 'succeeded', 'rejected')),
  draftHash TEXT,
  error TEXT,
  errorStatus INTEGER,
  PRIMARY KEY(householdId, userId, operationId),
  FOREIGN KEY(householdId, userId) REFERENCES content_identity(householdId, id)
);
INSERT INTO map_operation_replacement SELECT * FROM map_operation;
DROP TABLE map_operation;
ALTER TABLE map_operation_replacement RENAME TO map_operation;

CREATE TABLE profile_image_replacement (
  id TEXT PRIMARY KEY NOT NULL,
  householdId TEXT NOT NULL REFERENCES household(id),
  objectId TEXT NOT NULL,
  createdBy TEXT NOT NULL,
  bytes BLOB NOT NULL CHECK (length(bytes) BETWEEN 1 AND 262144),
  width INTEGER NOT NULL CHECK (width BETWEEN 1 AND 300),
  height INTEGER NOT NULL CHECK (height BETWEEN 1 AND 300),
  FOREIGN KEY(householdId, createdBy) REFERENCES content_identity(householdId, id)
);
INSERT INTO profile_image_replacement SELECT * FROM profile_image;
DROP TABLE profile_image;
ALTER TABLE profile_image_replacement RENAME TO profile_image;

CREATE TABLE personal_position_replacement (
  householdId TEXT NOT NULL REFERENCES household(id) ON DELETE CASCADE,
  userId TEXT NOT NULL,
  objectId TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version > 0),
  x REAL NOT NULL,
  y REAL NOT NULL,
  z REAL NOT NULL,
  PRIMARY KEY(householdId, userId, objectId),
  FOREIGN KEY(householdId, userId) REFERENCES content_identity(householdId, id)
);
INSERT INTO personal_position_replacement SELECT * FROM personal_position;
DROP TABLE personal_position;
ALTER TABLE personal_position_replacement RENAME TO personal_position;

CREATE TABLE personal_view_settings_replacement (
  householdId TEXT NOT NULL REFERENCES household(id) ON DELETE CASCADE,
  userId TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version > 0),
  settings TEXT NOT NULL,
  PRIMARY KEY(householdId, userId),
  FOREIGN KEY(householdId, userId) REFERENCES content_identity(householdId, id)
);
INSERT INTO personal_view_settings_replacement SELECT * FROM personal_view_settings;
DROP TABLE personal_view_settings;
ALTER TABLE personal_view_settings_replacement RENAME TO personal_view_settings;

CREATE INDEX map_operation_recent ON map_operation(householdId, userId, contentVersion, createdAt);

CREATE INDEX profile_image_household ON profile_image(householdId);

-- Imported attempts are historical evidence, never resumable live operations.
CREATE TABLE historical_operation (
  operationId TEXT NOT NULL,
  householdId TEXT NOT NULL REFERENCES household(id) ON DELETE CASCADE,
  userId TEXT NOT NULL,
  draftVersion INTEGER NOT NULL,
  contentVersion INTEGER NOT NULL,
  createdAt TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending', 'succeeded', 'rejected')),
  draftHash TEXT,
  error TEXT,
  errorStatus INTEGER,
  PRIMARY KEY(householdId, userId, operationId),
  FOREIGN KEY(householdId, userId) REFERENCES content_identity(householdId, id)
);
CREATE TABLE retired_operation (
  householdId TEXT NOT NULL REFERENCES household(id) ON DELETE CASCADE,
  operationId TEXT NOT NULL,
  PRIMARY KEY(householdId, operationId)
);
CREATE TRIGGER household_content_version_cleanup
AFTER UPDATE OF contentVersion ON household
WHEN NEW.contentVersion != OLD.contentVersion
BEGIN
  INSERT OR IGNORE INTO retired_operation SELECT householdId, operationId
    FROM map_operation WHERE householdId = NEW.id;
  DELETE FROM map_operation WHERE householdId = NEW.id;
END;

-- The active gate commits before asynchronous export invalidation or cleanup.
CREATE TABLE content_maintenance (
  id TEXT NOT NULL,
  householdId TEXT NOT NULL REFERENCES household(id) ON DELETE CASCADE,
  actorId TEXT NOT NULL REFERENCES user(id),
  kind TEXT NOT NULL CHECK(kind IN ('import', 'erase')),
  phase TEXT NOT NULL CHECK(phase IN ('prepared', 'cleanup', 'completed', 'failed')),
  contentVersion INTEGER NOT NULL CHECK(contentVersion > 0),
  requestHash TEXT NOT NULL,
  payload TEXT,
  counts TEXT NOT NULL DEFAULT '{}',
  error TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  PRIMARY KEY(householdId, id)
);
CREATE UNIQUE INDEX content_maintenance_active ON content_maintenance(householdId)
  WHERE phase IN ('prepared', 'cleanup');
