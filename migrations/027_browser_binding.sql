CREATE TABLE browser_binding (
  id TEXT PRIMARY KEY NOT NULL,
  confirmed INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 0,
  sessionId TEXT REFERENCES session(id) ON DELETE SET NULL,
  expiresAt INTEGER NOT NULL
);
CREATE UNIQUE INDEX browser_binding_session ON browser_binding(sessionId);

CREATE TABLE browser_binding_attempt (
  state TEXT PRIMARY KEY NOT NULL,
  bindingId TEXT NOT NULL REFERENCES browser_binding(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  sessionId TEXT,
  expiresAt INTEGER NOT NULL
);
CREATE INDEX browser_binding_attempt_binding ON browser_binding_attempt(bindingId);
