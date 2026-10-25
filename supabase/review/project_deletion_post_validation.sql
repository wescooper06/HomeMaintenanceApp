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
SELECT 'validation' AS section, jsonb_build_object(
  'inputs_ready', s.preview_identities_copied
    AND s.project_id <> '00000000-0000-0000-0000-000000000000'::uuid
    AND s.project_type IN ('home', 'vehicle', 'repeating', 'misc') AND s.external_id <> '',
  'raw_uuid_remaining', (
    SELECT count(*) FROM (
      SELECT id FROM public.projects_home UNION ALL SELECT id FROM public.projects_vehicle
      UNION ALL SELECT id FROM public.projects_repeating UNION ALL SELECT id FROM public.projects_misc
    ) raw WHERE raw.id = s.project_id),
  'view_uuid_remaining', (SELECT count(*) FROM public.projects_all WHERE id = s.project_id),
  'view_external_id_remaining', (SELECT count(*) FROM public.projects_all
    WHERE project_type = s.project_type AND external_id = s.external_id),
  'tasks_remaining', (SELECT count(*) FROM public.planner_tasks
    WHERE project_id = s.project_id::text OR id = ANY(s.deleted_task_ids)),
  'weekly_remaining', (SELECT count(*) FROM public.planner_weekly_tasks
    WHERE id = ANY(s.deleted_weekly_ids) OR project_id = s.project_id::text
      OR (s.project_type = 'repeating' AND parent_rep = s.project_id::text)
      OR parent_rep = ANY(s.deleted_task_ids::text[])
      OR metadata_json->>'sourceTaskId' = ANY(s.deleted_task_ids::text[])),
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
FROM settings s
UNION ALL
SELECT 'control_validation', jsonb_build_object(
  'controls_supplied', (SELECT count(*) FROM controls),
  'all_unchanged', EXISTS (SELECT 1 FROM controls) AND NOT EXISTS (
    SELECT 1 FROM controls c LEFT JOIN current_controls n
      ON n.relation = c.relation AND n.id = c.id
    WHERE n.snapshot IS DISTINCT FROM c.snapshot))
UNION ALL
SELECT 'allocator_snapshot', jsonb_build_object('name', sequencename,
  'last_value', last_value, 'start_value', start_value, 'increment_by', increment_by)
FROM pg_catalog.pg_sequences
WHERE schemaname = 'public'
  AND sequencename IN ('projects_home_external_id_seq', 'projects_vehicle_external_id_seq',
                      'projects_repeating_external_id_seq', 'projects_misc_external_id_seq')
ORDER BY section, detail;

COMMIT;
