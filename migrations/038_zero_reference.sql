-- Fill only missing preferences. Preserve existing settings and their
-- optimistic-concurrency versions, including personal views without rows.
UPDATE personal_view_settings SET settings = json_insert(settings,
  '$.zeroReferenceVariant', 'circle',
  '$.zeroReferenceWeight', 'subtle',
  '$.zeroReferenceAlwaysVisible', json('false'),
  '$.zeroReferenceOnMovement', json('false'),
  '$.zeroReferenceTint', 0,
  '$.zeroReferenceKeepSize', json('false'));
