CREATE TABLE removed_type (
  kind TEXT NOT NULL CHECK (kind IN ('objectType', 'relationshipType')),
  typeId TEXT NOT NULL,
  PRIMARY KEY (kind, typeId)
);
