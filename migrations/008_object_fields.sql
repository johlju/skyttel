CREATE TABLE object_type_fields (
  typeId TEXT PRIMARY KEY NOT NULL REFERENCES object_type(id) ON DELETE CASCADE,
  fields TEXT NOT NULL
);
ALTER TABLE map_object ADD COLUMN customValues TEXT;
ALTER TABLE map_draft ADD COLUMN objectTypes TEXT NOT NULL DEFAULT '[]';
