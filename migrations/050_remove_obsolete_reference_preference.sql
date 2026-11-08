-- Remove only the unused preference; retain active settings and their versions.
UPDATE personal_view_settings
SET settings = json_remove(settings, '$.zeroReferenceKeepSize')
WHERE json_type(settings, '$.zeroReferenceKeepSize') IS NOT NULL;
