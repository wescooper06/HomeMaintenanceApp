BEGIN TRANSACTION READ ONLY;

WITH rpc AS (
  SELECT p.* FROM pg_catalog.pg_proc p
  WHERE p.oid = pg_catalog.to_regprocedure('public.delete_workbench_project(uuid,text)')
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
) AS detail;

COMMIT;
