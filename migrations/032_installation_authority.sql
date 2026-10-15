-- The operator's generation and fixed restore declaration live outside the
-- restored volume. This row only identifies which declaration this database
-- has applied; it cannot independently establish that a restore is safe.
CREATE TABLE installation_authority (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  generation TEXT NOT NULL,
  restoredFrom TEXT,
  restoredAt INTEGER
);
