-- REVIEW ONLY. Owner UUID is confirmed; execution approval remains disabled.
-- Capture and save owner-auth-rollback-capture.sql output FIRST.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $cutover$
DECLARE
  approved_for_execution boolean := false;
  owner_uuid uuid := 'e72bccd9-ec2b-4822-bb5c-b7c1f39dcf60';
  table_name text;
  operation text;
  policy record;
  signature text;
  function_oid oid;
  definition text;
  guard text;
  allowed text[];
  creator text;
  object_type text;
  managed_scope record;
  actual_acl aclitem[];
  managed_before jsonb;
  managed_after jsonb;
  tables constant text[] := ARRAY[
    'planner_tasks','planner_weekly_tasks','planner_parking_lot',
    'projects_home','projects_vehicle','projects_repeating','projects_misc',
    'activity_types','activity_rules','activity_weekly_grid',
    'trips','trips_workflow_metadata','trips_timeline',
    'project_registry','projects','repeatable_masters','repeatable_overrides',
    'task_manager','weekly_tasks','curated_queue','parking_lot','planner_profiles','staged_queue'
  ];
  legacy constant text[] := ARRAY[
    'project_registry','projects','repeatable_masters','repeatable_overrides',
    'task_manager','weekly_tasks','curated_queue','parking_lot','planner_profiles','staged_queue'
  ];
  signatures constant text[] := ARRAY[
    'public.create_workbench_project(text,jsonb)',
    'public.delete_workbench_project(uuid,text)',
    'public.replace_planner_curated_queue(text,jsonb)',
    'public.enqueue_planner_staged_task(text,text,jsonb)',
    'public.import_planner_legacy_state(text,jsonb)'
  ];
  old_guard constant text := $old$
  -- Fail closed if later RLS changes could hide dependencies from the invoker.
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN ('projects_home', 'projects_vehicle', 'projects_repeating', 'projects_misc',
                        'planner_tasks', 'planner_weekly_tasks', 'planner_parking_lot')
      AND (c.relrowsecurity OR c.relforcerowsecurity)
  ) THEN
    RAISE EXCEPTION 'Project deletion requires a new review after modern-table RLS changes.';
  END IF;
