-- MANUAL ROLLBACK ONLY. NOT EXECUTED.
-- Disable creation in the deployed app first. Run as postgres only if this
-- migration committed successfully. Do not fall back to raw browser inserts.
-- Retain sequences and unique constraints: dropping/resetting them could reuse
-- issued IDs, especially IDs allocated by failed transactions or deleted rows.
begin;
set local lock_timeout = '5s';

revoke all on function public.create_workbench_project(text, jsonb)
  from public, anon, authenticated, service_role;
drop function public.create_workbench_project(text, jsonb);
revoke all on sequence public.projects_home_external_id_seq, public.projects_vehicle_external_id_seq,
  public.projects_repeating_external_id_seq, public.projects_misc_external_id_seq
  from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
