BEGIN TRANSACTION READ ONLY;

SELECT count(*) OVER () AS total_table_rows,
       o.id, o."projectId", o.active, o."removedFromPlanner",
       o."removedFromTaskManager", o.recurrence,
       links.candidates AS master_identity_candidates,
       parents.candidates AS recurrence_master_candidates
FROM public.repeatable_overrides o
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object('uuid', a.id, 'type', a.project_type,
           'external_id', a.external_id, 'identity_field', ref.field,
           'identity_value', ref.identity, 'uuid_match', ref.identity = a.id::text))
         AS candidates
  FROM (VALUES ('id', o.id), ('projectId', o."projectId")) ref(field, identity)
  JOIN public.projects_all a
    ON a.id::text = nullif(ref.identity, '') OR a.external_id = nullif(ref.identity, '')
) links ON true
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object('id', m.id, 'projectId', m."projectId",
           'taskId', m."taskId", 'source', m.source)) AS candidates
  FROM public.repeatable_masters m
  WHERE nullif(o."projectId", '') IN (m.id, m."projectId")
     OR nullif(o.id, '') = m.id
) parents ON true
ORDER BY o.id
LIMIT 100;

COMMIT;
