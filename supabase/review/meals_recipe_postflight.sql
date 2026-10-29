-- READ ONLY. Run only after authorized deployment and verified Dashboard project.
-- Catalog checks are not a substitute for JWT/API role tests or owner smoke.
WITH expected_tables(name) AS (VALUES
  ('meals_recipes'),('meals_recipe_categories'),('meals_recipe_cuisines')
), relations AS (
  SELECT c.* FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname LIKE 'meals\_%' ESCAPE '\'
), tables AS (
  SELECT e.name,c.oid,c.relowner,c.relrowsecurity,c.relforcerowsecurity,c.relacl,c.relkind
  FROM expected_tables e LEFT JOIN relations c ON c.relname=e.name
), expected_columns AS (
  SELECT e.name,field.column_name,field.type_name,field.not_null
  FROM expected_tables e CROSS JOIN LATERAL
    (VALUES ('id','uuid',true),('created_at','timestamp with time zone',true),
            ('updated_at','timestamp with time zone',true)) field(column_name,type_name,not_null)
  UNION ALL
  SELECT name,'name','text',true FROM expected_tables WHERE name<>'meals_recipes'
  UNION ALL
  SELECT 'meals_recipes',column_name,type_name,not_null FROM (VALUES
    ('title','text',true),('category_id','uuid',false),('cuisine_id','uuid',false),
    ('source','text',true),('favorite','boolean',true),
    ('ingredient_sections','jsonb',true),('instructions','text',true)
  ) field(column_name,type_name,not_null)
), columns AS (
  SELECT t.name,a.attname,format_type(a.atttypid,a.atttypmod) AS type_name,a.attnotnull,
    a.attacl,pg_get_expr(d.adbin,d.adrelid) AS default_expression
  FROM tables t JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped
  LEFT JOIN pg_attrdef d ON d.adrelid=t.oid AND d.adnum=a.attnum
), expected_policies AS (
  SELECT t.name,t.oid,t.name || '_owner_' || operation AS policy_name,command,
    CASE WHEN command<>'a' THEN predicate END AS using_expression,
    CASE WHEN command IN ('a','w') THEN predicate END AS check_expression
  FROM tables t CROSS JOIN (VALUES
    ('select','r'),('insert','a'),('update','w'),('delete','d')
  ) op(operation,command)
  CROSS JOIN (VALUES
    ('((SELECTauth.uid()ASuid)=''e72bccd9-ec2b-4822-bb5c-b7c1f39dcf60''::uuid)')
  ) expr(predicate)
), policies AS (
  SELECT t.name,p.polname,p.polcmd,p.polpermissive,p.polroles,
    regexp_replace(pg_get_expr(p.polqual,p.polrelid),'\s','','g') AS using_expression,
    regexp_replace(pg_get_expr(p.polwithcheck,p.polrelid),'\s','','g') AS check_expression
  FROM tables t JOIN pg_policy p ON p.polrelid=t.oid
), expected_constraints AS (
  SELECT name,name || '_pkey' AS constraint_name,'PRIMARY KEY (id)' AS definition
  FROM expected_tables
  UNION ALL
  SELECT name,name || '_name_nonblank','CHECK ((name <> ''''::text))'
    FROM expected_tables WHERE name<>'meals_recipes'
  UNION ALL
  SELECT name,name || '_name_canonical',
    'CHECK ((name = btrim(name, ' || quote_literal(U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') || '::text)))'
    FROM expected_tables WHERE name<>'meals_recipes'
  UNION ALL SELECT 'meals_recipes','meals_recipes_title_nonblank','CHECK ((title ~ ''[^[:space:]]''::text))'
  UNION ALL SELECT 'meals_recipes','meals_recipes_category_id_fkey',
    'FOREIGN KEY (category_id) REFERENCES meals_recipe_categories(id) ON UPDATE RESTRICT ON DELETE RESTRICT'
  UNION ALL SELECT 'meals_recipes','meals_recipes_cuisine_id_fkey',
    'FOREIGN KEY (cuisine_id) REFERENCES meals_recipe_cuisines(id) ON UPDATE RESTRICT ON DELETE RESTRICT'
), expected_indexes AS (
  SELECT name,name || '_pkey' AS index_name,true AS is_unique,true AS is_primary,
    '1' AS column_keys,NULL::text AS expression FROM expected_tables
  UNION ALL SELECT name,name || '_name_key',true,false,'0',
    'lower(name)'
    FROM expected_tables WHERE name<>'meals_recipes'
  UNION ALL SELECT 'meals_recipes','meals_recipes_category_id_idx',false,false,'3',NULL
  UNION ALL SELECT 'meals_recipes','meals_recipes_cuisine_id_idx',false,false,'4',NULL
), function AS (
  SELECT p.* FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname LIKE 'meals\_%' ESCAPE '\'
), table_acl AS (
  SELECT t.name,a.* FROM tables t
  CROSS JOIN LATERAL aclexplode(coalesce(t.relacl,acldefault('r',t.relowner))) a
), function_acl AS (
  SELECT a.* FROM function p
  CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
), checks AS (
  SELECT 'executor' AS check_name,current_user='postgres' AS pass
  UNION ALL SELECT 'tables_owner_rls',count(*)=3 AND bool_and(oid IS NOT NULL AND relkind='r'
    AND relowner='postgres'::regrole AND relrowsecurity AND NOT relforcerowsecurity) FROM tables
  UNION ALL SELECT 'relation_inventory',count(*)=10 AND bool_and(relowner='postgres'::regrole)
    AND count(*) FILTER (WHERE relkind NOT IN ('r','i'))=0 FROM relations
  UNION ALL SELECT 'row_type_inventory',count(*)=6 AND bool_and(t.typowner='postgres'::regrole
    AND (t.typrelid IN (SELECT oid FROM tables)
      OR t.typelem IN (SELECT reltype FROM relations WHERE relkind='r')))
    FROM pg_type t WHERE t.typnamespace='public'::regnamespace
      AND (t.typname LIKE 'meals\_%' ESCAPE '\' OR t.typname LIKE '\_meals\_%' ESCAPE '\')
  UNION ALL SELECT 'columns',NOT EXISTS (
    (SELECT name,column_name,type_name,not_null FROM expected_columns EXCEPT
     SELECT name,attname,type_name,attnotnull FROM columns)
    UNION ALL
    (SELECT name,attname,type_name,attnotnull FROM columns EXCEPT
     SELECT name,column_name,type_name,not_null FROM expected_columns))
  UNION ALL SELECT 'defaults',count(*) FILTER (WHERE default_expression IS NOT NULL)=13
    AND count(*) FILTER (WHERE attname='id' AND default_expression='gen_random_uuid()')=3
    AND count(*) FILTER (WHERE attname IN ('created_at','updated_at')
      AND default_expression='statement_timestamp()')=6
    AND count(*) FILTER (WHERE attname IN ('source','instructions') AND default_expression='''''::text')=2
    AND count(*) FILTER (WHERE attname='favorite' AND default_expression='false')=1
    AND count(*) FILTER (WHERE attname='ingredient_sections'
      AND default_expression='''[{"name": "Ingredients", "text": ""}]''::jsonb')=1 FROM columns
  UNION ALL SELECT 'policy_matrix',count(*)=12 AND bool_and(p.polname IS NOT NULL
    AND p.polcmd::text=e.command AND p.polpermissive
    AND p.polroles=ARRAY['authenticated'::regrole::oid]
    AND p.using_expression IS NOT DISTINCT FROM e.using_expression
    AND p.check_expression IS NOT DISTINCT FROM e.check_expression)
    AND (SELECT count(*) FROM policies)=12
    FROM expected_policies e LEFT JOIN policies p ON p.name=e.name AND p.polname=e.policy_name
  UNION ALL SELECT 'explicit_table_acl',NOT EXISTS (
    SELECT 1 FROM table_acl WHERE
      grantee NOT IN ('postgres'::regrole,'authenticated'::regrole,'service_role'::regrole)
      OR grantor<>'postgres'::regrole
      OR grantee<>'postgres'::regrole AND
        (is_grantable OR grantee='authenticated'::regrole AND privilege_type NOT IN ('SELECT','DELETE')
         OR grantee='service_role'::regrole AND privilege_type NOT IN ('SELECT','INSERT','UPDATE','DELETE')))
    AND (SELECT count(*) FROM table_acl WHERE grantee='authenticated'::regrole)=6
    AND (SELECT count(*) FROM table_acl WHERE grantee='service_role'::regrole)=12
  UNION ALL SELECT 'column_acl',NOT EXISTS (
    SELECT 1 FROM columns c CROSS JOIN LATERAL aclexplode(c.attacl) a
    WHERE a.grantee<>'authenticated'::regrole OR a.grantor<>'postgres'::regrole OR a.is_grantable
      OR a.privilege_type NOT IN ('INSERT','UPDATE')
      OR c.attname IN ('created_at','updated_at') OR a.privilege_type='UPDATE' AND c.attname='id')
    AND (SELECT count(*) FROM columns c CROSS JOIN LATERAL aclexplode(c.attacl) a
         WHERE a.grantee='authenticated'::regrole AND a.privilege_type='INSERT')=12
    AND (SELECT count(*) FROM columns c CROSS JOIN LATERAL aclexplode(c.attacl) a
         WHERE a.grantee='authenticated'::regrole AND a.privilege_type='UPDATE')=9
  UNION ALL SELECT 'effective_anon_denial',bool_and(
    NOT has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    AND NOT has_any_column_privilege('anon',oid,'SELECT,INSERT,UPDATE,REFERENCES')) FROM tables
  UNION ALL SELECT 'browser_role_safety',count(*)=2 AND bool_and(NOT rolsuper AND NOT rolbypassrls)
    AND NOT EXISTS (SELECT 1 FROM pg_roles b CROSS JOIN pg_roles inherited
      WHERE b.rolname IN ('anon','authenticated') AND b.oid<>inherited.oid
      AND pg_has_role(b.oid,inherited.oid,'MEMBER'))
    FROM pg_roles WHERE rolname IN ('anon','authenticated')
  UNION ALL SELECT 'function_security',count(*)=1 AND bool_and(
    oid=to_regprocedure('public.meals_recipe_before_write()') AND proowner='postgres'::regrole
    AND NOT prosecdef AND prorettype='trigger'::regtype
    AND proconfig=ARRAY['search_path=""']
    AND md5(replace(prosrc,chr(13),''))='8b5e0b081d8cb634e85325d833e1cb35'
    AND prolang=(SELECT oid FROM pg_language WHERE lanname='plpgsql')) FROM function
  UNION ALL SELECT 'function_acl',NOT EXISTS (
    SELECT 1 FROM function_acl WHERE grantee<>'postgres'::regrole OR grantor<>'postgres'::regrole)
    AND NOT coalesce((SELECT bool_or(has_function_privilege('anon',oid,'EXECUTE')
      OR has_function_privilege('authenticated',oid,'EXECUTE')
      OR has_function_privilege('service_role',oid,'EXECUTE')) FROM function),true)
  UNION ALL SELECT 'trigger_matrix',count(*)=3 AND bool_and(
    tg.tgname='meals_recipe_before_write' AND tg.tgtype=23 AND tg.tgenabled='O'
    AND tg.tgfoid=to_regprocedure('public.meals_recipe_before_write()'))
    FROM pg_trigger tg JOIN tables t ON t.oid=tg.tgrelid WHERE NOT tg.tgisinternal
  UNION ALL SELECT 'constraints',count(*)=10 AND bool_and(convalidated)
    AND count(*) FILTER (WHERE contype='p')=3
    AND count(*) FILTER (WHERE contype='c')=5
    AND count(*) FILTER (WHERE contype='f' AND confdeltype='r' AND confupdtype='r'
       AND confrelid IN (SELECT oid FROM tables WHERE name<>'meals_recipes'))=2
    FROM pg_constraint WHERE conrelid IN (SELECT oid FROM tables)
      AND contype IN ('p','c','f')
  UNION ALL SELECT 'indexes',count(*)=7 AND bool_and(i.indisvalid AND i.indisready)
    AND count(*) FILTER (WHERE i.indisprimary)=3
    AND count(*) FILTER (WHERE i.indisunique AND NOT i.indisprimary)=2
    FROM pg_index i WHERE i.indrelid IN (SELECT oid FROM tables)
  UNION ALL SELECT 'exact_constraints',NOT EXISTS (
    (SELECT name,constraint_name,definition FROM expected_constraints EXCEPT
      SELECT t.name,c.conname,pg_get_constraintdef(c.oid)
      FROM pg_constraint c JOIN tables t ON t.oid=c.conrelid WHERE c.contype IN ('p','c','f'))
    UNION ALL
    (SELECT t.name,c.conname,pg_get_constraintdef(c.oid)
      FROM pg_constraint c JOIN tables t ON t.oid=c.conrelid WHERE c.contype IN ('p','c','f')
     EXCEPT SELECT name,constraint_name,definition FROM expected_constraints))
  UNION ALL SELECT 'exact_indexes',count(*)=7 AND bool_and(
    i.indexrelid IS NOT NULL AND i.indisunique=e.is_unique AND i.indisprimary=e.is_primary
    AND i.indkey::text=e.column_keys AND i.indpred IS NULL
    AND pg_get_expr(i.indexprs,i.indrelid) IS NOT DISTINCT FROM e.expression
    AND am.amname='btree')
    FROM expected_indexes e JOIN tables t ON t.name=e.name
    LEFT JOIN pg_class c ON c.relnamespace='public'::regnamespace AND c.relname=e.index_name
    LEFT JOIN pg_index i ON i.indexrelid=c.oid AND i.indrelid=t.oid
    LEFT JOIN pg_am am ON am.oid=c.relam
  UNION ALL SELECT 'no_unreviewed_role_dependencies',NOT EXISTS (
    SELECT 1 FROM pg_shdepend d WHERE d.refclassid='pg_authid'::regclass
      AND ((d.classid='pg_class'::regclass AND d.objid IN (SELECT oid FROM relations))
        OR (d.classid='pg_proc'::regclass AND d.objid IN (SELECT oid FROM function)))
      AND d.refobjid NOT IN ('postgres'::regrole,'authenticated'::regrole,'service_role'::regrole))
  UNION ALL SELECT 'schema_usage',has_schema_privilege('authenticated','public','USAGE')
)
SELECT jsonb_build_object(
  'checks',(SELECT jsonb_agg(jsonb_build_object('name',check_name,'pass',coalesce(pass,false))
    ORDER BY check_name) FROM checks),
  'catalog_pass',(SELECT bool_and(coalesce(pass,false)) FROM checks),
  'project_identity_requires_browser_confirmation',true,
  'tables',(SELECT jsonb_agg(to_jsonb(t) ORDER BY name) FROM tables t),
  'columns',(SELECT jsonb_agg(to_jsonb(c) ORDER BY name,attname) FROM columns c),
  'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY name,polname) FROM policies p),
  'table_acl',(SELECT jsonb_agg(to_jsonb(a) ORDER BY name,grantee,privilege_type) FROM table_acl a),
  'column_acl',(SELECT jsonb_agg(jsonb_build_object('table',c.name,'column',c.attname,
    'grantee',pg_get_userbyid(a.grantee),'grantor',pg_get_userbyid(a.grantor),
    'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY c.name,c.attname,a.privilege_type)
    FROM columns c CROSS JOIN LATERAL aclexplode(c.attacl) a),
  'function',(SELECT jsonb_agg(jsonb_build_object('signature',oid::regprocedure::text,
    'owner',pg_get_userbyid(proowner),'config',proconfig,'acl',proacl,'security_definer',prosecdef,
    'comment',obj_description(oid,'pg_proc'),'definition',pg_get_functiondef(oid))) FROM function),
  'constraints',(SELECT jsonb_agg(jsonb_build_object('table',conrelid::regclass::text,
    'name',conname,'definition',pg_get_constraintdef(oid)) ORDER BY conname)
    FROM pg_constraint WHERE conrelid IN (SELECT oid FROM tables) AND contype IN ('p','c','f')),
  'indexes',(SELECT jsonb_agg(pg_get_indexdef(i.indexrelid) ORDER BY i.indexrelid)
    FROM pg_index i WHERE i.indrelid IN (SELECT oid FROM tables)),
  'triggers',(SELECT jsonb_agg(pg_get_triggerdef(t.oid) ORDER BY t.tgrelid)
    FROM pg_trigger t WHERE t.tgrelid IN (SELECT oid FROM tables) AND NOT t.tgisinternal),
  'dependencies',(SELECT jsonb_agg(jsonb_build_object(
    'object',pg_describe_object(d.classid,d.objid,d.objsubid),
    'reference',pg_describe_object(d.refclassid,d.refobjid,d.refobjsubid),'kind',d.deptype))
    FROM pg_depend d WHERE
      (d.classid='pg_proc'::regclass AND d.objid IN (SELECT oid FROM function))
      OR (d.classid='pg_policy'::regclass AND d.objid IN
        (SELECT oid FROM pg_policy WHERE polrelid IN (SELECT oid FROM tables))))
) AS verification;
