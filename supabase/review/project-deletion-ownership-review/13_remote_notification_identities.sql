BEGIN TRANSACTION READ ONLY;

WITH records AS (
  SELECT 'planner_weekly_tasks'::text AS relation_name, to_jsonb(w) AS document
  FROM public.planner_weekly_tasks w
  UNION ALL
  SELECT 'weekly_tasks', to_jsonb(w) FROM public.weekly_tasks w
  UNION ALL
  SELECT 'planner_parking_lot', to_jsonb(p) FROM public.planner_parking_lot p
  UNION ALL
  SELECT 'parking_lot', to_jsonb(p) FROM public.parking_lot p
  UNION ALL
  SELECT 'planner_tasks', to_jsonb(t) FROM public.planner_tasks t
  UNION ALL
  SELECT 'task_manager', to_jsonb(t) FROM public.task_manager t
  UNION ALL
  SELECT 'curated_queue', to_jsonb(q) FROM public.curated_queue q
  UNION ALL
  SELECT 'staged_queue', to_jsonb(q) FROM public.staged_queue q
), reminders AS (
  SELECT r.*, value.path, value.reminder
  FROM records r CROSS JOIN LATERAL (VALUES
    ('reminder_json', r.document->'reminder_json'),
    ('reminderJson', r.document->'reminderJson'),
    ('metadata_json.reminder', r.document #> '{metadata_json,reminder}'),
    ('metadataJson.reminder', r.document #> '{metadataJson,reminder}'),
    ('item.reminder', r.document #> '{item,reminder}'),
    ('item.reminderJson', r.document #> '{item,reminderJson}')
  ) value(path, reminder)
  WHERE value.reminder IS NOT NULL AND value.reminder <> 'null'::jsonb
), identity_rows AS (
  SELECT 'planner_tasks'::text AS relation_name, to_jsonb(t) AS document FROM public.planner_tasks t
  UNION ALL SELECT 'task_manager', to_jsonb(t) FROM public.task_manager t
  UNION ALL SELECT 'planner_weekly_tasks', to_jsonb(w) FROM public.planner_weekly_tasks w
  UNION ALL SELECT 'weekly_tasks', to_jsonb(w) FROM public.weekly_tasks w
  UNION ALL SELECT 'project_registry', to_jsonb(r) FROM public.project_registry r
  UNION ALL SELECT 'repeatable_masters', to_jsonb(m) FROM public.repeatable_masters m
  UNION ALL SELECT 'repeatable_overrides', to_jsonb(o) FROM public.repeatable_overrides o
)
SELECT count(*) OVER () AS total_notification_candidates,
       r.relation_name, r.document->>'id' AS record_id,
       r.document->>'profileId' AS profile_id,
       r.document->>'taskId' AS queue_task_id,
       r.document->>'source' AS source, r.path AS reminder_path, r.reminder,
       CASE WHEN r.reminder->>'active' = 'true' THEN 'active: block if project ownership verified'
            ELSE 'unknown active state: review before deletion' END AS review_status,
       r.document - 'title' - 'notes' AS owning_record_context,
       masters.candidates AS direct_master_candidates,
       links.candidates AS linked_identity_candidates
FROM reminders r
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object('uuid', a.id, 'type', a.project_type,
           'external_id', a.external_id, 'field', ref.field,
           'identity', ref.identity, 'uuid_match', ref.identity = a.id::text)) AS candidates
  FROM (VALUES
    ('project_id', r.document->>'project_id'), ('projectId', r.document->>'projectId'),
    ('parent_rep', r.document->>'parent_rep'),
    ('parentRepeatableId', r.document->>'parentRepeatableId'),
    ('converted_to_id', r.document->>'converted_to_id'),
    ('convertedTo.id', r.document #>> '{convertedTo,id}'),
    ('metadata_json.sourceTaskId', r.document #>> '{metadata_json,sourceTaskId}'),
    ('metadataJson.sourceTaskId', r.document #>> '{metadataJson,sourceTaskId}'),
    ('item.projectId', r.document #>> '{item,projectId}'),
    ('item.parentRepeatableId', r.document #>> '{item,parentRepeatableId}')
  ) ref(field, identity)
  JOIN public.projects_all a
    ON a.id::text = nullif(ref.identity, '') OR a.external_id = nullif(ref.identity, '')
) masters ON true
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object('table', target.relation_name,
           'matched_field', ref.field, 'identity', ref.identity,
           'target', target.document - 'title' - 'notes')) AS candidates
  FROM (VALUES
    ('project_id', r.document->>'project_id'), ('projectId', r.document->>'projectId'),
    ('parent_rep', r.document->>'parent_rep'),
    ('parentRepeatableId', r.document->>'parentRepeatableId'),
    ('project_registry_id', r.document->>'project_registry_id'),
    ('converted_to_id', r.document->>'converted_to_id'),
    ('convertedTo.id', r.document #>> '{convertedTo,id}'),
    ('taskId', r.document->>'taskId'),
    ('metadata_json.sourceTaskId', r.document #>> '{metadata_json,sourceTaskId}'),
    ('metadataJson.sourceTaskId', r.document #>> '{metadataJson,sourceTaskId}'),
    ('item.id', r.document #>> '{item,id}'), ('item.taskId', r.document #>> '{item,taskId}')
  ) ref(field, identity)
  JOIN identity_rows target ON target.document->>'id' = nullif(ref.identity, '')
) links ON true
WHERE lower(btrim(coalesce(r.reminder->>'active', ''))) <> 'false'
  AND (nullif(btrim(r.reminder->>'eventId'), '') IS NOT NULL
       OR nullif(btrim(r.reminder->>'event_id'), '') IS NOT NULL
       OR lower(btrim(coalesce(r.reminder->>'provider', ''))) IN ('google-calendar', 'google_calendar'))
ORDER BY r.relation_name, r.document->>'profileId', r.document->>'id', r.document->>'taskId', r.path;

COMMIT;
