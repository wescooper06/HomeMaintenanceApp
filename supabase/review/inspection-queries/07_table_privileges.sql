BEGIN TRANSACTION READ ONLY;

select grantor, grantee, table_name, privilege_type, is_grantable
from information_schema.table_privileges
where table_schema = 'public' and table_name in
  ('projects_home', 'projects_vehicle', 'projects_repeating', 'projects_misc', 'projects_all')
order by table_name, grantee, privilege_type;

COMMIT;
