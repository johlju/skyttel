-- Presentation choices belong to the user, across households and devices.
CREATE TABLE conversation_preferences (
  userId TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
  showDraftOnStart INTEGER NOT NULL DEFAULT 0 CHECK(showDraftOnStart IN (0, 1))
);
