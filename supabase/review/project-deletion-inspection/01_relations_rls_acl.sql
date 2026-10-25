BEGIN TRANSACTION READ ONLY;

SELECT n.nspname AS schema_name, c.relname AS relation_name, c.relkind,
       pg_get_userbyid(c.relowner) AS owner, c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS force_rls, c.relacl, c.reloptions,
       CASE WHEN c.relkind IN ('v', 'm') THEN pg_get_viewdef(c.oid, true) END AS view_definition
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%'
  AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
ORDER BY n.nspname, c.relname;

COMMIT;
