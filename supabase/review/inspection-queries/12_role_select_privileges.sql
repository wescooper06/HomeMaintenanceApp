BEGIN TRANSACTION READ ONLY;

select r.rolname, c.oid::regclass as relation,
       has_table_privilege(r.oid, c.oid, 'SELECT') as can_select
from pg_roles r cross join pg_class c join pg_namespace n on n.oid = c.relnamespace
where r.rolname in ('anon', 'authenticated') and n.nspname = 'public'
  and c.relname in ('projects_home', 'projects_vehicle', 'projects_repeating', 'projects_misc', 'projects_all');

COMMIT;
