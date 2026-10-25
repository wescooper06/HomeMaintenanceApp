-- NOT EXECUTED. Disables the new RPC, not existing raw-table grants.
-- Committed physical deletion cannot be undone by this script.
BEGIN;
SET LOCAL lock_timeout = '5s';
REVOKE ALL ON FUNCTION public.delete_workbench_project(uuid, text) FROM PUBLIC, anon, authenticated;
DROP FUNCTION public.delete_workbench_project(uuid, text);
COMMIT;
