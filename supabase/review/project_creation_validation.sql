-- READ ONLY. NOT EXECUTED. Run as postgres after an approved deployment.
-- Do not use nextval/setval or call the creation RPC for validation.
BEGIN TRANSACTION READ ONLY;

select c.relname, c.relrowsecurity, c.relforcerowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in
  ('projects_home', 'projects_vehicle', 'projects_repeating', 'projects_misc')
order by c.relname;

select con.conrelid::regclass as relation, con.conname, con.convalidated,
       pg_get_constraintdef(con.oid, true) as definition
from pg_constraint con
where con.connamespace = 'public'::regnamespace
  and con.conname in ('projects_home_external_id_unique', 'projects_vehicle_external_id_unique',
    'projects_repeating_external_id_unique', 'projects_misc_external_id_unique')
order by con.conname;

select schemaname, sequencename, start_value, increment_by, cycle, cache_size, last_value
from pg_sequences where schemaname = 'public' and sequencename in
  ('projects_home_external_id_seq', 'projects_vehicle_external_id_seq',
   'projects_repeating_external_id_seq', 'projects_misc_external_id_seq')
order by sequencename;

select p.oid::regprocedure as routine, p.prosecdef as security_definer,
       p.proconfig, p.proacl, pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'create_workbench_project';

select r.rolname, has_function_privilege(r.oid, p.oid, 'EXECUTE') as rpc_execute
from pg_roles r cross join pg_proc p join pg_namespace n on n.oid = p.pronamespace
where r.rolname in ('anon', 'authenticated', 'service_role', 'postgres')
  and n.nspname = 'public' and p.proname = 'create_workbench_project';

select r.rolname, c.relname,
       has_sequence_privilege(r.oid, c.oid, 'USAGE') as sequence_usage,
       has_sequence_privilege(r.oid, c.oid, 'UPDATE') as sequence_can_reset
from pg_roles r cross join pg_class c join pg_namespace n on n.oid = c.relnamespace
where r.rolname in ('anon', 'authenticated', 'service_role', 'postgres')
  and n.nspname = 'public' and c.relkind = 'S' and c.relname in
    ('projects_home_external_id_seq', 'projects_vehicle_external_id_seq',
     'projects_repeating_external_id_seq', 'projects_misc_external_id_seq')
order by r.rolname, c.relname;

-- Verify current project identity data separately using the preflight script.
-- This UNION ALL view is not automatically updatable despite its broad ACL.
select pg_get_viewdef('public.projects_all'::regclass, true) as view_definition;

COMMIT;
