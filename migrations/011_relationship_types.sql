CREATE TABLE relationship_type_labels (
  typeId TEXT PRIMARY KEY NOT NULL REFERENCES relationship_type(id) ON DELETE CASCADE,
  forwardLabel TEXT NOT NULL,
  reverseLabel TEXT NOT NULL
);
ALTER TABLE map_draft ADD COLUMN relationshipTypes TEXT NOT NULL DEFAULT '[]';
