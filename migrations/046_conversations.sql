-- Conversation content is independent of map drafts and registered operations.
CREATE TABLE conversation (
  id TEXT PRIMARY KEY,
  householdId TEXT NOT NULL,
  userId TEXT NOT NULL,
  browserBindingId TEXT NOT NULL,
  owner TEXT NOT NULL,
  contentVersion INTEGER NOT NULL,
  expiresAt INTEGER NOT NULL,
  state TEXT NOT NULL,
  FOREIGN KEY (householdId, userId) REFERENCES membership(householdId, userId) ON DELETE CASCADE
);
CREATE INDEX conversation_browser ON conversation(userId, householdId, browserBindingId);
CREATE INDEX conversation_expiry ON conversation(expiresAt);
CREATE TRIGGER conversation_content_changed AFTER UPDATE OF contentVersion ON household
WHEN OLD.contentVersion != NEW.contentVersion
BEGIN
  DELETE FROM conversation WHERE householdId = NEW.id;
END;
