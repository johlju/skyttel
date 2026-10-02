-- A Skyttel user's saved consent to conversations in one household. It follows
-- the membership and is not household content.
CREATE TABLE conversation_consent (
  householdId TEXT NOT NULL,
  userId TEXT NOT NULL,
  textVersion INTEGER NOT NULL CHECK(textVersion > 0),
  savedAt TEXT NOT NULL,
  PRIMARY KEY(householdId, userId),
  FOREIGN KEY (householdId, userId) REFERENCES membership(householdId, userId) ON DELETE CASCADE
);
