CREATE TABLE conversation_model_preferences (
  userId TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  effort TEXT NOT NULL
);
