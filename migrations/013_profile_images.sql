CREATE TABLE profile_image (
  id TEXT PRIMARY KEY NOT NULL,
  householdId TEXT NOT NULL REFERENCES household(id),
  objectId TEXT NOT NULL,
  createdBy TEXT NOT NULL REFERENCES user(id),
  bytes BLOB NOT NULL CHECK (length(bytes) BETWEEN 1 AND 262144),
  width INTEGER NOT NULL CHECK (width BETWEEN 1 AND 300),
  height INTEGER NOT NULL CHECK (height BETWEEN 1 AND 300)
);
CREATE INDEX profile_image_household ON profile_image(householdId);
ALTER TABLE map_object ADD COLUMN profileImageId TEXT REFERENCES profile_image(id);
