BEGIN TRANSACTION READ ONLY;

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

COMMIT;
