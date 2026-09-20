CREATE TABLE login_link (
  sessionId TEXT PRIMARY KEY REFERENCES session(id) ON DELETE CASCADE,
  userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  state TEXT UNIQUE,
  provider TEXT NOT NULL,
  stage TEXT NOT NULL CHECK(stage IN ('prove', 'verified', 'add', 'complete', 'failed')),
  expiresAt INTEGER NOT NULL
);
