-- READ ONLY. Identical complete public-schema snapshot before and after Shopping.
-- Returns catalog definitions and in-database aggregate hashes, not private rows.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL search_path = pg_catalog, public;
SET LOCAL timezone = 'UTC';
SET LOCAL datestyle = 'ISO, YMD';
SET LOCAL intervalstyle = 'postgres';
SET LOCAL extra_float_digits = 3;
SET LOCAL bytea_output = 'hex';
SET LOCAL row_security = off;
SET LOCAL statement_timeout = '60s';
WITH
relations AS (
  SELECT c.*,n.nspname,
    c.relname IN ('meals_shopping_categories','meals_shopping_items',
      'meals_shopping_categories_pkey','meals_shopping_items_pkey',
      'meals_shopping_categories_predefined_order_key','meals_shopping_categories_name_key',
      'meals_shopping_items_category_id_idx') AS shopping
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
),
targets AS (SELECT * FROM relations WHERE NOT shopping),
objects AS (
  SELECT t.nspname AS schema,t.relname AS name,t.relkind AS kind,
    jsonb_build_object(
      'owner',pg_get_userbyid(t.relowner),'rls',t.relrowsecurity,'force_rls',t.relforcerowsecurity,
      'acl',t.relacl,'options',t.reloptions,'persistence',t.relpersistence,
      'access_method',(SELECT amname FROM pg_am WHERE oid=t.relam),
      'tablespace',(SELECT spcname FROM pg_tablespace WHERE oid=t.reltablespace),
      'partition_key',CASE WHEN t.relkind='p' THEN pg_get_partkeydef(t.oid) END,
      'partition_bound',pg_get_expr(t.relpartbound,t.oid),
      'parents',(SELECT jsonb_agg(i.inhparent::regclass::text ORDER BY i.inhseqno)
        FROM pg_inherits i WHERE i.inhrelid=t.oid),
      'view',CASE WHEN t.relkind IN ('v','m') THEN pg_get_viewdef(t.oid,false) END,
      'sequence',(SELECT to_jsonb(s)-'seqrelid' FROM pg_sequence s WHERE s.seqrelid=t.oid),
      'columns',(SELECT jsonb_agg(jsonb_build_object('position',a.attnum,'name',a.attname,
        'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'identity',a.attidentity,
        'generated',a.attgenerated,'collation',a.attcollation::regcollation::text,'acl',a.attacl,
        'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
        FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
        WHERE a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped),
      'indexes',(SELECT jsonb_agg(jsonb_build_object('definition',pg_get_indexdef(i.indexrelid),
        'valid',i.indisvalid,'ready',i.indisready,'live',i.indislive) ORDER BY pg_get_indexdef(i.indexrelid))
        FROM pg_index i WHERE i.indrelid=t.oid),
      'index_definition',CASE WHEN t.relkind IN ('i','I') THEN pg_get_indexdef(t.oid) END,
      'constraints',(SELECT jsonb_agg(jsonb_build_object('name',c.conname,'definition',pg_get_constraintdef(c.oid),
        'validated',c.convalidated,'deferrable',c.condeferrable,'initially_deferred',c.condeferred) ORDER BY c.conname)
        FROM pg_constraint c WHERE c.conrelid=t.oid),
      'triggers',(SELECT jsonb_agg(jsonb_build_object('definition',pg_get_triggerdef(g.oid),
        'enabled',g.tgenabled,'internal',g.tgisinternal) ORDER BY g.tgname)
        FROM pg_trigger g WHERE g.tgrelid=t.oid),
      'rules',(SELECT jsonb_agg(pg_get_ruledef(w.oid,false) ORDER BY w.rulename)
        FROM pg_rewrite w WHERE w.ev_class=t.oid),
      'policies',(SELECT jsonb_agg(jsonb_build_object('name',p.policyname,'roles',p.roles,'command',p.cmd,
        'permissive',p.permissive,'using',p.qual,'check',p.with_check) ORDER BY p.policyname)
        FROM pg_policies p WHERE p.schemaname=t.nspname AND p.tablename=t.relname)
    ) AS catalog,
    CASE WHEN t.relkind IN ('r','p','m','S') THEN
      ((xpath('/row/fingerprint/text()',query_to_xml(format(
        'SELECT jsonb_build_object(''rows'',count(*)::text,''sha256'',encode(sha256(convert_to(coalesce(string_agg(h,'''' ORDER BY h COLLATE "C"),''''),''UTF8'')),''hex'')) AS fingerprint FROM (SELECT encode(sha256(convert_to(row_to_json(r)::text,''UTF8'')),''hex'') AS h FROM (SELECT * FROM %I.%I) r) row_hashes',
        t.nspname,t.relname),false,true,'')))[1]::text)::jsonb
    END AS data
  FROM targets t
),
function_inventory AS (
  SELECT p.*,n.nspname,
    n.nspname='public' AND p.proname='meals_shopping_before_write' AND p.pronargs=0 AS shopping
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    OR p.oid IN (SELECT tgfoid FROM pg_trigger WHERE tgrelid IN (SELECT oid FROM targets))
),
functions AS (
  SELECT nspname AS schema,proname AS name,pg_get_function_identity_arguments(oid) AS identity,
    jsonb_build_object(
      'properties',to_jsonb(p)-'oid'-'nspname'-'shopping',
      'kind',prokind,'result',pg_get_function_result(oid),'language',(SELECT lanname FROM pg_language WHERE oid=prolang),
      'owner',pg_get_userbyid(proowner),'acl',proacl,'definer',prosecdef,'config',proconfig,
      'volatility',provolatile,'strict',proisstrict,'leakproof',proleakproof,'parallel',proparallel,
      'definition',CASE WHEN prokind<>'a' THEN pg_get_functiondef(oid) END,
      'aggregate',(SELECT to_jsonb(a)-'aggfnoid' FROM pg_aggregate a WHERE a.aggfnoid=oid),
      'effective_execute',(SELECT jsonb_agg(jsonb_build_object('role',r.rolname,
        'allowed',has_function_privilege(r.oid,p.oid,'EXECUTE')) ORDER BY r.rolname)
        FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role'))
    ) AS catalog
  FROM function_inventory p WHERE NOT shopping
),
type_inventory AS (
  SELECT t.*,n.nspname,t.typname IN ('meals_shopping_categories','_meals_shopping_categories',
    'meals_shopping_items','_meals_shopping_items') AS shopping
  FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public'
),
types AS (
  SELECT nspname AS schema,typname AS name,
    jsonb_build_object(
      'properties',to_jsonb(t)-'oid'-'nspname'-'shopping',
      'owner',pg_get_userbyid(typowner),'kind',typtype,'category',typcategory,'acl',typacl,
      'not_null',typnotnull,'default',typdefault,'base',format_type(typbasetype,typtypmod),
      'element',typelem::regtype::text,'array',typarray::regtype::text,
      'input',typinput::regprocedure::text,'output',typoutput::regprocedure::text,
      'receive',typreceive::regprocedure::text,'send',typsend::regprocedure::text,
      'collation',typcollation::regcollation::text,
      'enum',(SELECT jsonb_agg(jsonb_build_object('label',enumlabel,'order',enumsortorder) ORDER BY enumsortorder)
        FROM pg_enum WHERE enumtypid=t.oid),
      'domain_constraints',(SELECT jsonb_agg(jsonb_build_object('name',conname,'definition',pg_get_constraintdef(oid),
        'validated',convalidated) ORDER BY conname) FROM pg_constraint WHERE contypid=t.oid),
      'range',(SELECT to_jsonb(r)-'rngtypid' FROM pg_range r WHERE r.rngtypid=t.oid),
      'relation',CASE WHEN typrelid<>0 THEN typrelid::regclass::text END
    ) AS catalog
  FROM type_inventory t WHERE NOT shopping
),
exclusions AS (
  SELECT 'relation' AS class,nspname AS schema,relname AS name,relkind::text AS identity,
    'Exact authorized Shopping object; separate exact postflight required' AS reason FROM relations WHERE shopping
  UNION ALL
  SELECT 'function',nspname,proname,pg_get_function_identity_arguments(oid),
    'Exact authorized Shopping function; separate exact postflight required' FROM function_inventory WHERE shopping
  UNION ALL
  SELECT 'type',nspname,typname,'',
    'Exact authorized Shopping row/array type; separate exact postflight required' FROM type_inventory WHERE shopping
),
uncovered AS (
  SELECT nspname AS schema,relname AS name,relkind AS kind,
    'Unsupported relation kind; cannot safely fingerprint data' AS reason
  FROM targets WHERE relkind NOT IN ('r','p','v','m','S','i','I','c')
)
SELECT jsonb_build_object(
  'contract_version',2,'scope','All public relations, public functions/types, and external relation-trigger functions',
  'executor',current_user,'read_only',current_setting('transaction_read_only'),
  'recipe_tables_present',(SELECT count(*)=3 FROM targets WHERE relkind='r'
    AND relname IN ('meals_recipes','meals_recipe_categories','meals_recipe_cuisines')),
  'inventory',(SELECT coalesce(jsonb_agg(jsonb_build_object('schema',nspname,'name',relname,'kind',relkind)
    ORDER BY nspname,relname),'[]'::jsonb) FROM relations),
  'function_inventory',(SELECT coalesce(jsonb_agg(jsonb_build_object('schema',nspname,'name',proname,
    'identity',pg_get_function_identity_arguments(oid)) ORDER BY nspname,proname,pg_get_function_identity_arguments(oid)),
    '[]'::jsonb) FROM function_inventory),
  'type_inventory',(SELECT coalesce(jsonb_agg(jsonb_build_object('schema',nspname,'name',typname)
    ORDER BY nspname,typname),'[]'::jsonb) FROM type_inventory),
  'objects',(SELECT coalesce(jsonb_agg(jsonb_build_object('schema',schema,'name',name,'kind',kind,'catalog',catalog,
    'catalog_sha256',encode(sha256(convert_to(catalog::text,'UTF8')),'hex'),'data',data)
    ORDER BY schema,name),'[]'::jsonb) FROM objects),
  'functions',(SELECT coalesce(jsonb_agg(jsonb_build_object('schema',schema,'name',name,'identity',identity,
    'catalog',catalog,'catalog_sha256',encode(sha256(convert_to(catalog::text,'UTF8')),'hex'))
    ORDER BY schema,name,identity),'[]'::jsonb) FROM functions),
  'types',(SELECT coalesce(jsonb_agg(jsonb_build_object('schema',schema,'name',name,'catalog',catalog,
    'catalog_sha256',encode(sha256(convert_to(catalog::text,'UTF8')),'hex')) ORDER BY schema,name),'[]'::jsonb) FROM types),
  'exclusions',(SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY class,schema,name,identity),'[]'::jsonb) FROM exclusions e),
  'uncovered',(SELECT coalesce(jsonb_agg(to_jsonb(u) ORDER BY schema,name),'[]'::jsonb) FROM uncovered u),
  'auth_uid',(SELECT jsonb_build_object('definition',pg_get_functiondef(p.oid),
    'owner',pg_get_userbyid(p.proowner),'acl',p.proacl,'config',p.proconfig,'definer',p.prosecdef)
    FROM pg_proc p WHERE p.oid=to_regprocedure('auth.uid()')),
  'schemas',(SELECT jsonb_agg(jsonb_build_object('name',nspname,'owner',pg_get_userbyid(nspowner),'acl',nspacl)
    ORDER BY nspname) FROM pg_namespace WHERE nspname IN ('public','auth')),
  'default_acl',(SELECT coalesce(jsonb_agg(jsonb_build_object('owner',pg_get_userbyid(d.defaclrole),
    'schema',n.nspname,'type',d.defaclobjtype,'acl',d.defaclacl)
    ORDER BY d.defaclrole,n.nspname,d.defaclobjtype),'[]'::jsonb)
    FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace)
) AS preservation;
ROLLBACK;
