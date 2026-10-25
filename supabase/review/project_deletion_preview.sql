BEGIN TRANSACTION READ ONLY;

WITH settings AS (
  SELECT '3ad885b1-d2dc-43e2-931c-2d802ced63f8'::uuid AS project_id, 'home'::text AS project_type
), master AS (
  SELECT a.* FROM public.projects_all a CROSS JOIN settings s
  WHERE a.id = s.project_id AND a.project_type = s.project_type
    AND s.project_type IN ('home', 'vehicle', 'repeating', 'misc')
    AND s.project_id <> '00000000-0000-0000-0000-000000000000'::uuid
), tasks AS (
  SELECT t.* FROM public.planner_tasks t JOIN master m ON t.project_id = m.id::text
), weekly AS (
  SELECT w.* FROM public.planner_weekly_tasks w CROSS JOIN master m
  WHERE w.project_id = m.id::text
     OR (m.project_type = 'repeating' AND w.parent_rep = m.id::text)
     OR w.metadata_json->>'sourceTaskId' IN (SELECT id::text FROM tasks)
     OR w.parent_rep IN (SELECT id::text FROM tasks)
), parking AS (
  SELECT p.* FROM public.planner_parking_lot p CROSS JOIN master m
  WHERE p.converted_to_type IS TRUE AND (
    (p.metadata_json->>'conversionType' IN ('project', 'repeatable') AND p.converted_to_id = m.id::text)
    OR (p.metadata_json->>'conversionType' IN ('task-manager', 'ad-hoc')
        AND p.converted_to_id IN (SELECT id::text FROM tasks))
    OR (p.metadata_json->>'conversionType' = 'weekly' AND p.converted_to_id IN (SELECT id FROM weekly))
  )
), notifications AS (
  SELECT 'planner_tasks'::text AS relation, t.id::text AS id, r.path, r.reminder
  FROM tasks t CROSS JOIN LATERAL (VALUES
    ('metadata_json.reminder', t.metadata_json->'reminder'),
    ('metadata_json.reminderJson', t.metadata_json->'reminderJson')
  ) r(path, reminder)
  UNION ALL
  SELECT 'planner_weekly_tasks', w.id, r.path, r.reminder
  FROM weekly w CROSS JOIN LATERAL (VALUES
    ('reminder_json', w.reminder_json),
    ('metadata_json.reminder', w.metadata_json->'reminder'),
    ('metadata_json.reminderJson', w.metadata_json->'reminderJson')
  ) r(path, reminder)
), controls AS (
  (SELECT 'projects_' || a.project_type AS relation, a.id::text AS id, to_jsonb(a) AS snapshot
   FROM public.projects_all a CROSS JOIN settings s WHERE a.id <> s.project_id
   ORDER BY a.id LIMIT 1)
  UNION ALL
  (SELECT 'planner_tasks', t.id::text, to_jsonb(t) FROM public.planner_tasks t
   WHERE t.id NOT IN (SELECT id FROM tasks) ORDER BY t.id LIMIT 1)
  UNION ALL
  (SELECT 'planner_weekly_tasks', w.id, to_jsonb(w) FROM public.planner_weekly_tasks w
   WHERE w.id NOT IN (SELECT id FROM weekly) ORDER BY w.id LIMIT 1)
  UNION ALL
  (SELECT 'planner_parking_lot', p.id, to_jsonb(p) FROM public.planner_parking_lot p
   WHERE p.id NOT IN (SELECT id FROM parking) ORDER BY p.id LIMIT 1)
)
SELECT 'identity_check' AS section, jsonb_build_object(
  'uuid', s.project_id, 'type', s.project_type,
  'matching_type_masters', (SELECT count(*) FROM master),
  'all_uuid_masters', (SELECT count(*) FROM public.projects_all WHERE id = s.project_id)) AS detail
FROM settings s
UNION ALL SELECT 'master', to_jsonb(m) FROM master m
UNION ALL SELECT 'planner_tasks', to_jsonb(t) FROM tasks t
UNION ALL SELECT 'planner_weekly_tasks', to_jsonb(w) FROM weekly w
UNION ALL SELECT 'planner_parking_lot', to_jsonb(p) FROM parking p
UNION ALL SELECT 'control_snapshot', to_jsonb(c) FROM controls c
UNION ALL SELECT 'expected_counts', jsonb_build_object(
  'master', (SELECT count(*) FROM master),
  'planner_tasks', (SELECT count(*) FROM tasks),
  'planner_weekly_tasks', (SELECT count(*) FROM weekly),
  'planner_parking_lot', (SELECT count(*) FROM parking))
UNION ALL
SELECT 'ownership_conflict', to_jsonb(w) FROM weekly w CROSS JOIN master m
WHERE w.id = 'week-settings'
   OR (nullif(w.project_id, '') IS NOT NULL AND w.project_id <> m.id::text
       AND w.project_id NOT IN (SELECT id::text FROM tasks))
   OR (nullif(w.parent_rep, '') IS NOT NULL AND w.parent_rep <> m.id::text
       AND w.parent_rep NOT IN (SELECT id::text FROM tasks))
   OR (nullif(w.metadata_json->>'sourceTaskId', '') IS NOT NULL
       AND w.metadata_json->>'sourceTaskId' <> m.id::text
       AND w.metadata_json->>'sourceTaskId' NOT IN (SELECT id::text FROM tasks))
UNION ALL
SELECT 'active_remote_blocker', to_jsonb(n) FROM notifications n
WHERE lower(coalesce(n.reminder->>'active', '')) = 'true'
  AND (nullif(n.reminder->>'eventId', '') IS NOT NULL
    OR nullif(n.reminder->>'event_id', '') IS NOT NULL
    OR n.reminder->>'provider' IN ('google-calendar', 'google_calendar'))
UNION ALL
SELECT 'allocator_snapshot', jsonb_build_object('name', sequencename,
  'last_value', last_value, 'start_value', start_value, 'increment_by', increment_by)
FROM pg_catalog.pg_sequences
WHERE schemaname = 'public'
  AND sequencename IN ('projects_home_external_id_seq', 'projects_vehicle_external_id_seq',
                      'projects_repeating_external_id_seq', 'projects_misc_external_id_seq')
ORDER BY section, detail;

COMMIT;
