-- READ ONLY. Run only after separately authorized deployment and verified Dashboard project.
-- The checks expose schema/security status only; no application rows or owner identity are returned.
WITH recipe AS (
  SELECT c.oid,c.relowner,c.relrowsecurity,c.relforcerowsecurity
  FROM pg_class c WHERE c.oid=to_regclass('public.meals_recipes')
), ideas AS (
  SELECT c.oid,c.relowner,c.relrowsecurity,c.relforcerowsecurity
  FROM pg_class c WHERE c.oid=to_regclass('public.meals_ideas')
), columns AS (
  SELECT a.attrelid,a.attname,format_type(a.atttypid,a.atttypmod) AS type_name,
    a.attnotnull,pg_get_expr(d.adbin,d.adrelid) AS default_expression
  FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
  WHERE a.attnum>0 AND NOT a.attisdropped AND a.attrelid IN
    ((SELECT oid FROM recipe),(SELECT oid FROM ideas))
), policies AS (
  SELECT p.polrelid,p.polname,p.polcmd,p.polpermissive,p.polroles,
    regexp_replace(coalesce(pg_get_expr(p.polqual,p.polrelid),''),'\s','','g') AS using_expression,
    regexp_replace(coalesce(pg_get_expr(p.polwithcheck,p.polrelid),''),'\s','','g') AS check_expression
  FROM pg_policy p WHERE p.polrelid=(SELECT oid FROM ideas)
), functions AS (
  SELECT p.* FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname LIKE 'meals\_ideas%' ESCAPE '\'
), table_acl AS (
  SELECT a.grantee,a.privilege_type,a.is_grantable
  FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
  WHERE c.oid=(SELECT oid FROM ideas) AND a.grantee<>'postgres'::regrole
), column_acl AS (
  SELECT c.attname,a.grantee,a.privilege_type,a.is_grantable
  FROM pg_attribute c CROSS JOIN LATERAL aclexplode(c.attacl) a
  WHERE c.attrelid=(SELECT oid FROM ideas)
), checks AS (
  SELECT 'recipe_notes_nullable_text' AS name,
    count(*)=1 AND bool_and(type_name='text' AND NOT attnotnull AND default_expression IS NULL) AS pass
  FROM columns WHERE attrelid=(SELECT oid FROM recipe) AND attname='notes'
  UNION ALL
  SELECT 'recipe_notes_column_grants',
    count(*)=2 AND bool_and(a.grantee='authenticated'::regrole AND NOT a.is_grantable
      AND a.privilege_type IN ('INSERT','UPDATE'))
    FROM pg_attribute c CROSS JOIN LATERAL aclexplode(c.attacl) a
    WHERE c.attrelid=(SELECT oid FROM recipe) AND c.attname='notes'
  UNION ALL
  SELECT 'ideas_exact_columns',
    count(*)=6
    AND count(*) FILTER (WHERE attname='id' AND type_name='uuid' AND attnotnull
      AND default_expression='gen_random_uuid()')=1
    AND count(*) FILTER (WHERE attname='text' AND type_name='text' AND attnotnull
      AND default_expression IS NULL)=1
    AND count(*) FILTER (WHERE attname='checked' AND type_name='boolean' AND attnotnull
      AND default_expression='false')=1
    AND count(*) FILTER (WHERE attname='position' AND type_name='integer' AND attnotnull
      AND default_expression IS NULL)=1
    AND count(*) FILTER (WHERE attname IN ('created_at','updated_at')
      AND type_name='timestamp with time zone' AND attnotnull
      AND default_expression='statement_timestamp()')=2
    FROM columns WHERE attrelid=(SELECT oid FROM ideas)
  UNION ALL
  SELECT 'ideas_owner_rls',
    (SELECT relowner='postgres'::regrole AND relrowsecurity AND NOT relforcerowsecurity FROM ideas)
    AND count(*)=4 AND bool_and(polpermissive AND polroles=ARRAY['authenticated'::regrole::oid])
    AND bool_and(CASE polcmd
      WHEN 'r' THEN polname='meals_ideas_owner_select'
        AND using_expression=regexp_replace($owner$((SELECT auth.uid() AS uid) = 'e72bccd9-ec2b-4822-bb5c-b7c1f39dcf60'::uuid)$owner$,'\s','','g')
        AND check_expression=''
      WHEN 'a' THEN polname='meals_ideas_owner_insert' AND using_expression=''
        AND check_expression=regexp_replace($owner$((SELECT auth.uid() AS uid) = 'e72bccd9-ec2b-4822-bb5c-b7c1f39dcf60'::uuid)$owner$,'\s','','g')
      WHEN 'w' THEN polname='meals_ideas_owner_update'
        AND using_expression=regexp_replace($owner$((SELECT auth.uid() AS uid) = 'e72bccd9-ec2b-4822-bb5c-b7c1f39dcf60'::uuid)$owner$,'\s','','g')
        AND check_expression=regexp_replace($owner$((SELECT auth.uid() AS uid) = 'e72bccd9-ec2b-4822-bb5c-b7c1f39dcf60'::uuid)$owner$,'\s','','g')
      WHEN 'd' THEN polname='meals_ideas_owner_delete'
        AND using_expression=regexp_replace($owner$((SELECT auth.uid() AS uid) = 'e72bccd9-ec2b-4822-bb5c-b7c1f39dcf60'::uuid)$owner$,'\s','','g')
        AND check_expression=''
      ELSE false
    END)
    FROM policies
  UNION ALL
  SELECT 'ideas_least_privilege_grants',
    (SELECT count(*)=2 AND bool_and(grantee='authenticated'::regrole
       AND privilege_type IN ('SELECT','DELETE') AND NOT is_grantable) FROM table_acl)
    AND NOT EXISTS (SELECT 1 FROM column_acl WHERE grantee<>'authenticated'::regrole
      OR privilege_type<>'UPDATE' OR attname NOT IN ('text','checked') OR is_grantable)
    AND (SELECT count(*)=2 FROM column_acl)
    AND NOT has_table_privilege('anon',(SELECT oid FROM ideas),'SELECT')
    AND NOT has_table_privilege('anon',(SELECT oid FROM ideas),'INSERT')
    AND NOT has_table_privilege('anon',(SELECT oid FROM ideas),'UPDATE')
    AND NOT has_table_privilege('anon',(SELECT oid FROM ideas),'DELETE')
    AND NOT has_table_privilege('service_role',(SELECT oid FROM ideas),'SELECT')
    AND NOT has_table_privilege('service_role',(SELECT oid FROM ideas),'INSERT')
    AND NOT has_table_privilege('service_role',(SELECT oid FROM ideas),'UPDATE')
    AND NOT has_table_privilege('service_role',(SELECT oid FROM ideas),'DELETE')
  UNION ALL
  SELECT 'ideas_position_unique_deferred',
    count(*)=1 AND bool_and(contype='u' AND condeferrable AND condeferred)
  FROM pg_constraint WHERE conrelid=(SELECT oid FROM ideas) AND conname='meals_ideas_position_key'
  UNION ALL
  SELECT 'ideas_no_foreign_keys',
    NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=(SELECT oid FROM ideas) AND contype='f')
  UNION ALL
  SELECT 'ideas_write_trigger',
    count(*)=1 AND bool_and(t.tgtype=23 AND t.tgenabled='O'
      AND f.proowner='postgres'::regrole AND NOT f.prosecdef
      AND f.proconfig=ARRAY['search_path=""'])
  FROM pg_trigger t JOIN pg_proc f ON f.oid=t.tgfoid
  WHERE t.tgrelid=(SELECT oid FROM ideas) AND t.tgname='meals_ideas_before_write' AND NOT t.tgisinternal
  UNION ALL
  SELECT 'ideas_function_security',
    count(*)=3 AND bool_and(proowner='postgres'::regrole AND proconfig=ARRAY['search_path=""'])
      AND bool_and(CASE proname
        WHEN 'meals_ideas_before_write' THEN NOT prosecdef AND prorettype='trigger'::regtype
        ELSE prosecdef AND prorettype='jsonb'::regtype
      END)
  FROM functions
  UNION ALL
  SELECT 'ideas_function_execute_grants',
    NOT EXISTS (
      SELECT 1 FROM functions f CROSS JOIN LATERAL aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a
      WHERE a.grantee<>'postgres'::regrole
        AND (f.proname='meals_ideas_before_write'
          OR a.grantee<>'authenticated'::regrole OR a.privilege_type<>'EXECUTE' OR a.is_grantable)
    )
    AND (SELECT count(*)=2 FROM functions f
      CROSS JOIN LATERAL aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a
      WHERE f.proname IN ('meals_ideas_create','meals_ideas_move')
        AND a.grantee='authenticated'::regrole AND a.privilege_type='EXECUTE')
)
SELECT jsonb_build_object(
  'checks',(SELECT jsonb_agg(jsonb_build_object('name',name,'pass',coalesce(pass,false)) ORDER BY name) FROM checks),
  'catalog_pass',(SELECT bool_and(coalesce(pass,false)) FROM checks),
  'project_identity_requires_dashboard_confirmation',true
) AS verification;
