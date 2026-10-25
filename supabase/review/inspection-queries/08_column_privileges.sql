BEGIN TRANSACTION READ ONLY;

select grantor, grantee, table_name, column_name, privilege_type, is_grantable
from information_schema.column_privileges
where table_schema = 'public' and table_name in
  ('projects_home', 'projects_vehicle', 'projects_repeating', 'projects_misc', 'projects_all')
order by table_name, column_name, grantee;

COMMIT;
