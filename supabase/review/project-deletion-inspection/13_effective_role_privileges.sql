BEGIN TRANSACTION READ ONLY;

SELECT n.nspname AS schema_name, c.relname AS relation_name, roles.rolname,
       roles.rolsuper, roles.rolbypassrls,
       has_schema_privilege(roles.oid, n.oid, 'USAGE') AS schema_usage,
       has_table_privilege(roles.oid, c.oid, 'SELECT') AS can_read,
       has_table_privilege(roles.oid, c.oid, 'DELETE') AS can_delete,
       has_table_privilege(roles.oid, c.oid, 'INSERT') AS can_insert,
       has_table_privilege(roles.oid, c.oid, 'UPDATE') AS can_update
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN pg_roles roles
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%'
  AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
  AND roles.rolname IN ('anon', 'authenticated', 'service_role', 'postgres')
ORDER BY n.nspname, c.relname, roles.rolname;

COMMIT;
