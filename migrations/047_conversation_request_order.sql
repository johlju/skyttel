-- Arrival order survives process loss independently of conversation hydration.
CREATE TABLE conversation_request_order (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  nextSequence INTEGER NOT NULL CHECK (nextSequence >= 0)
);

INSERT INTO conversation_request_order (id, nextSequence)
SELECT 1, COALESCE(MAX(sequence), -1) + 1 FROM (
  SELECT json_extract(state, '$.activeMessage.sequence') AS sequence FROM conversation
  UNION ALL
  SELECT json_extract(message.value, '$.sequence') AS sequence
  FROM conversation, json_each(conversation.state, '$.queue') AS message
  UNION ALL
  SELECT json_extract(state, '$.failedWork.message.sequence') AS sequence FROM conversation
);
