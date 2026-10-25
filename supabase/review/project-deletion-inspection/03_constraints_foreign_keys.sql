BEGIN TRANSACTION READ ONLY;

SELECT n.nspname AS schema_name, c.conname AS constraint_name,
       c.conrelid::regclass AS relation, c.confrelid::regclass AS referenced_relation,
       c.contype, c.convalidated, c.condeferrable, c.condeferred,
       c.confdeltype AS on_delete_code, c.confupdtype AS on_update_code,
       pg_get_constraintdef(c.oid, true) AS definition
FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%'
ORDER BY n.nspname, c.conrelid::regclass::text, c.conname;

COMMIT;
