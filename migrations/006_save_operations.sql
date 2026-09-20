ALTER TABLE household ADD COLUMN contentVersion INTEGER NOT NULL DEFAULT 1
  CHECK(contentVersion > 0);

CREATE TABLE map_operation (
  operationId TEXT NOT NULL,
  householdId TEXT NOT NULL REFERENCES household(id) ON DELETE CASCADE,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  draftVersion INTEGER NOT NULL,
  contentVersion INTEGER NOT NULL,
  createdAt TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending', 'succeeded', 'rejected')),
  draftHash TEXT,
  error TEXT,
  errorStatus INTEGER,
  PRIMARY KEY(householdId, userId, operationId)
);
CREATE INDEX map_operation_recent ON map_operation(householdId, userId, contentVersion, createdAt);

UPDATE map_save SET receipt = json_set(receipt, '$.contentVersion', 1);
INSERT INTO map_operation
  (operationId, householdId, userId, draftVersion, contentVersion, createdAt, status)
SELECT operationId, householdId, userId, draftVersion, 1,
  json_extract(receipt, '$.savedAt'), 'succeeded'
FROM map_save;

-- Content replacement must advance the generation in its own atomic transaction.
CREATE TRIGGER household_content_version_monotonic
BEFORE UPDATE OF contentVersion ON household
WHEN NEW.contentVersion < OLD.contentVersion
BEGIN
  SELECT RAISE(ABORT, 'content_version_must_increase');
END;

CREATE TRIGGER household_content_version_cleanup
AFTER UPDATE OF contentVersion ON household
WHEN NEW.contentVersion != OLD.contentVersion
BEGIN
  DELETE FROM map_operation WHERE householdId = NEW.id;
  DELETE FROM map_save WHERE householdId = NEW.id;
  DELETE FROM map_history WHERE householdId = NEW.id;
  DELETE FROM map_draft WHERE householdId = NEW.id;
END;
