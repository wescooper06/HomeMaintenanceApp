BEGIN TRANSACTION READ ONLY;

SELECT count(*) OVER () AS total_result_rows,
       r.id AS registry_id, r.project_id AS registry_project_uuid,
       r.project_type, r.planner_task_id, r.metadata AS registry_metadata,
       r.recurrence_rule,
       t.id AS task_uuid, t.project_id AS task_project_identity,
       t.source AS task_source, t.project_registry_id, t.deleted,
       t.metadata_json AS task_metadata,
       t.id = r.planner_task_id AS registry_points_to_task,
       t.project_registry_id = r.id AS task_points_to_registry,
       masters.candidates AS registry_master_candidates,
       task_masters.candidates AS task_master_candidates
FROM public.project_registry r
FULL JOIN public.planner_tasks t
  ON t.id = r.planner_task_id OR t.project_registry_id = r.id
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object('uuid', a.id, 'type', a.project_type,
           'external_id', a.external_id, 'type_matches', a.project_type = r.project_type))
         AS candidates
  FROM public.projects_all a WHERE a.id = r.project_id
) masters ON true
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object('uuid', a.id, 'type', a.project_type,
           'external_id', a.external_id, 'source_matches', a.project_type = t.source,
           'uuid_match', a.id::text = t.project_id)) AS candidates
  FROM public.projects_all a
  WHERE a.id::text = nullif(t.project_id, '') OR a.external_id = nullif(t.project_id, '')
) task_masters ON true
WHERE r.id IS NOT NULL OR t.project_registry_id IS NOT NULL
ORDER BY r.id NULLS LAST, t.id
LIMIT 100;

COMMIT;
