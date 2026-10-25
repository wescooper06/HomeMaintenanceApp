BEGIN TRANSACTION READ ONLY;

WITH settings AS (
  -- Copy identities from the saved pre-delete preview, not titles or guessed IDs.
  SELECT '00000000-0000-0000-0000-000000000000'::uuid AS project_id,
         'home'::text AS project_type,
         ''::text AS external_id,
         ARRAY[]::uuid[] AS deleted_task_ids,
         ARRAY[]::text[] AS deleted_weekly_ids,
         ARRAY[]::text[] AS deleted_parking_ids,
         false AS preview_identities_copied,
         '[]'::jsonb AS expected_controls
)
SELECT 'validation' AS section, jsonb_build_object(
  'inputs_ready', s.preview_identities_copied
    AND s.project_id <> '00000000-0000-0000-0000-000000000000'::uuid
    AND s.project_type IN ('home', 'vehicle', 'repeating', 'misc') AND s.external_id <> ''
) AS detail
FROM settings s;

COMMIT;
