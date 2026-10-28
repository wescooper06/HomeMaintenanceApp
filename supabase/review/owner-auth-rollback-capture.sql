-- REVIEW ONLY, READ ONLY. Run BEFORE cutover and export EVERY rollback_sql row.
-- Assemble in ordinal order as one SQL script, preserve hashes, review before use.
-- Generated rollback is gated and restores the pre-cutover browser exposure.
WITH relations AS (
  SELECT c.*, n.nspname
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = ANY(ARRAY[
    'planner_tasks','planner_weekly_tasks','planner_parking_lot',
    'projects_home','projects_vehicle','projects_repeating','projects_misc',
    'activity_types','activity_rules','activity_weekly_grid',
    'trips','trips_workflow_metadata','trips_timeline',
    'project_registry','projects','repeatable_masters','repeatable_overrides',
    'task_manager','weekly_tasks','curated_queue','parking_lot','planner_profiles','staged_queue',
    'projects_all'
  ])
), functions AS (
  SELECT p.* FROM pg_proc p WHERE p.oid = ANY(ARRAY[
    to_regprocedure('public.create_workbench_project(text,jsonb)')::oid,
    to_regprocedure('public.delete_workbench_project(uuid,text)')::oid,
    to_regprocedure('public.replace_planner_curated_queue(text,jsonb)')::oid,
    to_regprocedure('public.enqueue_planner_staged_task(text,text,jsonb)')::oid,
    to_regprocedure('public.import_planner_legacy_state(text,jsonb)')::oid
  ])
), sequences AS (
  SELECT c.* FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='S' AND c.relname IN (
    'projects_home_external_id_seq','projects_vehicle_external_id_seq',
    'projects_repeating_external_id_seq','projects_misc_external_id_seq'
  )
), default_scopes AS (
  SELECT r.oid AS creator_oid,r.rolname AS creator,t.kind,t.object_type,
         s.namespace_oid,s.scope_sql,
         COALESCE(d.defaclacl,
           CASE WHEN s.namespace_oid=0 THEN acldefault(t.kind::"char",r.oid)
                ELSE '{}'::aclitem[] END) AS original_acl
  FROM pg_roles r
  CROSS JOIN (VALUES ('r','TABLES'),('f','FUNCTIONS'),('S','SEQUENCES')) t(kind,object_type)
  CROSS JOIN (VALUES (0::oid,''::text),
    ('public'::regnamespace::oid,' IN SCHEMA public')) s(namespace_oid,scope_sql)
  LEFT JOIN pg_default_acl d ON d.defaclrole=r.oid
    AND d.defaclobjtype=t.kind::"char" AND d.defaclnamespace=s.namespace_oid
  WHERE r.rolname='postgres'
), commands AS (
  SELECT 0 AS phase, ''::text AS identity,
    $gate$BEGIN;
DO $rollback$ BEGIN
  IF NOT false THEN RAISE EXCEPTION 'Rollback disabled; requires separate authorization.'; END IF;
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Use postgres.'; END IF;
END $rollback$;
SET LOCAL lock_timeout = '5s';
$gate$ AS rollback_sql
  UNION ALL
  SELECT 1, 'counts', format(
    '-- CAPTURE COUNTS: relations=%s (expect 24); functions=%s (expect 5); sequences=%s (expect 4).',
    (SELECT count(*) FROM relations),(SELECT count(*) FROM functions),(SELECT count(*) FROM sequences))
  UNION ALL
  SELECT 2,'default-scopes',format(
    '-- DEFAULT PRIVILEGE CAPTURE: scopes=%s (expect 6: postgres x 3 types x global/public; managed scopes unchanged).',
    (SELECT count(*) FROM default_scopes))
  UNION ALL
  SELECT 10, p.oid::text, pg_get_functiondef(p.oid) || ';' FROM functions p
  UNION ALL
  SELECT 20, r.relname, format(
    'REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated;',r.relname) FROM relations r
  UNION ALL
  SELECT 21, r.relname || p.polname, format('DROP POLICY IF EXISTS %I ON public.%I;',p.polname,r.relname)
    FROM relations r JOIN pg_policy p ON p.polrelid=r.oid
  -- The new policies may not exist at capture time; explicitly remove all possible new names.
  UNION ALL
  SELECT 22, r.relname || op, format('DROP POLICY IF EXISTS %I ON public.%I;','owner_'||op,r.relname)
    FROM relations r CROSS JOIN unnest(ARRAY['select','insert','update','delete']) op
    WHERE r.relkind='r'
  UNION ALL
  SELECT 30, r.relname, format(
    'ALTER TABLE public.%I %s ROW LEVEL SECURITY; ALTER TABLE public.%I %s FORCE ROW LEVEL SECURITY;',
    r.relname,CASE WHEN r.relrowsecurity THEN 'ENABLE' ELSE 'DISABLE' END,
    r.relname,CASE WHEN r.relforcerowsecurity THEN '' ELSE 'NO' END)
    FROM relations r WHERE r.relkind='r'
  UNION ALL
  SELECT 31, r.relname || p.polname, format(
    'CREATE POLICY %I ON public.%I AS %s FOR %s TO %s%s%s;',
    p.polname,r.relname,CASE WHEN p.polpermissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
    CASE p.polcmd WHEN '*' THEN 'ALL' WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
      WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE' END,
    (SELECT string_agg(CASE WHEN role_oid=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(role_oid)) END,', ')
       FROM unnest(p.polroles) role_oid),
    CASE WHEN p.polqual IS NULL THEN '' ELSE ' USING ('||pg_get_expr(p.polqual,p.polrelid)||')' END,
    CASE WHEN p.polwithcheck IS NULL THEN '' ELSE ' WITH CHECK ('||pg_get_expr(p.polwithcheck,p.polrelid)||')' END)
    FROM relations r JOIN pg_policy p ON p.polrelid=r.oid
  UNION ALL
  SELECT 40, r.relname || a.grantee || a.privilege_type,
    format('GRANT %s ON TABLE public.%I TO %s%s;',a.privilege_type,r.relname,
      CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(a.grantee)) END,
      CASE WHEN a.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END)
    FROM relations r CROSS JOIN LATERAL aclexplode(COALESCE(r.relacl,acldefault('r',r.relowner))) a
    WHERE a.grantee IN (0,'anon'::regrole,'authenticated'::regrole)
  UNION ALL
  SELECT 50, p.oid::text, format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated;',p.oid::regprocedure)
    FROM functions p
  UNION ALL
  SELECT 51, p.oid::text || a.grantee,format('GRANT EXECUTE ON FUNCTION %s TO %s%s;',p.oid::regprocedure,
    CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(a.grantee)) END,
    CASE WHEN a.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END)
    FROM functions p CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
    WHERE a.grantee IN (0,'anon'::regrole,'authenticated'::regrole) AND a.privilege_type='EXECUTE'
  UNION ALL
  SELECT 60,c.relname,format('REVOKE ALL ON SEQUENCE public.%I FROM PUBLIC, anon, authenticated;',c.relname)
    FROM sequences c
  UNION ALL
  SELECT 61,c.relname || a.grantee || a.privilege_type,format('GRANT %s ON SEQUENCE public.%I TO %s%s;',
    a.privilege_type,c.relname,
    CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(a.grantee)) END,
    CASE WHEN a.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END)
    FROM sequences c CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('s',c.relowner))) a
    WHERE a.grantee IN (0,'anon'::regrole,'authenticated'::regrole)
  UNION ALL
  SELECT 70,'projects_all',CASE
    WHEN EXISTS (SELECT 1 FROM pg_options_to_table(c.reloptions) o WHERE o.option_name='security_invoker')
    THEN format('ALTER VIEW public.projects_all SET (security_invoker = %L);',
      (SELECT option_value FROM pg_options_to_table(c.reloptions) WHERE option_name='security_invoker'))
    ELSE 'ALTER VIEW public.projects_all RESET (security_invoker);' END
    FROM relations c WHERE c.relname='projects_all'
  UNION ALL
  SELECT 80,d.creator||d.kind||d.namespace_oid,format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I%s REVOKE ALL ON %s FROM PUBLIC, anon, authenticated;',
    d.creator,d.scope_sql,d.object_type)
  FROM default_scopes d
  UNION ALL
  SELECT 81,d.creator||d.kind||d.namespace_oid||a.grantee||a.privilege_type,format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I%s GRANT %s ON %s TO %s%s;',
    d.creator,d.scope_sql,a.privilege_type,d.object_type,
    CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(a.grantee)) END,
    CASE WHEN a.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END)
  FROM default_scopes d CROSS JOIN LATERAL aclexplode(d.original_acl) a
  WHERE a.grantee IN (0,'anon'::regrole,'authenticated'::regrole)
  UNION ALL SELECT 99,'','COMMIT;'
)
SELECT row_number() OVER (ORDER BY phase,identity,rollback_sql) AS ordinal,rollback_sql
FROM commands ORDER BY ordinal;
