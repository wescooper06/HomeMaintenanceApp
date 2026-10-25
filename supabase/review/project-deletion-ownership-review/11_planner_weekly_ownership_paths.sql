BEGIN TRANSACTION READ ONLY;

SELECT count(*) OVER () AS total_table_rows,
       w.id, w.project_id, w.parent_rep, w.source, w.task_type,
       w.completed, w.overridden, w.deleted_instance, w.deleted,
       w.occurrence_date, w.metadata_json, w.checklist_json, w.reminder_json,
       w.id = 'week-settings' AS shared_settings_must_survive,
       links.candidates AS direct_master_candidates,
       tasks.candidates AS owned_task_path_candidates,
       parents.candidates AS historical_master_candidates
FROM public.planner_weekly_tasks w
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object('uuid', a.id, 'type', a.project_type,
           'external_id', a.external_id, 'identity_field', ref.field,
           'identity_value', ref.identity, 'source_matches', a.project_type = w.source,
           'uuid_match', ref.identity = a.id::text)) AS candidates
  FROM (VALUES ('project_id', w.project_id), ('parent_rep', w.parent_rep),
               ('metadata_json.sourceTaskId', w.metadata_json->>'sourceTaskId')) ref(field, identity)
  JOIN public.projects_all a
    ON a.id::text = nullif(ref.identity, '') OR a.external_id = nullif(ref.identity, '')
) links ON true
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object('task_id', t.id, 'project_id', t.project_id,
           'source', t.source, 'deleted', t.deleted, 'registry_id', t.project_registry_id,
           'master_uuid', a.id, 'master_type', a.project_type,
           'master_external_id', a.external_id)) AS candidates
  FROM public.planner_tasks t
  LEFT JOIN public.projects_all a
    ON a.id::text = nullif(t.project_id, '') OR a.external_id = nullif(t.project_id, '')
  WHERE t.id::text IN (w.project_id, w.parent_rep, w.metadata_json->>'sourceTaskId')
) tasks ON true
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object('id', m.id, 'projectId', m."projectId",
           'taskId', m."taskId", 'source', m.source)) AS candidates
  FROM public.repeatable_masters m
  WHERE nullif(w.parent_rep, '') IN (m.id, m."projectId", m."taskId")
) parents ON true
ORDER BY w.id
LIMIT 100;

COMMIT;
