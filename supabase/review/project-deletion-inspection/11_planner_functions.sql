BEGIN TRANSACTION READ ONLY;

SELECT n.nspname AS schema_name, p.oid::regprocedure AS signature,
       pg_get_userbyid(p.proowner) AS owner, p.prosecdef AS security_definer,
       p.provolatile, p.proacl, p.proconfig,
       pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.prokind = 'f'
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%'
  AND (n.nspname = 'public'
       OR p.proname ~* '(planner|project|parking|recurr|queue|calendar|reminder)'
       OR p.prosrc ~* '(planner_|projects_|project_id|parent_rep|converted_to_id|sourceTaskId)')
ORDER BY n.nspname, p.oid::regprocedure::text;

COMMIT;
