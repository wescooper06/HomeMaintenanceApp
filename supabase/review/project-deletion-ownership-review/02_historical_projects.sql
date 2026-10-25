BEGIN TRANSACTION READ ONLY;

SELECT count(*) OVER () AS total_table_rows,
       p.id, p.source, p.title, p.state, p.metadata, p."resourceLinks",
       links.candidates AS master_identity_candidates
FROM public.projects p
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object('uuid', a.id, 'type', a.project_type,
           'external_id', a.external_id, 'source_matches', a.project_type = p.source,
           'uuid_match', p.id = a.id::text, 'alias_match', p.id = a.external_id))
         AS candidates
  FROM public.projects_all a
  WHERE p.id = a.id::text OR p.id = a.external_id
) links ON true
ORDER BY p.id, p.source
LIMIT 100;

COMMIT;
