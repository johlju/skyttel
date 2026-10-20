DROP TABLE object_type_fields;
DROP TABLE relationship_type_fields;
ALTER TABLE map_object DROP COLUMN description;
ALTER TABLE map_object DROP COLUMN customValues;
ALTER TABLE map_object DROP COLUMN financialFacts;
ALTER TABLE map_relationship DROP COLUMN knowledge;
ALTER TABLE map_relationship DROP COLUMN endDate;
ALTER TABLE map_relationship DROP COLUMN customValues;
