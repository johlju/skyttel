-- Installation measurements never reference household content or login identities.
CREATE TABLE cost_coverage (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  startedAt TEXT NOT NULL
);
INSERT INTO cost_coverage VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

CREATE TABLE cost_attempt (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('live', 'terra')),
  month TEXT NOT NULL,
  startedAt TEXT NOT NULL,
  endedAt TEXT,
  measurement TEXT NOT NULL,
  rates TEXT NOT NULL
);
CREATE INDEX cost_attempt_month ON cost_attempt(month);

-- Explicit revisions preserve the assumptions used for earlier calculations.
CREATE TABLE cost_assumptions (
  month TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version > 0),
  updatedAt TEXT NOT NULL,
  assumptions TEXT NOT NULL,
  PRIMARY KEY(month, version)
);
