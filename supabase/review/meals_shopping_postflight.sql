-- READ ONLY. Run as postgres after migration, before any owner Shopping use.
-- Compare the complete result offline with meals_shopping_expected_catalog.json
-- using meals_shopping_verify.cjs. Inventory alone is NOT a passing verification.
SELECT jsonb_build_object(
  'relations',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'type',c.relkind,'owner',pg_get_userbyid(c.relowner),
    'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'acl',c.relacl))
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname LIKE 'meals\_shopping\_%' ESCAPE '\'),
  'columns',(SELECT jsonb_agg(jsonb_build_object('table',table_name,'name',column_name,'type',data_type,
    'position',ordinal_position,'udt',udt_name,'identity',is_identity,'generated',is_generated,
    'nullable',is_nullable,'default',column_default)) FROM information_schema.columns
    WHERE table_schema='public' AND table_name IN ('meals_shopping_categories','meals_shopping_items')),
  'column_grants',(SELECT jsonb_agg(jsonb_build_object('table',table_name,'column',column_name,'role',grantee,'privilege',privilege_type))
    FROM information_schema.column_privileges WHERE table_schema='public'
      AND table_name IN ('meals_shopping_categories','meals_shopping_items') AND grantee<>'postgres'),
  'column_acls',(SELECT jsonb_agg(jsonb_build_object('table',c.relname,'column',a.attname,'acl',a.attacl))
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    WHERE n.nspname='public' AND c.relname IN ('meals_shopping_categories','meals_shopping_items')),
  'policies',(SELECT jsonb_agg(jsonb_build_object('table',tablename,'name',policyname,
    'roles',roles,'command',cmd,'permissive',permissive,'using',qual,'check',with_check))
    FROM pg_policies WHERE schemaname='public' AND tablename IN ('meals_shopping_categories','meals_shopping_items')),
  'functions',(SELECT jsonb_agg(jsonb_build_object('name',p.proname,'owner',pg_get_userbyid(p.proowner),
    'identity',pg_get_function_identity_arguments(p.oid),'result',pg_get_function_result(p.oid),
    'language',(SELECT lanname FROM pg_language WHERE oid=p.prolang),
    'definer',p.prosecdef,'config',p.proconfig,'acl',p.proacl,'definition',pg_get_functiondef(p.oid)))
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname LIKE 'meals\_shopping\_%' ESCAPE '\'),
  'triggers',(SELECT jsonb_agg(pg_get_triggerdef(t.oid)) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
      AND c.relname IN ('meals_shopping_categories','meals_shopping_items') AND NOT t.tgisinternal),
  'constraints',(SELECT jsonb_agg(jsonb_build_object('table',r.relname,'name',c.conname,
    'validated',c.convalidated,'deferrable',c.condeferrable,'initially_deferred',c.condeferred,
    'definition',pg_get_constraintdef(c.oid)))
    FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE n.nspname='public' AND r.relname IN ('meals_shopping_categories','meals_shopping_items')),
  'indexes',(SELECT jsonb_agg(indexdef) FROM pg_indexes WHERE schemaname='public'
    AND tablename IN ('meals_shopping_categories','meals_shopping_items')),
  'index_state',(SELECT jsonb_agg(jsonb_build_object('name',i.relname,'valid',x.indisvalid,
    'ready',x.indisready,'live',x.indislive))
    FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_namespace n ON n.oid=i.relnamespace
    WHERE n.nspname='public' AND i.relname LIKE 'meals\_shopping\_%' ESCAPE '\'),
  'trigger_details',(SELECT jsonb_agg(jsonb_build_object('table',c.relname,'name',t.tgname,
    'enabled',t.tgenabled,'type_bits',t.tgtype,'function',p.proname,
    'function_schema',pn.nspname,'arguments',pg_get_function_identity_arguments(p.oid),
    'definition',pg_get_triggerdef(t.oid)))
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace pn ON pn.oid=p.pronamespace
    WHERE n.nspname='public' AND c.relname IN ('meals_shopping_categories','meals_shopping_items')
      AND NOT t.tgisinternal),
  'table_privileges',(SELECT jsonb_agg(jsonb_build_object('table',c.relname,'role',r.rolname,
    'privilege',p.name,'allowed',has_table_privilege(r.oid,c.oid,p.name)))
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN pg_roles r CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p(name)
    WHERE n.nspname='public' AND c.relname IN ('meals_shopping_categories','meals_shopping_items')
      AND r.rolname IN ('anon','authenticated','service_role')),
  'column_privileges',(SELECT jsonb_agg(jsonb_build_object('table',c.relname,'column',a.attname,
    'role',r.rolname,'privilege',p.name,'allowed',has_column_privilege(r.oid,c.oid,a.attnum,p.name)))
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    CROSS JOIN pg_roles r CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES']) p(name)
    WHERE n.nspname='public' AND c.relname IN ('meals_shopping_categories','meals_shopping_items')
      AND r.rolname IN ('anon','authenticated','service_role')),
  'public_grants',(SELECT coalesce(jsonb_agg(g),'[]'::jsonb) FROM (
    SELECT c.relname AS object, 'table' AS kind, '' AS column_name, x.privilege_type
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) x
    WHERE n.nspname='public' AND c.relname IN ('meals_shopping_categories','meals_shopping_items') AND x.grantee=0
    UNION ALL
    SELECT c.relname,'column',a.attname,x.privilege_type
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    CROSS JOIN LATERAL aclexplode(a.attacl) x
    WHERE n.nspname='public' AND c.relname IN ('meals_shopping_categories','meals_shopping_items') AND x.grantee=0
  ) g),
  'function_privileges',(SELECT jsonb_agg(jsonb_build_object('function',p.proname,
    'identity',pg_get_function_identity_arguments(p.oid),'role',r.rolname,
    'execute',has_function_privilege(r.oid,p.oid,'EXECUTE')))
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN pg_roles r
    WHERE n.nspname='public' AND p.proname LIKE 'meals\_shopping\_%' ESCAPE '\'
      AND r.rolname IN ('anon','authenticated','service_role')),
  'browser_roles',(SELECT jsonb_agg(jsonb_build_object('name',rolname,'super',rolsuper,'bypass',rolbypassrls))
    FROM pg_roles WHERE rolname IN ('anon','authenticated')),
  'browser_memberships',(SELECT coalesce(jsonb_agg(jsonb_build_object('role',b.rolname,'member_of',r.rolname)),'[]'::jsonb)
    FROM pg_roles b CROSS JOIN pg_roles r WHERE b.rolname IN ('anon','authenticated')
      AND b.oid<>r.oid AND pg_has_role(b.oid,r.oid,'MEMBER')),
  'types',(SELECT jsonb_agg(t.typname) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='public' AND t.typname ~ '^_?meals_shopping_'),
  'counts',jsonb_build_object(
    'tables',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname LIKE 'meals\_shopping\_%' ESCAPE '\' AND c.relkind IN ('r','p')),
    'indexes',(SELECT count(*) FROM pg_indexes WHERE schemaname='public'
      AND tablename IN ('meals_shopping_categories','meals_shopping_items')),
    'policies',(SELECT count(*) FROM pg_policies WHERE schemaname='public'
      AND tablename IN ('meals_shopping_categories','meals_shopping_items')),
    'triggers',(SELECT count(*) FROM pg_trigger WHERE tgrelid IN
      ('public.meals_shopping_categories'::regclass,'public.meals_shopping_items'::regclass) AND NOT tgisinternal),
    'functions',(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname LIKE 'meals\_shopping\_%' ESCAPE '\'),
    'predefined',(SELECT count(*) FROM public.meals_shopping_categories WHERE predefined_order IS NOT NULL),
    'custom',(SELECT count(*) FROM public.meals_shopping_categories WHERE predefined_order IS NULL),
    'items',(SELECT count(*) FROM public.meals_shopping_items)),
  'seeds',(SELECT jsonb_agg(jsonb_build_object('name',name,'position',predefined_order) ORDER BY predefined_order)
    FROM public.meals_shopping_categories WHERE predefined_order IS NOT NULL)
) AS verification;
