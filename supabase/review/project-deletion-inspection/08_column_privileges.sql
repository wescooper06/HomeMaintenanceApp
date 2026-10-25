BEGIN TRANSACTION READ ONLY;

SELECT grantor, grantee, table_catalog, table_schema, table_name,
       column_name, privilege_type, is_grantable
FROM information_schema.column_privileges
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY table_schema, table_name, column_name, grantee, privilege_type;

COMMIT;
