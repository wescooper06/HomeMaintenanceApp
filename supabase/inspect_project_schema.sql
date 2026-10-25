-- READ ONLY. Review the results before approving the proposed migration.
begin transaction read only;

select c.oid::regclass as relation, c.relkind, c.relrowsecurity, c.relforcerowsecurity,
       pg_get_userbyid(c.relowner) as owner, c.relacl
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in
  ('projects_home', 'projects_vehicle', 'projects_repeating', 'projects_misc', 'projects_all');

select table_name, ordinal_position, column_name, data_type, udt_name,
       is_nullable, column_default, is_identity, identity_generation,
       is_generated, generation_expression
from information_schema.columns
where table_schema = 'public' and table_name in
  ('projects_home', 'projects_vehicle', 'projects_repeating', 'projects_misc', 'projects_all')
order by table_name, ordinal_position;

select con.conrelid::regclass as relation, con.conname, con.contype,
       con.convalidated, pg_get_constraintdef(con.oid, true) as definition
from pg_constraint con
where con.conrelid in (
  select c.oid from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname in
    ('projects_home', 'projects_vehicle', 'projects_repeating', 'projects_misc', 'projects_all')
) or con.confrelid in (
  select c.oid from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname in
    ('projects_home', 'projects_vehicle', 'projects_repeating', 'projects_misc')
)
order by relation, con.conname;

select tablename, indexname, indexdef
from pg_indexes where schemaname = 'public' and tablename in
  ('projects_home', 'projects_vehicle', 'projects_repeating', 'projects_misc', 'projects_all')
order by tablename, indexname;

select t.tgrelid::regclass as relation, t.tgname, t.tgenabled,
       pg_get_triggerdef(t.oid, true) as trigger_definition,
       pg_get_functiondef(t.tgfoid) as function_definition
from pg_trigger t
where not t.tgisinternal and t.tgrelid in (
  select c.oid from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname in
    ('projects_home', 'projects_vehicle', 'projects_repeating', 'projects_misc', 'projects_all')
);

select * from pg_policies where schemaname = 'public' and tablename in
  ('projects_home', 'projects_vehicle', 'projects_repeating', 'projects_misc', 'projects_all');

select grantor, grantee, table_name, privilege_type, is_grantable
from information_schema.table_privileges
where table_schema = 'public' and table_name in
  ('projects_home', 'projects_vehicle', 'projects_repeating', 'projects_misc', 'projects_all')
order by table_name, grantee, privilege_type;

select grantor, grantee, table_name, column_name, privilege_type, is_grantable
from information_schema.column_privileges
where table_schema = 'public' and table_name in
  ('projects_home', 'projects_vehicle', 'projects_repeating', 'projects_misc', 'projects_all')
order by table_name, column_name, grantee;

select pg_get_viewdef('public.projects_all'::regclass, true) as projects_all_definition;

-- Include existing allocator candidates and their ACLs, not just table DDL.
select schemaname, sequencename, start_value, min_value, max_value, increment_by,
       cycle, cache_size, last_value
from pg_sequences where schemaname = 'public' and sequencename like '%project%';

select p.oid::regprocedure as routine, p.prosecdef as security_definer, p.proacl,
       pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f'
  and (p.proname like '%project%' or p.proname like '%external_id%');

select r.rolname, c.oid::regclass as relation,
       has_table_privilege(r.oid, c.oid, 'SELECT') as can_select
from pg_roles r cross join pg_class c join pg_namespace n on n.oid = c.relnamespace
where r.rolname in ('anon', 'authenticated') and n.nspname = 'public'
  and c.relname in ('projects_home', 'projects_vehicle', 'projects_repeating', 'projects_misc', 'projects_all');

commit;
