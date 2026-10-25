BEGIN TRANSACTION READ ONLY;

SELECT 'modern_table_count' AS section, to_jsonb(count(*)) AS detail
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN (
  'projects_home', 'projects_vehicle', 'projects_repeating', 'projects_misc',
  'planner_tasks', 'planner_weekly_tasks', 'planner_parking_lot');

COMMIT;
