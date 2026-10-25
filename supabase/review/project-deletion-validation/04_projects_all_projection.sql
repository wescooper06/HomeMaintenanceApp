BEGIN TRANSACTION READ ONLY;

SELECT 'view' AS section, jsonb_build_object(
  'read_only_projection', c.relkind = 'v'
) AS detail
FROM pg_catalog.pg_class c
WHERE c.oid = pg_catalog.to_regclass('public.projects_all');

COMMIT;
