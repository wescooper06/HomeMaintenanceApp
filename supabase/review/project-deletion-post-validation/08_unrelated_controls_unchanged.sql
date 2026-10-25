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
), controls AS (
  SELECT c.* FROM settings s CROSS JOIN LATERAL
    jsonb_to_recordset(s.expected_controls) c(relation text, id text, snapshot jsonb)
), current_controls AS (
  SELECT 'projects_' || a.project_type AS relation, a.id::text AS id, to_jsonb(a) AS snapshot
  FROM public.projects_all a WHERE a.id::text IN (SELECT id FROM controls)
  UNION ALL
  SELECT 'planner_tasks', t.id::text, to_jsonb(t) FROM public.planner_tasks t
  WHERE t.id::text IN (SELECT id FROM controls)
  UNION ALL
  SELECT 'planner_weekly_tasks', w.id, to_jsonb(w) FROM public.planner_weekly_tasks w
  WHERE w.id IN (SELECT id FROM controls)
  UNION ALL
  SELECT 'planner_parking_lot', p.id, to_jsonb(p) FROM public.planner_parking_lot p
  WHERE p.id IN (SELECT id FROM controls)
)
SELECT 'control_validation' AS section, jsonb_build_object(
  'controls_supplied', (SELECT count(*) FROM controls),
  'all_unchanged', EXISTS (SELECT 1 FROM controls) AND NOT EXISTS (
    SELECT 1 FROM controls c LEFT JOIN current_controls n
      ON n.relation = c.relation AND n.id = c.id
    WHERE n.snapshot IS DISTINCT FROM c.snapshot)
) AS detail;

COMMIT;
