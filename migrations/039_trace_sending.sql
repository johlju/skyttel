CREATE TABLE trace_sending (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  suspension TEXT CHECK (suspension IN ('quota', 'credentials'))
);
