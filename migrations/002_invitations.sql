CREATE TABLE invitation (
  id TEXT PRIMARY KEY NOT NULL,
  householdId TEXT NOT NULL REFERENCES household(id) ON DELETE CASCADE,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  codeHash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK(status IN ('pending', 'accepted', 'revoked')),
  createdAt TEXT NOT NULL,
  expiresAt TEXT NOT NULL
);
CREATE INDEX invitation_householdId ON invitation(householdId);
CREATE UNIQUE INDEX invitation_pending_recipient
  ON invitation(householdId, userId) WHERE status = 'pending';
