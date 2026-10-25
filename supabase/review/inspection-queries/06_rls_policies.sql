BEGIN TRANSACTION READ ONLY;

select * from pg_policies where schemaname = 'public' and tablename in
  ('projects_home', 'projects_vehicle', 'projects_repeating', 'projects_misc', 'projects_all');

COMMIT;
