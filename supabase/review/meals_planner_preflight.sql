-- READ ONLY. Confirm Dashboard project home-maintenance-app / tawvchmjtkgykwwvnnnn.
SELECT jsonb_build_object(
  'project_identity_requires_browser_confirmation',true,
  'executor',current_user,
  'owner_confirmed',EXISTS(SELECT 1 FROM auth.users
    WHERE id='e72bccd9-ec2b-4822-bb5c-b7c1f39dcf60' AND NOT is_anonymous
      AND email_confirmed_at IS NOT NULL AND NOT coalesce(banned_until > now(),false)),
  'recipe_table',(SELECT jsonb_build_object('owner',pg_get_userbyid(c.relowner),
    'rls',c.relrowsecurity,'acl',c.relacl)
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname='meals_recipes' AND c.relkind='r'),
  'recipe_triggers',(SELECT coalesce(jsonb_agg(pg_get_triggerdef(t.oid)),'[]'::jsonb)
    FROM pg_trigger t WHERE t.tgrelid='public.meals_recipes'::regclass AND NOT t.tgisinternal),
  'browser_roles',(SELECT jsonb_agg(jsonb_build_object('name',rolname,'super',rolsuper,'bypass',rolbypassrls))
    FROM pg_roles WHERE rolname IN ('anon','authenticated')),
  'inherited_roles',(SELECT coalesce(jsonb_agg(r.rolname),'[]'::jsonb) FROM pg_roles b CROSS JOIN pg_roles r
    WHERE b.rolname IN ('anon','authenticated') AND b.oid<>r.oid AND pg_has_role(b.oid,r.oid,'MEMBER')),
  'collisions',(SELECT coalesce(jsonb_agg(object ORDER BY object),'[]'::jsonb) FROM (
    SELECT 'relation:'||c.relname AS object FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname LIKE 'meals\_planner\_%' ESCAPE '\'
    UNION ALL SELECT 'function:'||p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname LIKE 'meals\_planner\_%' ESCAPE '\'
    UNION ALL SELECT 'type:'||t.typname FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
      WHERE n.nspname='public' AND t.typname ~ '^_?meals_planner_'
    UNION ALL SELECT 'trigger:'||t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND t.tgname LIKE 'meals\_planner\_%' ESCAPE '\'
    UNION ALL SELECT 'constraint:'||c.conname FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
      WHERE n.nspname='public' AND c.conname LIKE 'meals\_planner\_%' ESCAPE '\'
  ) names)
) AS preflight;
