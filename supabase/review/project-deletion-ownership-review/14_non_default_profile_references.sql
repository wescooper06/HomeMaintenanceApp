BEGIN TRANSACTION READ ONLY;

WITH entries AS (
  SELECT 'parking_lot'::text AS relation_name, to_jsonb(p) AS document
  FROM public.parking_lot p
  WHERE p."profileId" IS DISTINCT FROM 'default'
  UNION ALL
  SELECT 'curated_queue', to_jsonb(q) FROM public.curated_queue q
  WHERE q."profileId" IS DISTINCT FROM 'default'
  UNION ALL
  SELECT 'staged_queue', to_jsonb(q) FROM public.staged_queue q
  WHERE q."profileId" IS DISTINCT FROM 'default'
), identity_rows AS (
  SELECT 'planner_tasks'::text AS relation_name, to_jsonb(t) AS document FROM public.planner_tasks t
  UNION ALL SELECT 'task_manager', to_jsonb(t) FROM public.task_manager t
  UNION ALL SELECT 'planner_weekly_tasks', to_jsonb(w) FROM public.planner_weekly_tasks w
  UNION ALL SELECT 'weekly_tasks', to_jsonb(w) FROM public.weekly_tasks w
  UNION ALL SELECT 'project_registry', to_jsonb(r) FROM public.project_registry r
  UNION ALL SELECT 'repeatable_masters', to_jsonb(m) FROM public.repeatable_masters m
  UNION ALL SELECT 'repeatable_overrides', to_jsonb(o) FROM public.repeatable_overrides o
), refs AS (
  SELECT e.*, ref.field, ref.identity
  FROM entries e CROSS JOIN LATERAL (VALUES
    ('taskId', e.document->>'taskId'),
    ('convertedTo.id', e.document #>> '{convertedTo,id}'),
    ('convertedFromParking', e.document->>'convertedFromParking'),
    ('metadataJson.projectId', e.document #>> '{metadataJson,projectId}'),
    ('metadataJson.externalId', e.document #>> '{metadataJson,externalId}'),
    ('metadataJson.external_id', e.document #>> '{metadataJson,external_id}'),
    ('metadataJson.sourceTaskId', e.document #>> '{metadataJson,sourceTaskId}'),
    ('item.id', e.document #>> '{item,id}'),
    ('item.taskId', e.document #>> '{item,taskId}'),
    ('item.projectId', e.document #>> '{item,projectId}'),
    ('item.project_id', e.document #>> '{item,project_id}'),
    ('item.parentRepeatableId', e.document #>> '{item,parentRepeatableId}'),
    ('item.externalId', e.document #>> '{item,externalId}'),
    ('item.external_id', e.document #>> '{item,external_id}'),
    ('item.metadata.sourceTaskId', e.document #>> '{item,metadata,sourceTaskId}')
  ) ref(field, identity)
  WHERE nullif(btrim(ref.identity), '') IS NOT NULL
)
SELECT count(*) OVER () AS total_reference_candidates,
       current_user AS execution_role,
       roles.rolbypassrls AS executing_role_bypasses_rls,
       r.relation_name, r.document->>'profileId' AS profile_id,
       r.document->>'id' AS record_id, r.document->>'taskId' AS queue_task_id,
       r.field AS identity_field, r.identity,
       r.document - 'title' - 'notes' AS record_context,
       masters.candidates AS direct_master_candidates,
       links.candidates AS linked_record_candidates
FROM refs r
JOIN pg_roles roles ON roles.rolname = current_user
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object('uuid', a.id, 'type', a.project_type,
           'external_id', a.external_id, 'uuid_match', a.id::text = r.identity))
         AS candidates
  FROM public.projects_all a WHERE a.id::text = r.identity OR a.external_id = r.identity
) masters ON true
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object('table', target.relation_name,
           'target', target.document - 'title' - 'notes')) AS candidates
  FROM identity_rows target WHERE target.document->>'id' = r.identity
) links ON true
ORDER BY r.relation_name, r.document->>'profileId', r.document->>'id',
         r.document->>'taskId', r.field;

COMMIT;
