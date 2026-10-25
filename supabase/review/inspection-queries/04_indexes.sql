BEGIN TRANSACTION READ ONLY;

select tablename, indexname, indexdef
from pg_indexes where schemaname = 'public' and tablename in
  ('projects_home', 'projects_vehicle', 'projects_repeating', 'projects_misc', 'projects_all')
order by tablename, indexname;

COMMIT;
