BEGIN TRANSACTION READ ONLY;

WITH rpc AS (
  SELECT p.* FROM pg_catalog.pg_proc p
  WHERE p.oid = pg_catalog.to_regprocedure('public.delete_workbench_project(uuid,text)')
), targets AS (
  SELECT c.* FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname IN (
    'projects_home', 'projects_vehicle', 'projects_repeating', 'projects_misc',
    'planner_tasks', 'planner_weekly_tasks', 'planner_parking_lot')
)
SELECT 'rpc' AS section, jsonb_build_object(
  'function_count', (SELECT count(*) FROM rpc),
  'returns_jsonb', coalesce((SELECT prorettype = 'jsonb'::regtype FROM rpc), false),
  'security_invoker', coalesce((SELECT NOT prosecdef FROM rpc), false),
  'empty_search_path', coalesce((SELECT 'search_path=""' = ANY(proconfig) FROM rpc), false),
  'public_execute', EXISTS (
    SELECT 1 FROM rpc, LATERAL pg_catalog.aclexplode(
      coalesce(proacl, pg_catalog.acldefault('f', proowner))) acl
    WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'),
  'anon_execute', coalesce((SELECT pg_catalog.has_function_privilege('anon', oid, 'EXECUTE') FROM rpc), false),
  'authenticated_execute', coalesce((SELECT pg_catalog.has_function_privilege('authenticated', oid, 'EXECUTE') FROM rpc), false)
) AS detail
UNION ALL
SELECT 'modern_table', jsonb_build_object(
  'table', t.relname, 'rls_disabled', NOT (t.relrowsecurity OR t.relforcerowsecurity),
  'anon_select_delete', pg_catalog.has_table_privilege('anon', t.oid, 'SELECT')
    AND pg_catalog.has_table_privilege('anon', t.oid, 'DELETE'),
  'authenticated_select_delete', pg_catalog.has_table_privilege('authenticated', t.oid, 'SELECT')
    AND pg_catalog.has_table_privilege('authenticated', t.oid, 'DELETE'))
FROM targets t
UNION ALL
SELECT 'modern_table_count', to_jsonb(count(*)) FROM targets
UNION ALL
SELECT 'view', jsonb_build_object('read_only_projection', c.relkind = 'v')
FROM pg_catalog.pg_class c
WHERE c.oid = pg_catalog.to_regclass('public.projects_all')
UNION ALL
SELECT 'allocator_snapshot', jsonb_build_object('name', sequencename,
  'last_value', last_value, 'increment_by', increment_by, 'cycle', cycle)
FROM pg_catalog.pg_sequences
WHERE schemaname = 'public' AND sequencename IN (
  'projects_home_external_id_seq', 'projects_vehicle_external_id_seq',
  'projects_repeating_external_id_seq', 'projects_misc_external_id_seq')
ORDER BY section, detail;

COMMIT;
