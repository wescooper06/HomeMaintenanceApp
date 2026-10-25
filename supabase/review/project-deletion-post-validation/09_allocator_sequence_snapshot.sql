BEGIN TRANSACTION READ ONLY;

SELECT 'allocator_snapshot' AS section, jsonb_build_object('name', sequencename,
  'last_value', last_value, 'start_value', start_value, 'increment_by', increment_by)
AS detail
FROM pg_catalog.pg_sequences
WHERE schemaname = 'public'
  AND sequencename IN ('projects_home_external_id_seq', 'projects_vehicle_external_id_seq',
                      'projects_repeating_external_id_seq', 'projects_misc_external_id_seq')
ORDER BY section, detail;

COMMIT;
