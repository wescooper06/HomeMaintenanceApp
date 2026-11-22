-- READ ONLY. Confirm Dashboard project home-maintenance-app / tawvchmjtkgykwwvnnnn separately.
-- Returns schema and policy metadata only; does not read application rows or reveal the owner identity.
WITH recipe AS (
  SELECT c.oid,c.relowner,c.relrowsecurity,c.relforcerowsecurity
  FROM pg_class c WHERE c.oid=to_regclass('public.meals_recipes')
), columns AS (
  SELECT a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type,
    NOT a.attnotnull AS nullable,pg_get_expr(d.adbin,d.adrelid) AS default
  FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
  WHERE a.attrelid=(SELECT oid FROM recipe) AND a.attnum>0 AND NOT a.attisdropped
), policies AS (
  SELECT p.polname AS name,p.polcmd AS command,p.polpermissive AS permissive,
    ARRAY(SELECT rolname::text FROM pg_roles WHERE oid=ANY(p.polroles) ORDER BY rolname) AS roles,
    regexp_replace(coalesce(pg_get_expr(p.polqual,p.polrelid),''),'\s','','g') AS using_expression,
    regexp_replace(coalesce(pg_get_expr(p.polwithcheck,p.polrelid),''),'\s','','g') AS check_expression
  FROM pg_policy p WHERE p.polrelid=(SELECT oid FROM recipe)
), recipe_trigger_inventory AS (
  SELECT count(*)=2
    AND count(*) FILTER (WHERE t.tgname='meals_recipe_before_write'
      AND t.tgtype=23 AND t.tgenabled='O' AND t.tgconstraint=0
      AND NOT t.tgdeferrable AND NOT t.tginitdeferred
      AND t.tgfoid=to_regprocedure('public.meals_recipe_before_write()')
      AND l.lanname='plpgsql' AND f.proowner='postgres'::regrole
      AND NOT f.prosecdef AND f.prorettype='trigger'::regtype
      AND pg_get_function_identity_arguments(f.oid)=''
      AND f.proconfig=ARRAY['search_path=""']
      AND pg_catalog.md5(pg_catalog.replace(f.prosrc,pg_catalog.chr(13),''))=
        '8b5e0b081d8cb634e85325d833e1cb35')=1
    AND count(*) FILTER (WHERE t.tgname='meals_planner_preserve_recipe'
      AND t.tgtype=11 AND t.tgenabled='O' AND t.tgconstraint=0
      AND NOT t.tgdeferrable AND NOT t.tginitdeferred
      AND t.tgfoid=to_regprocedure('public.meals_planner_preserve_recipe()')
      AND l.lanname='plpgsql' AND f.proowner='postgres'::regrole
      AND NOT f.prosecdef AND f.prorettype='trigger'::regtype
      AND pg_get_function_identity_arguments(f.oid)=''
      AND f.proconfig=ARRAY['search_path=""']
      AND pg_catalog.md5(pg_catalog.replace(f.prosrc,pg_catalog.chr(13),''))=
        'df81cf963a0bcbe408c0e8820d985c76')=1 AS matches
  FROM pg_trigger t
  JOIN pg_proc f ON f.oid=t.tgfoid
  JOIN pg_language l ON l.oid=f.prolang
  WHERE t.tgrelid=(SELECT oid FROM recipe) AND NOT t.tgisinternal
), collisions AS (
  SELECT c.relname AS name,'relation' AS kind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname LIKE 'meals\_ideas%' ESCAPE '\'
  UNION ALL
  SELECT p.proname,'function' FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname LIKE 'meals\_ideas%' ESCAPE '\'
  UNION ALL
  SELECT t.typname,'type' FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='public' AND t.typname ~ '^_?meals_ideas'
)
SELECT jsonb_build_object(
  'expected_project_ref','tawvchmjtkgykwwvnnnn',
  'project_identity_requires_dashboard_confirmation',true,
  'recipe_table_found',(SELECT oid IS NOT NULL FROM recipe),
  'recipe_columns',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.name),'[]'::jsonb) FROM columns c),
  'candidate_notes_fields',(SELECT coalesce(jsonb_agg(name ORDER BY name),'[]'::jsonb)
    FROM columns WHERE name IN ('notes','note','recipe_notes','comments','description','metadata')),
  'recipe_rls_enabled',(SELECT relrowsecurity FROM recipe),
  'recipe_rls_forced',(SELECT relforcerowsecurity FROM recipe),
  'recipe_policies',(SELECT coalesce(jsonb_agg(jsonb_build_object(
      'name',name,'command',command,'permissive',permissive,'roles',roles)
      ORDER BY name),'[]'::jsonb) FROM policies),
  'recipe_owner_policy_matrix_matches_reviewed_pattern',(
    (SELECT count(*)=4 FROM policies)
    AND NOT EXISTS (
      SELECT 1 FROM policies
      WHERE roles<>ARRAY['authenticated']
        OR NOT permissive
        OR name NOT IN ('meals_recipes_owner_select','meals_recipes_owner_insert',
                        'meals_recipes_owner_update','meals_recipes_owner_delete')
        OR CASE command
          WHEN 'r' THEN using_expression IS DISTINCT FROM
            regexp_replace($owner$((SELECT auth.uid() AS uid) = 'e72bccd9-ec2b-4822-bb5c-b7c1f39dcf60'::uuid)$owner$,'\s','','g')
            OR check_expression<>''
          WHEN 'a' THEN using_expression<>'' OR check_expression IS DISTINCT FROM
            regexp_replace($owner$((SELECT auth.uid() AS uid) = 'e72bccd9-ec2b-4822-bb5c-b7c1f39dcf60'::uuid)$owner$,'\s','','g')
          WHEN 'w' THEN using_expression IS DISTINCT FROM
            regexp_replace($owner$((SELECT auth.uid() AS uid) = 'e72bccd9-ec2b-4822-bb5c-b7c1f39dcf60'::uuid)$owner$,'\s','','g')
            OR check_expression IS DISTINCT FROM
            regexp_replace($owner$((SELECT auth.uid() AS uid) = 'e72bccd9-ec2b-4822-bb5c-b7c1f39dcf60'::uuid)$owner$,'\s','','g')
          WHEN 'd' THEN using_expression IS DISTINCT FROM
            regexp_replace($owner$((SELECT auth.uid() AS uid) = 'e72bccd9-ec2b-4822-bb5c-b7c1f39dcf60'::uuid)$owner$,'\s','','g')
            OR check_expression<>''
          ELSE true
        END
    )
  ),
  'recipe_grant_counts',jsonb_build_object(
    'authenticated_table_privileges',(SELECT count(*) FROM pg_class c
      CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
      WHERE c.oid=(SELECT oid FROM recipe) AND a.grantee='authenticated'::regrole),
    'authenticated_column_privileges',(SELECT count(*) FROM pg_attribute c
      CROSS JOIN LATERAL aclexplode(c.attacl) a
      WHERE c.attrelid=(SELECT oid FROM recipe) AND a.grantee='authenticated'::regrole),
    'service_role_table_privileges',(SELECT count(*) FROM pg_class c
      CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
      WHERE c.oid=(SELECT oid FROM recipe) AND a.grantee='service_role'::regrole)
  ),
  'recipe_table_grants',(SELECT coalesce(jsonb_agg(jsonb_build_object(
      'role',pg_get_userbyid(a.grantee),'privilege',a.privilege_type,'grantable',a.is_grantable)
      ORDER BY pg_get_userbyid(a.grantee),a.privilege_type),'[]'::jsonb)
    FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
    WHERE c.oid=(SELECT oid FROM recipe)),
  'recipe_column_grants',(SELECT coalesce(jsonb_agg(jsonb_build_object(
      'column',c.attname,'role',pg_get_userbyid(a.grantee),'privilege',a.privilege_type,
      'grantable',a.is_grantable) ORDER BY c.attname,pg_get_userbyid(a.grantee),a.privilege_type),'[]'::jsonb)
    FROM pg_attribute c CROSS JOIN LATERAL aclexplode(c.attacl) a
    WHERE c.attrelid=(SELECT oid FROM recipe)),
  'recipe_triggers',(SELECT coalesce(jsonb_agg(jsonb_build_object(
      'name',t.tgname,'enabled',t.tgenabled,'type',t.tgtype,
      'timing',CASE WHEN (t.tgtype & 2)=2 THEN 'BEFORE'
                    WHEN (t.tgtype & 64)=64 THEN 'INSTEAD OF' ELSE 'AFTER' END,
      'events',concat_ws(', ',CASE WHEN (t.tgtype & 4)=4 THEN 'INSERT' END,
        CASE WHEN (t.tgtype & 8)=8 THEN 'DELETE' END,
        CASE WHEN (t.tgtype & 16)=16 THEN 'UPDATE' END,
        CASE WHEN (t.tgtype & 32)=32 THEN 'TRUNCATE' END),
      'constraint_backed',t.tgconstraint<>0,'function',f.proname,
      'function_identity_arguments',pg_get_function_identity_arguments(f.oid),
      'function_owner',pg_get_userbyid(f.proowner),'function_security_definer',f.prosecdef)
      ORDER BY t.tgname),'[]'::jsonb)
    FROM pg_trigger t JOIN pg_proc f ON f.oid=t.tgfoid
    WHERE t.tgrelid=(SELECT oid FROM recipe) AND NOT t.tgisinternal),
  'recipe_trigger_inventory_matches_reviewed_pattern',(SELECT matches FROM recipe_trigger_inventory),
  'recipe_trigger_function',(SELECT jsonb_build_object(
      'owner',pg_get_userbyid(f.proowner),'security_definer',f.prosecdef,'config',f.proconfig)
    FROM pg_proc f WHERE f.oid=to_regprocedure('public.meals_recipe_before_write()')),
  'ideas_namespace_collisions',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY kind,name),'[]'::jsonb) FROM collisions c)
) AS preflight;
