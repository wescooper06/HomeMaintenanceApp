BEGIN TRANSACTION READ ONLY;

SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
ORDER BY schemaname, tablename, policyname;

COMMIT;
