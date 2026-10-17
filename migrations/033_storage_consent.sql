-- Preserve the original authentication time while recording a later explicit
-- activation. Results remain finite recovery records, not a choice history.
ALTER TABLE session ADD COLUMN activatedAt INTEGER;

ALTER TABLE storage_action_result RENAME TO storage_action_result_old;
CREATE TABLE storage_action_result (
  id TEXT PRIMARY KEY NOT NULL,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('revoke', 'activate')),
  status TEXT NOT NULL CHECK(status = 'completed'),
  completedAt INTEGER NOT NULL,
  checkUntil INTEGER NOT NULL,
  sessionExpiresAt INTEGER NOT NULL
);
INSERT INTO storage_action_result SELECT * FROM storage_action_result_old;
DROP TABLE storage_action_result_old;
CREATE INDEX storage_action_result_expiry ON storage_action_result(checkUntil);

CREATE TABLE policy_contact (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  email TEXT NOT NULL
);
