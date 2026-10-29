-- READ ONLY. Browser executor must first verify Dashboard origin, project ID
-- tawvchmjtkgykwwvnnnn and displayed name home-maintenance-app.
-- The expected labels below are NOT proof of the connected project.
-- One SELECT result; save the full response plus verified browser context/hash.
WITH collisions AS (
  SELECT 'relation' AS kind,n.nspname AS schema,c.relname AS name,c.relkind::text AS type,
         pg_get_userbyid(c.relowner) AS owner
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND
    (c.relname LIKE 'meals\_%' ESCAPE '\' OR c.relname IN ('recipes','recipe_categories','recipe_cuisines'))
  UNION ALL
  SELECT 'function',n.nspname,p.proname,p.oid::regprocedure::text,pg_get_userbyid(p.proowner)
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname LIKE 'meals\_%' ESCAPE '\'
  UNION ALL
  SELECT 'type',n.nspname,t.typname,t.typtype::text,pg_get_userbyid(t.typowner)
  FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
  WHERE n.nspname='public' AND t.typname LIKE 'meals\_%' ESCAPE '\'
), browser_roles AS (
  SELECT r.rolname,r.rolsuper,r.rolbypassrls,
    ARRAY(SELECT inherited.rolname FROM pg_roles inherited WHERE inherited.oid<>r.oid
      AND pg_has_role(r.oid,inherited.oid,'MEMBER') ORDER BY inherited.rolname) AS member_of
  FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role','postgres')
)
SELECT jsonb_build_object(
  'expected_project_name','home-maintenance-app',
  'expected_project_ref','tawvchmjtkgykwwvnnnn',
  'project_identity_requires_browser_confirmation',true,
  'context',jsonb_build_object('database',current_database(),'executor',current_user,
                              'version',current_setting('server_version')),
  'roles',(SELECT jsonb_agg(to_jsonb(r) ORDER BY rolname) FROM browser_roles r),
  'collisions',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY kind,name) FROM collisions c),'[]'),
  'schemas',(SELECT jsonb_agg(jsonb_build_object('name',n.nspname,'owner',pg_get_userbyid(n.nspowner),
     'acl',n.nspacl,'authenticated_usage',has_schema_privilege('authenticated',n.oid,'USAGE'))
     ORDER BY n.nspname) FROM pg_namespace n WHERE n.nspname IN ('public','auth')),
  'extensions',(SELECT jsonb_agg(jsonb_build_object('name',extname,'version',extversion)
     ORDER BY extname) FROM pg_extension),
  'languages',(SELECT jsonb_agg(jsonb_build_object('name',lanname,'trusted',lanpltrusted,
     'owner',pg_get_userbyid(lanowner)) ORDER BY lanname)
     FROM pg_language WHERE lanname IN ('sql','plpgsql')),
  'builtins',jsonb_build_object('uuid',to_regprocedure('pg_catalog.gen_random_uuid()') IS NOT NULL,
    'uid',to_regprocedure('auth.uid()') IS NOT NULL,
    'uid_owner',(SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=to_regprocedure('auth.uid()')),
    'uid_security_definer',(SELECT prosecdef FROM pg_proc WHERE oid=to_regprocedure('auth.uid()')),
    'uid_authenticated_execute',has_function_privilege('authenticated',to_regprocedure('auth.uid()'),'EXECUTE'),
    'uid_definition',(SELECT pg_get_functiondef(oid) FROM pg_proc WHERE oid=to_regprocedure('auth.uid()'))),
  'collation',(SELECT jsonb_build_object('collate',datcollate,'ctype',datctype)
     FROM pg_database WHERE datname=current_database()),
  'defaults_informational',coalesce((SELECT jsonb_agg(jsonb_build_object(
     'creator',pg_get_userbyid(d.defaclrole),'schema',n.nspname,'kind',d.defaclobjtype,'acl',d.defaclacl)
     ORDER BY d.defaclrole,d.defaclnamespace,d.defaclobjtype)
     FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
     WHERE d.defaclnamespace=0 OR n.nspname='public'),'[]'),
  'owner_identity',(SELECT jsonb_build_object('exists',true,'anonymous',is_anonymous,
     'confirmed',email_confirmed_at IS NOT NULL,'banned',coalesce(banned_until>now(),false))
     FROM auth.users WHERE id='e72bccd9-ec2b-4822-bb5c-b7c1f39dcf60'),
  'collision_dependencies',coalesce((SELECT jsonb_agg(jsonb_build_object(
     'object',pg_describe_object(d.classid,d.objid,d.objsubid),
     'reference',pg_describe_object(d.refclassid,d.refobjid,d.refobjsubid),'kind',d.deptype))
     FROM pg_depend d WHERE
       (d.classid='pg_class'::regclass AND d.objid IN
         (SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relname LIKE 'meals\_%' ESCAPE '\'))
       OR (d.refclassid='pg_class'::regclass AND d.refobjid IN
         (SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relname LIKE 'meals\_%' ESCAPE '\'))),'[]')
) AS preflight;

-- P0B-PREFLIGHT-001-SUPPLEMENT. Read-only expansion after initial catalog capture.
-- Run as a separate SELECT; retain exact SQL/request equality and full response.
WITH expected_names(name) AS (VALUES
  ('meals_recipes'),('meals_recipe_categories'),('meals_recipe_cuisines'),
  ('meals_recipe_before_write'),
  ('meals_recipes_pkey'),('meals_recipe_categories_pkey'),('meals_recipe_cuisines_pkey'),
  ('meals_recipe_categories_name_key'),('meals_recipe_cuisines_name_key'),
  ('meals_recipes_category_id_idx'),('meals_recipes_cuisine_id_idx'),
  ('meals_recipes_title_nonblank'),('meals_recipe_categories_name_nonblank'),
  ('meals_recipe_cuisines_name_nonblank'),('meals_recipe_categories_name_canonical'),
  ('meals_recipe_cuisines_name_canonical'),
  ('meals_recipes_category_id_fkey'),('meals_recipes_cuisine_id_fkey')
), names AS (
  SELECT name FROM expected_names
  UNION ALL
  SELECT t || '_owner_' || op FROM
    unnest(ARRAY['meals_recipes','meals_recipe_categories','meals_recipe_cuisines']) t
    CROSS JOIN unnest(ARRAY['select','insert','update','delete']) op
), named_objects AS (
  SELECT 'relation' AS kind,c.oid,'pg_class'::regclass::oid AS classid,
    n.nspname AS schema,c.relname AS name,pg_get_userbyid(c.relowner) AS owner
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND (c.relname IN (SELECT name FROM names) OR c.relname ~ '^_?meals_')
  UNION ALL
  SELECT 'type',t.oid,'pg_type'::regclass,n.nspname,t.typname,pg_get_userbyid(t.typowner)
  FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
  WHERE n.nspname='public' AND (t.typname IN (SELECT name FROM names) OR t.typname ~ '^_?meals_')
  UNION ALL
  SELECT 'function',p.oid,'pg_proc'::regclass,n.nspname,p.proname,pg_get_userbyid(p.proowner)
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND (p.proname IN (SELECT name FROM names) OR p.proname ~ '^meals_')
  UNION ALL
  SELECT 'trigger',t.oid,'pg_trigger'::regclass,n.nspname,t.tgname,pg_get_userbyid(c.relowner)
  FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND (t.tgname IN (SELECT name FROM names) OR t.tgname ~ '^meals_')
  UNION ALL
  SELECT 'policy',p.oid,'pg_policy'::regclass,n.nspname,p.polname,pg_get_userbyid(c.relowner)
  FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND (p.polname IN (SELECT name FROM names) OR p.polname ~ '^meals_')
  UNION ALL
  SELECT 'constraint',c.oid,'pg_constraint'::regclass,n.nspname,c.conname,pg_get_userbyid(n.nspowner)
  FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
  WHERE n.nspname='public' AND (c.conname IN (SELECT name FROM names) OR c.conname ~ '^meals_')
), samples(label,input) AS (VALUES
  ('ASCII',E' \tDinner\r\n'),
  ('NBSP',chr(160)||'Dinner'||chr(160)),
  ('EM_SPACE',chr(8195)||'Dinner'||chr(8195)),
  ('UTF8_CASE',U&'\00C9COLE'),
  ('ASCII_CASE','DINNER')
), whitespace AS (
  SELECT U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF' AS chars
)
SELECT jsonb_build_object(
  'executed_at',statement_timestamp(),
  'context',jsonb_build_object('database',current_database(),'executor',current_user,
    'schema',current_schema(),'search_path',current_setting('search_path'),
    'encoding',current_setting('server_encoding'),'version',current_setting('server_version')),
  'collation_samples',(SELECT jsonb_agg(jsonb_build_object('label',label,'input',input,
    'lower',lower(input),'canonical',btrim(input,chars),'canonical_lower',lower(btrim(input,chars)))
    ORDER BY label) FROM samples CROSS JOIN whitespace),
  'search_samples',jsonb_build_object('title_ascii','DiNnEr' ILIKE '%inner%',
    'title_utf8',U&'\00C9COLE' ILIKE U&'%\00E9co%','literal_percent','50%_done' ILIKE '%50\%\_done%' ESCAPE '\',
    'unicode_lower',lower(U&'\00C9COLE')=U&'\00E9cole'),
  'functions',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,
    'signature',p.oid::regprocedure::text,'owner',pg_get_userbyid(p.proowner),
    'security_definer',p.prosecdef,'return_type',p.prorettype::regtype::text,
    'config',p.proconfig,'acl',p.proacl,
    'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'),
    'postgres_execute',has_function_privilege('postgres',p.oid,'EXECUTE'))
    ORDER BY n.nspname,p.proname)
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE (p.proname IN ('gen_random_uuid','statement_timestamp') AND p.pronargs=0)
       OR p.oid=to_regprocedure('auth.uid()')),
  'roles',(SELECT jsonb_agg(jsonb_build_object('name',rolname,'super',rolsuper,
    'inherit',rolinherit,'create_role',rolcreaterole,'create_db',rolcreatedb,
    'login',rolcanlogin,'replication',rolreplication,'bypass_rls',rolbypassrls)
    ORDER BY rolname) FROM pg_roles WHERE rolname IN ('postgres','anon','authenticated','service_role')),
  'membership_edges',(SELECT jsonb_agg(jsonb_build_object('granted',g.rolname,
    'member',r.rolname,'grantor',pg_get_userbyid(m.grantor),
    'admin',m.admin_option,'inherit',m.inherit_option,'set',m.set_option)
    ORDER BY r.rolname,g.rolname) FROM pg_auth_members m
    JOIN pg_roles g ON g.oid=m.roleid JOIN pg_roles r ON r.oid=m.member
    WHERE r.rolname IN ('postgres','anon','authenticated','service_role')),
  'schema_effective',jsonb_build_object(
    'postgres_public_create',has_schema_privilege('postgres','public','CREATE'),
    'postgres_public_usage',has_schema_privilege('postgres','public','USAGE'),
    'authenticated_public_usage',has_schema_privilege('authenticated','public','USAGE'),
    'authenticated_auth_usage',has_schema_privilege('authenticated','auth','USAGE'),
    'postgres_plpgsql_usage',has_language_privilege('postgres','plpgsql','USAGE')),
  'ownership_conventions',(SELECT jsonb_agg(to_jsonb(o) ORDER BY owner,kind) FROM (
    SELECT pg_get_userbyid(c.relowner) AS owner,c.relkind::text AS kind,count(*) AS objects
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' GROUP BY c.relowner,c.relkind) o),
  'active_application_owners',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,
    'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'kind',c.relkind)
    ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname IN ('planner_tasks','planner_weekly_tasks',
      'projects_home','projects_vehicle','projects_repeating','projects_misc',
      'activity_types','activity_rules','activity_weekly_grid','trips',
      'trips_workflow_metadata','trips_timeline')),
  'collisions',coalesce((SELECT jsonb_agg(to_jsonb(o) ORDER BY kind,name) FROM named_objects o),'[]'),
  'dependencies',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'object',pg_describe_object(d.classid,d.objid,d.objsubid),
    'reference',pg_describe_object(d.refclassid,d.refobjid,d.refobjsubid),'kind',d.deptype))
    FROM pg_depend d WHERE EXISTS (SELECT 1 FROM named_objects o
      WHERE (d.classid=o.classid AND d.objid=o.oid)
         OR (d.refclassid=o.classid AND d.refobjid=o.oid))),'[]'),
  'role_dependencies',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'object',pg_describe_object(d.classid,d.objid,d.objsubid),
    'role',pg_get_userbyid(d.refobjid),'kind',d.deptype))
    FROM pg_shdepend d WHERE d.refclassid='pg_authid'::regclass
      AND EXISTS (SELECT 1 FROM named_objects o WHERE d.classid=o.classid AND d.objid=o.oid)),'[]')
) AS supplement;
