BEGIN TRANSACTION READ ONLY;

SELECT count(*) OVER () AS total_table_rows,
       m.id, m."projectId", m."taskId", m.source, m.active, m.recurrence,
       links.candidates AS master_identity_candidates,
       tasks.candidates AS task_candidates
FROM public.repeatable_masters m
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object('uuid', a.id, 'type', a.project_type,
           'external_id', a.external_id, 'identity_field', ref.field,
           'identity_value', ref.identity, 'source_matches', a.project_type = m.source,
           'uuid_match', ref.identity = a.id::text)) AS candidates
  FROM (VALUES ('id', m.id), ('projectId', m."projectId"), ('taskId', m."taskId")) ref(field, identity)
  JOIN public.projects_all a
    ON a.id::text = nullif(ref.identity, '') OR a.external_id = nullif(ref.identity, '')
) links ON true
LEFT JOIN LATERAL (
  SELECT jsonb_agg(candidate) AS candidates FROM (
    SELECT jsonb_build_object('table', 'planner_tasks', 'id', t.id,
             'project_id', t.project_id, 'source', t.source) AS candidate
    FROM public.planner_tasks t WHERE t.id::text = nullif(m."taskId", '')
    UNION ALL
    SELECT jsonb_build_object('table', 'task_manager', 'id', t.id,
             'projectId', t."projectId", 'source', t.source)
    FROM public.task_manager t WHERE t.id = nullif(m."taskId", '')
  ) matches
) tasks ON true
ORDER BY m.id
LIMIT 100;

COMMIT;
