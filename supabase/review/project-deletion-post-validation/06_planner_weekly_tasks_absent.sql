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
  'weekly_remaining', (SELECT count(*) FROM public.planner_weekly_tasks
    WHERE id = ANY(s.deleted_weekly_ids) OR project_id = s.project_id::text
      OR (s.project_type = 'repeating' AND parent_rep = s.project_id::text)
      OR parent_rep = ANY(s.deleted_task_ids::text[])
      OR metadata_json->>'sourceTaskId' = ANY(s.deleted_task_ids::text[]))
) AS detail
FROM settings s;

COMMIT;
