BEGIN TRANSACTION READ ONLY;

SELECT count(*) OVER () AS total_table_rows,
       w.id, w."taskId", w."projectId", w."parentRepeatableId", w.source,
       w."taskType", w.type, w.completed, w.overridden, w."deletedInstance",
       w."metadataJson", w."reminderJson", w."checklistJson",
       links.candidates AS direct_master_candidates,
       tasks.candidates AS task_candidates, parents.candidates AS recurrence_candidates
FROM public.weekly_tasks w
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object('uuid', a.id, 'type', a.project_type,
           'external_id', a.external_id, 'identity_field', ref.field,
           'identity_value', ref.identity, 'source_matches', a.project_type = w.source,
           'uuid_match', ref.identity = a.id::text)) AS candidates
  FROM (VALUES ('projectId', w."projectId"), ('parentRepeatableId', w."parentRepeatableId"),
               ('metadataJson.sourceTaskId', w."metadataJson"->>'sourceTaskId')) ref(field, identity)
  JOIN public.projects_all a
    ON a.id::text = nullif(ref.identity, '') OR a.external_id = nullif(ref.identity, '')
) links ON true
LEFT JOIN LATERAL (
  SELECT jsonb_agg(candidate) AS candidates FROM (
    SELECT jsonb_build_object('table', 'planner_tasks', 'id', t.id,
             'project_id', t.project_id, 'source', t.source,
             'project_registry_id', t.project_registry_id) AS candidate
    FROM public.planner_tasks t
    WHERE t.id::text IN (w."taskId", w."parentRepeatableId", w."metadataJson"->>'sourceTaskId')
    UNION ALL
    SELECT jsonb_build_object('table', 'task_manager', 'id', t.id,
             'projectId', t."projectId", 'source', t.source)
    FROM public.task_manager t
    WHERE t.id IN (w."taskId", w."parentRepeatableId", w."metadataJson"->>'sourceTaskId')
  ) matches
) tasks ON true
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object('id', m.id, 'projectId', m."projectId",
           'taskId', m."taskId", 'source', m.source)) AS candidates
  FROM public.repeatable_masters m
  WHERE nullif(w."parentRepeatableId", '') IN (m.id, m."projectId", m."taskId")
) parents ON true
ORDER BY w.id
LIMIT 100;

COMMIT;
