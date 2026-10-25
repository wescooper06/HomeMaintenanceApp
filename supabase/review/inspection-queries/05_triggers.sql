BEGIN TRANSACTION READ ONLY;

select t.tgrelid::regclass as relation, t.tgname, t.tgenabled,
       pg_get_triggerdef(t.oid, true) as trigger_definition,
       pg_get_functiondef(t.tgfoid) as function_definition
from pg_trigger t
where not t.tgisinternal and t.tgrelid in (
  select c.oid from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname in
    ('projects_home', 'projects_vehicle', 'projects_repeating', 'projects_misc', 'projects_all')
);

COMMIT;
