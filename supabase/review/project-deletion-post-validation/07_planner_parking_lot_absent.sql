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
  'parking_remaining', (SELECT count(*) FROM public.planner_parking_lot
    WHERE id = ANY(s.deleted_parking_ids)
       OR (converted_to_type IS TRUE AND (
         (metadata_json->>'conversionType' IN ('project', 'repeatable')
          AND converted_to_id = s.project_id::text)
         OR (metadata_json->>'conversionType' IN ('task-manager', 'ad-hoc')
           AND converted_to_id = ANY(s.deleted_task_ids::text[]))
         OR (metadata_json->>'conversionType' = 'weekly'
           AND converted_to_id = ANY(s.deleted_weekly_ids)))))
) AS detail
FROM settings s;

COMMIT;
