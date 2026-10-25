BEGIN TRANSACTION READ ONLY;

SELECT count(*) OVER () AS total_table_rows,
       t.id, t."projectId", t.source, t.state, t.recurrence, t."metadataJson",
       links.candidates AS master_identity_candidates
FROM public.task_manager t
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object('uuid', a.id, 'type', a.project_type,
           'external_id', a.external_id, 'source_matches', a.project_type = t.source,
           'identity_field', ref.field, 'identity_value', ref.identity,
           'uuid_match', ref.identity = a.id::text)) AS candidates
  FROM (VALUES ('projectId', t."projectId"),
               ('metadataJson.externalId', t."metadataJson"->>'externalId'),
               ('metadataJson.external_id', t."metadataJson"->>'external_id')) ref(field, identity)
  JOIN public.projects_all a
    ON a.id::text = nullif(ref.identity, '') OR a.external_id = nullif(ref.identity, '')
) links ON true
ORDER BY t.id
LIMIT 100;

COMMIT;
