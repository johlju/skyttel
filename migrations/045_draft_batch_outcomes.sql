-- Operational evidence, separate from conversation state and portable content.
-- No draft values, arguments, responses or intermediate snapshots are stored.
CREATE TABLE draft_batch_outcome (
  householdId TEXT NOT NULL REFERENCES household(id) ON DELETE CASCADE,
  userId TEXT NOT NULL,
  operationId TEXT NOT NULL,
  contentVersion INTEGER NOT NULL,
  fromVersion INTEGER NOT NULL,
  version INTEGER NOT NULL,
  appliedCount INTEGER NOT NULL,
  requestHash TEXT NOT NULL,
  draftHash TEXT NOT NULL,
  PRIMARY KEY(householdId, userId, operationId),
  FOREIGN KEY(householdId, userId) REFERENCES content_identity(householdId, id) ON DELETE CASCADE
);

-- Retain only the opaque identity after outcome retirement. Otherwise an old
-- operation could acquire a new effect against replacement content.
CREATE TRIGGER draft_batch_retire BEFORE DELETE ON draft_batch_outcome
BEGIN
  INSERT OR IGNORE INTO retired_operation
    SELECT OLD.householdId, OLD.operationId
    WHERE EXISTS (SELECT 1 FROM household WHERE id = OLD.householdId);
END;
CREATE TRIGGER draft_batch_content_cleanup
AFTER UPDATE OF contentVersion ON household
WHEN NEW.contentVersion != OLD.contentVersion
BEGIN
  DELETE FROM draft_batch_outcome WHERE householdId = NEW.id;
END;
