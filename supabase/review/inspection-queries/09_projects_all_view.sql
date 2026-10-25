BEGIN TRANSACTION READ ONLY;

select pg_get_viewdef('public.projects_all'::regclass, true) as projects_all_definition;

COMMIT;
