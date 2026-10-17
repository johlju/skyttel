-- Account presentation choices have no persistent browser copy.
CREATE TABLE theme_preferences (
  userId TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK(mode IN ('light', 'dark', 'system'))
);
