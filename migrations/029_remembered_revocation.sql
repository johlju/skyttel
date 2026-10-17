ALTER TABLE session ADD COLUMN ordinaryStartedAt INTEGER;
ALTER TABLE session ADD COLUMN lastActivityAt INTEGER;

CREATE TABLE storage_action_result (
  id TEXT PRIMARY KEY NOT NULL,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind = 'revoke'),
  status TEXT NOT NULL CHECK(status = 'completed'),
  completedAt INTEGER NOT NULL,
  checkUntil INTEGER NOT NULL,
  sessionExpiresAt INTEGER NOT NULL
);
CREATE INDEX storage_action_result_expiry ON storage_action_result(checkUntil);
