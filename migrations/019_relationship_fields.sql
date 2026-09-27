CREATE TABLE relationship_type_fields (
  typeId TEXT PRIMARY KEY NOT NULL REFERENCES relationship_type(id) ON DELETE CASCADE,
  fields TEXT NOT NULL
);
ALTER TABLE map_relationship ADD COLUMN customValues TEXT;
