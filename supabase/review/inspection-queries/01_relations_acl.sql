BEGIN TRANSACTION READ ONLY;

select c.oid::regclass as relation, c.relkind, c.relrowsecurity, c.relforcerowsecurity,
       pg_get_userbyid(c.relowner) as owner, c.relacl
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in
  ('projects_home', 'projects_vehicle', 'projects_repeating', 'projects_misc', 'projects_all');

COMMIT;
