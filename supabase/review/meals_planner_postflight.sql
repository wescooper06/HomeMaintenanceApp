-- READ ONLY. Capture after the authorized migration and compare with local catalog tests.
SELECT jsonb_build_object(
  'executor',current_user,
  'recipe_table',(SELECT jsonb_build_object('owner',pg_get_userbyid(c.relowner),
    'rls',c.relrowsecurity,'acl',c.relacl)
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname='meals_recipes' AND c.relkind='r'),
  'recipe_triggers',(SELECT jsonb_agg(pg_get_triggerdef(t.oid) ORDER BY t.tgname)
    FROM pg_trigger t WHERE t.tgrelid='public.meals_recipes'::regclass AND NOT t.tgisinternal),
  'relations',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'kind',c.relkind,
    'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'acl',c.relacl)
    ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname LIKE 'meals\_planner\_%' ESCAPE '\'),
  'columns',(SELECT jsonb_agg(jsonb_build_object('name',column_name,'type',data_type,
    'nullable',is_nullable,'default',column_default,'identity',is_identity,'generation',identity_generation)
    ORDER BY ordinal_position) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='meals_planner_entries'),
  'column_grants',(SELECT coalesce(jsonb_agg(jsonb_build_object('role',grantee,'column',column_name,
    'privilege',privilege_type) ORDER BY grantee,column_name,privilege_type),'[]'::jsonb)
    FROM information_schema.column_privileges
    WHERE table_schema='public' AND table_name='meals_planner_entries' AND grantee<>'postgres'),
  'policies',(SELECT jsonb_agg(jsonb_build_object('name',policyname,'roles',roles,'command',cmd,
    'permissive',permissive,'using',qual,'check',with_check) ORDER BY policyname)
    FROM pg_policies WHERE schemaname='public' AND tablename='meals_planner_entries'),
  'functions',(SELECT jsonb_agg(jsonb_build_object('name',p.proname,'owner',pg_get_userbyid(p.proowner),
    'identity',pg_get_function_identity_arguments(p.oid),'result',pg_get_function_result(p.oid),
    'definer',p.prosecdef,'config',p.proconfig,'acl',p.proacl,'definition',pg_get_functiondef(p.oid))
    ORDER BY p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname LIKE 'meals\_planner\_%' ESCAPE '\'),
  'triggers',(SELECT jsonb_agg(jsonb_build_object('table',c.relname,'name',t.tgname,
    'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid)) ORDER BY c.relname,t.tgname)
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND t.tgname LIKE 'meals\_planner\_%' ESCAPE '\' AND NOT t.tgisinternal),
  'constraints',(SELECT jsonb_agg(jsonb_build_object('name',conname,'validated',convalidated,
    'definition',pg_get_constraintdef(oid)) ORDER BY conname) FROM pg_constraint
    WHERE conrelid='public.meals_planner_entries'::regclass),
  'indexes',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'definition',pg_get_indexdef(c.oid),
    'valid',i.indisvalid,'ready',i.indisready,'live',i.indislive) ORDER BY c.relname)
    FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
    WHERE i.indrelid='public.meals_planner_entries'::regclass),
  'sequence',(SELECT jsonb_build_object('name',sequencename,'owner',sequenceowner,'type',data_type,
    'start',start_value,'min',min_value,'max',max_value,'increment',increment_by,'cycle',cycle,'cache',cache_size)
    FROM pg_sequences WHERE schemaname='public' AND sequencename='meals_planner_entries_insertion_order_seq'),
  'effective_privileges',(SELECT jsonb_agg(jsonb_build_object('role',r.rolname,
    'select',has_table_privilege(r.oid,'public.meals_planner_entries','SELECT'),
    'insert',has_table_privilege(r.oid,'public.meals_planner_entries','INSERT'),
    'update',has_table_privilege(r.oid,'public.meals_planner_entries','UPDATE'),
    'delete',has_table_privilege(r.oid,'public.meals_planner_entries','DELETE'),
    'truncate',has_table_privilege(r.oid,'public.meals_planner_entries','TRUNCATE'),
    'references',has_table_privilege(r.oid,'public.meals_planner_entries','REFERENCES'),
    'trigger',has_table_privilege(r.oid,'public.meals_planner_entries','TRIGGER'),
    'sequence_usage',has_sequence_privilege(r.oid,'public.meals_planner_entries_insertion_order_seq','USAGE'),
    'sequence_select',has_sequence_privilege(r.oid,'public.meals_planner_entries_insertion_order_seq','SELECT'),
    'sequence_update',has_sequence_privilege(r.oid,'public.meals_planner_entries_insertion_order_seq','UPDATE'))
    ORDER BY r.rolname) FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role')),
  'entries',(SELECT count(*) FROM public.meals_planner_entries),
  'fixture_recipes',(SELECT count(*) FROM public.meals_recipes WHERE id='a3db0001-0000-4000-8000-000000000001'),
  'fixture_entries',(SELECT count(*) FROM public.meals_planner_entries
    WHERE id IN ('a3db0001-0000-4000-8000-000000000002','a3db0001-0000-4000-8000-000000000003',
      'a3db0001-0000-4000-8000-000000000004'))
) AS verification;
