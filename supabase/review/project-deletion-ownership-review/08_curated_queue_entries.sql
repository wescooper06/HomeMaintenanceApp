BEGIN TRANSACTION READ ONLY;

SELECT count(*) OVER () AS total_table_rows,
       q."profileId", q."taskId", q.position, q.item,
       q.item->>'taskId' = q."taskId" AS item_task_identity_matches,
       links.candidates AS direct_master_candidates,
       tasks.candidates AS task_candidates
FROM public.curated_queue q
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object('uuid', a.id, 'type', a.project_type,
           'external_id', a.external_id, 'identity_field', ref.field,
           'identity_value', ref.identity, 'item_source', q.item->>'source',
           'uuid_match', ref.identity = a.id::text)) AS candidates
  FROM (VALUES ('taskId', q."taskId"), ('item.projectId', q.item->>'projectId'),
               ('item.parentRepeatableId', q.item->>'parentRepeatableId'),
               ('item.externalId', q.item->>'externalId'),
               ('item.external_id', q.item->>'external_id')) ref(field, identity)
  JOIN public.projects_all a
    ON a.id::text = nullif(ref.identity, '') OR a.external_id = nullif(ref.identity, '')
) links ON true
LEFT JOIN LATERAL (
  SELECT jsonb_agg(candidate) AS candidates FROM (
    SELECT jsonb_build_object('table', 'planner_tasks', 'id', t.id,
             'project_id', t.project_id, 'source', t.source,
             'registry_id', t.project_registry_id) AS candidate
    FROM public.planner_tasks t WHERE t.id::text IN (q."taskId", q.item->>'taskId')
    UNION ALL
    SELECT jsonb_build_object('table', 'task_manager', 'id', t.id,
             'projectId', t."projectId", 'source', t.source)
    FROM public.task_manager t WHERE t.id IN (q."taskId", q.item->>'taskId')
  ) matches
) tasks ON true
ORDER BY q."profileId", q."taskId"
LIMIT 100;

COMMIT;