$old$;
BEGIN
  IF NOT approved_for_execution OR owner_uuid IS NULL THEN
    RAISE EXCEPTION 'Owner cutover blocked: gate or human owner UUID is unset.';
  END IF;
  IF current_user <> 'postgres'
     OR owner_uuid = '00000000-0000-0000-0000-000000000000'
     OR owner_uuid = 'c01098c9-ffa6-4134-a1ad-025a076e9855' THEN
    RAISE EXCEPTION 'Owner cutover blocked: invalid owner/execution identity.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id=owner_uuid AND NOT is_anonymous
      AND email_confirmed_at IS NOT NULL AND NOT COALESCE(banned_until>now(),false)
  ) THEN
    RAISE EXCEPTION 'Owner cutover blocked: confirmed, unbanned human Auth identity required.';
  END IF;
  IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('postgres','supabase_admin')) <> 2 THEN
    RAISE EXCEPTION 'Missing reviewed future-object creator role.';
  END IF;
  -- Compare all six managed layers to the accepted v2 catalog evidence.
  FOR managed_scope IN
    SELECT * FROM (VALUES
      ('r',0::oid,'{supabase_admin=arwdDxtm/supabase_admin}'),
      ('f',0::oid,'{=X/supabase_admin,supabase_admin=X/supabase_admin}'),
      ('S',0::oid,'{supabase_admin=U/supabase_admin}'),
      ('r','public'::regnamespace::oid,'{postgres=arwdDxtm/supabase_admin,anon=arwdDxtm/supabase_admin,authenticated=arwdDxtm/supabase_admin,service_role=arwdDxtm/supabase_admin}'),
      ('f','public'::regnamespace::oid,'{postgres=X/supabase_admin,anon=X/supabase_admin,authenticated=X/supabase_admin,service_role=X/supabase_admin}'),
      ('S','public'::regnamespace::oid,'{postgres=rwU/supabase_admin,anon=rwU/supabase_admin,authenticated=rwU/supabase_admin,service_role=rwU/supabase_admin}')
    ) v(kind,namespace_oid,expected_acl)
  LOOP
    SELECT d.defaclacl INTO actual_acl FROM pg_default_acl d
      WHERE d.defaclrole='supabase_admin'::regrole
        AND d.defaclobjtype=managed_scope.kind::"char"
        AND d.defaclnamespace=managed_scope.namespace_oid;
    IF (managed_scope.namespace_oid=0 AND FOUND)
       OR (managed_scope.namespace_oid<>0 AND NOT FOUND)
       OR ARRAY(SELECT a::text FROM unnest(COALESCE(actual_acl,
            acldefault(managed_scope.kind::"char",'supabase_admin'::regrole))) a ORDER BY a::text)
          IS DISTINCT FROM
          ARRAY(SELECT a::text FROM unnest(managed_scope.expected_acl::aclitem[]) a ORDER BY a::text)
    THEN
      RAISE EXCEPTION 'Managed default evidence drift: type %, namespace %. Stop for review.',
        managed_scope.kind,managed_scope.namespace_oid;
    END IF;
  END LOOP;
  SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.defaclnamespace,d.defaclobjtype),'[]')
    INTO managed_before FROM pg_default_acl d
    WHERE d.defaclrole='supabase_admin'::regrole
      AND d.defaclobjtype IN ('r','f','S')
      AND d.defaclnamespace IN (0,'public'::regnamespace);
  IF EXISTS (
    SELECT 1 FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    WHERE d.defaclrole='postgres'::regrole
      AND d.defaclobjtype IN ('r','f','S')
      AND d.defaclnamespace IN (0,'public'::regnamespace)
      AND a.grantee IN (0,'anon'::regrole,'authenticated'::regrole)
      AND a.grantor <> d.defaclrole
  ) THEN
    RAISE EXCEPTION 'Unexpected default-ACL grantor: recapture/review rollback.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('anon','authenticated')
             AND (rolsuper OR rolbypassrls))
     OR (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')) <> 3
     OR EXISTS (
       SELECT 1 FROM pg_roles browser CROSS JOIN pg_roles inherited
       WHERE browser.rolname IN ('anon','authenticated') AND browser.oid <> inherited.oid
         AND pg_has_role(browser.oid, inherited.oid, 'MEMBER')
     ) THEN
    RAISE EXCEPTION 'Owner cutover blocked: browser role configuration drift.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = to_regclass('public.projects_all')
                 AND relkind = 'v' AND relowner = 'postgres'::regrole) THEN
    RAISE EXCEPTION 'projects_all ordinary-view ownership drift.';
  END IF;

  FOREACH table_name IN ARRAY tables LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = to_regclass(format('public.%I',table_name))
                   AND relkind = 'r' AND relowner = 'postgres'::regrole) THEN
      RAISE EXCEPTION 'Missing or changed base table: %', table_name;
    END IF;
    EXECUTE format('LOCK TABLE public.%I IN ACCESS EXCLUSIVE MODE', table_name);
  END LOOP;

  -- Unexpected column privileges would require a separately captured/reviewed change.
  IF EXISTS (
    SELECT 1 FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(a.attacl) acl
    WHERE n.nspname = 'public'
      AND (c.relname = ANY(tables) OR c.relname = 'projects_all')
      AND acl.grantee IN (0,'anon'::regrole,'authenticated'::regrole)
  ) THEN
    RAISE EXCEPTION 'Unexpected column ACL: stop and review.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN LATERAL aclexplode(c.relacl) acl
    WHERE n.nspname='public' AND (
      c.relname=ANY(tables) OR c.relname IN ('projects_all',
        'projects_home_external_id_seq','projects_vehicle_external_id_seq',
        'projects_repeating_external_id_seq','projects_misc_external_id_seq'))
      AND acl.grantee IN (0,'anon'::regrole,'authenticated'::regrole)
      AND acl.grantor<>'postgres'::regrole
  ) THEN
    RAISE EXCEPTION 'Unexpected ACL grantor: capture/review an exact rollback first.';
  END IF;

  FOREACH signature IN ARRAY signatures LOOP
    function_oid := to_regprocedure(signature);
    IF function_oid IS NULL OR NOT EXISTS (
      SELECT 1 FROM pg_proc WHERE oid = function_oid
        AND proowner = 'postgres'::regrole AND NOT prosecdef AND prokind = 'f'
    ) THEN
      RAISE EXCEPTION 'Missing/changed invoker RPC: %', signature;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) acl
      WHERE p.oid=function_oid AND acl.grantee IN (0,'anon'::regrole,'authenticated'::regrole)
        AND acl.grantor<>'postgres'::regrole
    ) THEN
      RAISE EXCEPTION 'Unexpected RPC ACL grantor: %', signature;
    END IF;
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', signature);
  END LOOP;

  -- The old RPC deliberately refuses any RLS. Replace ONLY that reviewed guard.
  function_oid := to_regprocedure('public.delete_workbench_project(uuid,text)');
  definition := replace(pg_get_functiondef(function_oid), E'\r\n', E'\n');
  IF strpos(definition, replace(old_guard, E'\r\n', E'\n')) = 0
     OR strpos(definition, E'\nBEGIN\n  IF p_id IS NULL') = 0 THEN
    RAISE EXCEPTION 'Deletion guard differs from reviewed source. Do not patch by guessing.';
  END IF;
  guard := format(
    E'\n  IF current_user NOT IN (''postgres'',''service_role'') AND auth.uid() IS DISTINCT FROM %L::uuid THEN\n'
    '    RAISE EXCEPTION ''Owner authorization required.'' USING ERRCODE = ''42501'';\n'
    '  END IF;\n', owner_uuid::text);
  definition := replace(definition, replace(old_guard, E'\r\n', E'\n'), E'\n');
  EXECUTE replace(definition, E'\nBEGIN\n  IF p_id IS NULL',
    E'\nBEGIN\n' || guard || '  IF p_id IS NULL');
  -- Reject non-owner RPC callers before consuming the external-ID allocator.
  function_oid := to_regprocedure('public.create_workbench_project(text,jsonb)');
  definition := replace(pg_get_functiondef(function_oid), E'\r\n', E'\n');
  IF strpos(definition, E'\nbegin\n  prefix := case p_type') = 0 THEN
    RAISE EXCEPTION 'Creation body differs from reviewed source. Stop for exact review.';
  END IF;
  EXECUTE replace(definition, E'\nbegin\n  prefix := case p_type',
    E'\nbegin\n' || guard || '  prefix := case p_type');

  FOREACH table_name IN ARRAY tables LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated',table_name);
    -- Replace, do not combine with old permissive/shared-profile policies.
    FOR policy IN SELECT polname FROM pg_policy
      WHERE polrelid = to_regclass(format('public.%I',table_name))
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I',policy.polname,table_name);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',table_name);

    allowed := CASE
      WHEN table_name = ANY(legacy) THEN ARRAY[]::text[]
      WHEN table_name = 'activity_types' THEN ARRAY['SELECT']
      WHEN table_name = 'activity_weekly_grid' THEN ARRAY['SELECT','INSERT','DELETE']
      WHEN table_name = 'trips_timeline' THEN ARRAY['SELECT','INSERT','UPDATE']
      ELSE ARRAY['SELECT','INSERT','UPDATE','DELETE']
    END;
    FOREACH operation IN ARRAY allowed LOOP
      EXECUTE format('GRANT %s ON TABLE public.%I TO authenticated',operation,table_name);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR %s TO authenticated %s',
        'owner_' || lower(operation),table_name,operation,
        CASE operation
          WHEN 'INSERT' THEN format('WITH CHECK ((SELECT auth.uid()) = %L::uuid)',owner_uuid::text)
          WHEN 'UPDATE' THEN format(
            'USING ((SELECT auth.uid()) = %L::uuid) WITH CHECK ((SELECT auth.uid()) = %L::uuid)',
            owner_uuid::text,owner_uuid::text)
          ELSE format('USING ((SELECT auth.uid()) = %L::uuid)',owner_uuid::text)
        END);
    END LOOP;
  END LOOP;

  EXECUTE 'ALTER VIEW public.projects_all SET (security_invoker = true)';
  EXECUTE 'REVOKE ALL ON TABLE public.projects_all FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT SELECT ON TABLE public.projects_all TO authenticated';

  FOREACH table_name IN ARRAY ARRAY['home','vehicle','repeating','misc'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class WHERE oid=to_regclass(
        format('public.%I','projects_' || table_name || '_external_id_seq'))
        AND relkind='S' AND relowner='postgres'::regrole
    ) THEN
      RAISE EXCEPTION 'Missing/changed project allocator: %',table_name;
    END IF;
    EXECUTE format(
      'REVOKE ALL ON SEQUENCE public.%I FROM PUBLIC, anon, authenticated',
      'projects_' || table_name || '_external_id_seq');
    EXECUTE format('GRANT USAGE ON SEQUENCE public.%I TO authenticated',
      'projects_' || table_name || '_external_id_seq');
  END LOOP;
  GRANT EXECUTE ON FUNCTION public.create_workbench_project(text,jsonb),
    public.delete_workbench_project(uuid,text) TO authenticated;

  -- Schema defaults add to global defaults: both layers must be closed.
  -- Global FUNCTION revocation also affects future postgres-created functions
  -- in other schemas. Managed defaults remain a separately tracked exposure.
  FOREACH creator IN ARRAY ARRAY['postgres'] LOOP
    FOREACH object_type IN ARRAY ARRAY['TABLES','FUNCTIONS','SEQUENCES'] LOOP
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE ALL ON %s FROM PUBLIC, anon, authenticated',
        creator,object_type);
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON %s FROM PUBLIC, anon, authenticated',
        creator,object_type);
    END LOOP;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    WHERE d.defaclrole='postgres'::regrole
      AND d.defaclobjtype IN ('r','f','S')
      AND d.defaclnamespace IN (0,'public'::regnamespace)
      AND a.grantee IN (0,'anon'::regrole,'authenticated'::regrole)
  ) THEN
    RAISE EXCEPTION 'Future-object browser defaults remain: transaction blocked.';
  END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.defaclnamespace,d.defaclobjtype),'[]')
    INTO managed_after FROM pg_default_acl d
    WHERE d.defaclrole='supabase_admin'::regrole
      AND d.defaclobjtype IN ('r','f','S')
      AND d.defaclnamespace IN (0,'public'::regnamespace);
  IF managed_after IS DISTINCT FROM managed_before THEN
    RAISE EXCEPTION 'Managed defaults changed during cutover; transaction blocked.';
  END IF;
  RAISE NOTICE 'RESIDUAL_MANAGED_DEFAULT_EXPOSURE: six supabase_admin default scopes unchanged; platform support remediation required.';
END
$cutover$;

COMMIT;
-- A COMMIT receipt is required. Follow with owner-auth-verification.sql.
