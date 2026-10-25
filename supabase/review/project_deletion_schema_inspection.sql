-- Read-only catalog inspection. Run as the SQL Editor owner role.
-- One result set. Definitions below are returned as text, never executed.
BEGIN TRANSACTION READ ONLY;

WITH relations AS (
  SELECT c.*, n.nspname
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
    AND n.nspname NOT LIKE 'pg_toast%'
    AND n.nspname NOT LIKE 'pg_temp%'
    AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
)
SELECT 'relation' AS section, r.nspname AS schema_name, r.relname AS object_name,
       jsonb_build_object(
         'kind', r.relkind, 'owner', pg_get_userbyid(r.relowner),
         'rls', r.relrowsecurity, 'force_rls', r.relforcerowsecurity,
         'acl', r.relacl, 'options', r.reloptions,
         'view_definition', CASE WHEN r.relkind IN ('v', 'm')
                                THEN pg_get_viewdef(r.oid, true) END) AS detail
FROM relations r
UNION ALL
SELECT 'column', r.nspname, r.relname,
       jsonb_build_object('name', a.attname, 'position', a.attnum,
         'type', format_type(a.atttypid, a.atttypmod), 'not_null', a.attnotnull,
         'default', pg_get_expr(d.adbin, d.adrelid),
         'identity', a.attidentity, 'generated', a.attgenerated, 'acl', a.attacl)
FROM relations r
JOIN pg_attribute a ON a.attrelid = r.oid AND a.attnum > 0 AND NOT a.attisdropped
LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
UNION ALL
SELECT 'constraint', n.nspname, c.conname,
       jsonb_build_object('table', c.conrelid::regclass::text,
         'referenced_table', c.confrelid::regclass::text, 'type', c.contype,
         'validated', c.convalidated, 'definition', pg_get_constraintdef(c.oid, true))
FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
UNION ALL
SELECT 'index', r.nspname, r.relname,
       jsonb_build_object('definition', pg_get_indexdef(i.indexrelid),
                         'valid', i.indisvalid, 'unique', i.indisunique)
FROM relations r JOIN pg_index i ON i.indrelid = r.oid
UNION ALL
SELECT 'trigger', r.nspname, r.relname,
       jsonb_build_object('name', t.tgname, 'internal', t.tgisinternal,
         'enabled', t.tgenabled, 'definition', pg_get_triggerdef(t.oid, true),
         'function', t.tgfoid::regprocedure::text)
FROM relations r JOIN pg_trigger t ON t.tgrelid = r.oid
UNION ALL
SELECT 'policy', schemaname, tablename, to_jsonb(p)
FROM pg_policies p
UNION ALL
SELECT 'table_privilege', table_schema, table_name, to_jsonb(p)
FROM information_schema.table_privileges p
UNION ALL
SELECT 'column_privilege', table_schema, table_name, to_jsonb(p)
FROM information_schema.column_privileges p
UNION ALL
SELECT 'role_effective_privileges', r.nspname, r.relname,
       jsonb_build_object('role', roles.rolname,
         'schema_usage', has_schema_privilege(roles.oid, r.relnamespace, 'USAGE'),
         'select', has_table_privilege(roles.oid, r.oid, 'SELECT'),
         'delete', has_table_privilege(roles.oid, r.oid, 'DELETE'),
         'insert', has_table_privilege(roles.oid, r.oid, 'INSERT'),
         'update', has_table_privilege(roles.oid, r.oid, 'UPDATE'),
         'bypass_rls', roles.rolbypassrls)
FROM relations r CROSS JOIN pg_roles roles
WHERE roles.rolname IN ('anon', 'authenticated', 'service_role', 'postgres')
UNION ALL
SELECT 'function', n.nspname, p.oid::regprocedure::text,
       jsonb_build_object('owner', pg_get_userbyid(p.proowner),
         'security_definer', p.prosecdef, 'acl', p.proacl,
         'settings', p.proconfig, 'definition', pg_get_functiondef(p.oid))
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.prokind = 'f'
  AND (n.nspname = 'public' OR p.oid IN (
    SELECT t.tgfoid FROM pg_trigger t JOIN relations r ON r.oid = t.tgrelid))
ORDER BY section, schema_name, object_name, detail;

COMMIT;
