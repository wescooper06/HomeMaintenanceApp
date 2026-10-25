BEGIN TRANSACTION READ ONLY;

SELECT grantor, grantee, table_catalog, table_schema, table_name,
       privilege_type, is_grantable, with_hierarchy
FROM information_schema.table_privileges
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY table_schema, table_name, grantee, privilege_type;

COMMIT;
