-- Every existing content owner represents an existing view, even when there
-- are no saved settings or placements. The marker is independent of the
-- optimistic concurrency version; an implicit view keeps version zero.
CREATE TABLE personal_view_settings_replacement (
  householdId TEXT NOT NULL REFERENCES household(id) ON DELETE CASCADE,
  userId TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version >= 0),
  settings TEXT NOT NULL,
  backgroundVersion INTEGER NOT NULL DEFAULT 1 CHECK(backgroundVersion = 1),
  PRIMARY KEY(householdId, userId),
  FOREIGN KEY(householdId, userId) REFERENCES content_identity(householdId, id)
);
INSERT INTO personal_view_settings_replacement
  (householdId, userId, version, settings, backgroundVersion)
SELECT identity.householdId, identity.id, coalesce(old.version, 0),
  json_set(
    json_remove(coalesce(old.settings,
      '{"invertX":false,"invertY":false,"axisCorner":"bottom-right","axisPinned":false,"allLabels":false}'), '$.stars'),
    '$.background', json(CASE WHEN json_extract(old.settings, '$.stars') = 1 THEN 'true' ELSE 'false' END),
    '$.lightBackground', 'pearl',
    '$.darkBackground', CASE WHEN json_extract(old.settings, '$.stars') = 1 THEN 'mist' ELSE 'atmosphere' END,
    '$.panStrength', 0.7, '$.zoomStrength', 0.7, '$.layerDistance', 1.0),
  1
FROM content_identity identity
LEFT JOIN personal_view_settings old
  ON old.householdId = identity.householdId AND old.userId = identity.id;
DROP TABLE personal_view_settings;
ALTER TABLE personal_view_settings_replacement RENAME TO personal_view_settings;
