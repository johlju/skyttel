ALTER TABLE map_relationship ADD COLUMN verb TEXT;
ALTER TABLE map_relationship ADD COLUMN reverseVerb TEXT;

-- Pin current wording on each saved relationship before categories can change.
UPDATE map_relationship SET
  verb = coalesce(
    (SELECT forwardLabel FROM relationship_type_labels WHERE typeId = map_relationship.typeId),
    (SELECT name FROM relationship_type WHERE id = map_relationship.typeId)
  ),
  reverseVerb = (SELECT reverseLabel FROM relationship_type_labels WHERE typeId = map_relationship.typeId);

DROP INDEX relationship_endpoints;
CREATE UNIQUE INDEX relationship_endpoints ON map_relationship
  (householdId, typeId, sourceId, coalesce(targetId, ''), coalesce(verb, '')) WHERE deleted = 0;
