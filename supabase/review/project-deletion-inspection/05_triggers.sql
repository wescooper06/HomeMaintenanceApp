BEGIN TRANSACTION READ ONLY;

SELECT n.nspname AS schema_name, c.relname AS relation_name, t.tgname,
       t.tgisinternal, t.tgenabled, pg_get_triggerdef(t.oid, true) AS definition,
       t.tgfoid::regprocedure AS trigger_function,
       pg_get_functiondef(t.tgfoid) AS function_definition
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_trigger t ON t.tgrelid = c.oid
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%'
ORDER BY n.nspname, c.relname, t.tgname;

COMMIT;
