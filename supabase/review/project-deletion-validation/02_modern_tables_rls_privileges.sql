BEGIN TRANSACTION READ ONLY;

SELECT 'modern_table' AS section, jsonb_build_object(
  'table', c.relname, 'rls_disabled', NOT (c.relrowsecurity OR c.relforcerowsecurity),
  'anon_select_delete', pg_catalog.has_table_privilege('anon', c.oid, 'SELECT')
    AND pg_catalog.has_table_privilege('anon', c.oid, 'DELETE'),
  'authenticated_select_delete', pg_catalog.has_table_privilege('authenticated', c.oid, 'SELECT')
    AND pg_catalog.has_table_privilege('authenticated', c.oid, 'DELETE')
) AS detail
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN (
  'projects_home', 'projects_vehicle', 'projects_repeating', 'projects_misc',
  'planner_tasks', 'planner_weekly_tasks', 'planner_parking_lot')
ORDER BY c.relname;

COMMIT;
