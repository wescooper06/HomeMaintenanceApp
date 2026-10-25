BEGIN TRANSACTION READ ONLY;

SELECT count(*) OVER () AS total_table_rows,
       t.id, t.project_id, t.source, t.project_registry_id, t.deleted,
       t.recurrence, t.metadata_json,
       links.candidates AS direct_master_candidates,
       registries.candidates AS registry_candidates
FROM public.planner_tasks t
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object('uuid', a.id, 'type', a.project_type,
           'external_id', a.external_id, 'source_matches', a.project_type = t.source,
           'uuid_match', a.id::text = t.project_id)) AS candidates
  FROM public.projects_all a
  WHERE a.id::text = nullif(t.project_id, '') OR a.external_id = nullif(t.project_id, '')
) links ON true
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object('registry_id', r.id, 'project_id', r.project_id,
           'project_type', r.project_type, 'planner_task_id', r.planner_task_id,
           'task_points_to_registry', t.project_registry_id = r.id,
           'registry_points_to_task', r.planner_task_id = t.id)) AS candidates
  FROM public.project_registry r WHERE r.id = t.project_registry_id OR r.planner_task_id = t.id
) registries ON true
ORDER BY t.id
LIMIT 100;

COMMIT;
