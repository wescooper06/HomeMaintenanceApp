-- Catalog only; does not invoke application RPCs or read application rows.
SELECT n.nspname AS schema, c.relname, c.relrowsecurity, c.relforcerowsecurity,
       c.reloptions, c.relacl AS stored_acl,
       has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
         AS anon_any_table_privilege,
       has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_select,
       has_table_privilege('authenticated', c.oid, 'INSERT') AS authenticated_insert,
       has_table_privilege('authenticated', c.oid, 'UPDATE') AS authenticated_update,
       has_table_privilege('authenticated', c.oid, 'DELETE') AS authenticated_delete,
       has_table_privilege('authenticated', c.oid, 'TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
         AS authenticated_unnecessary_privilege,
       COALESCE((
         SELECT jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,
           'roles',p.polroles,'using',pg_get_expr(p.polqual,p.polrelid),
           'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname)
         FROM pg_policy p WHERE p.polrelid = c.oid
       ),'[]') AS policies
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v')
ORDER BY c.relname;

-- Six postgres rows must be hardened; six managed rows remain residual exposure.
-- Missing global ACL rows use PostgreSQL built-ins (not an empty ACL).
WITH scopes AS (
  SELECT r.rolname,t.kind,s.namespace_oid,
    COALESCE(d.defaclacl,
      CASE WHEN s.namespace_oid=0 THEN acldefault(t.kind::"char",r.oid)
           ELSE '{}'::aclitem[] END) AS effective_layer_acl
  FROM pg_roles r
  CROSS JOIN (VALUES ('r'),('f'),('S')) t(kind)
  CROSS JOIN (VALUES (0::oid),('public'::regnamespace::oid)) s(namespace_oid)
  LEFT JOIN pg_default_acl d ON d.defaclrole=r.oid
    AND d.defaclobjtype=t.kind::"char" AND d.defaclnamespace=s.namespace_oid
  WHERE r.rolname IN ('postgres','supabase_admin')
)
SELECT rolname,kind,
       CASE WHEN namespace_oid=0 THEN 'GLOBAL' ELSE 'public' END AS scope,
       effective_layer_acl,
       NOT EXISTS (SELECT 1 FROM aclexplode(effective_layer_acl) a
         WHERE a.grantee IN (0,'anon'::regrole,'authenticated'::regrole))
         AS browser_defaults_empty,
       CASE WHEN rolname='supabase_admin' THEN 'RESIDUAL_MANAGED_DEFAULT_EXPOSURE'
            WHEN NOT EXISTS (SELECT 1 FROM aclexplode(effective_layer_acl) a
              WHERE a.grantee IN (0,'anon'::regrole,'authenticated'::regrole))
              THEN 'POSTGRES_DEFAULTS_HARDENED'
            ELSE 'FAIL_POSTGRES_DEFAULT_EXPOSURE' END AS status
FROM scopes ORDER BY rolname,kind,namespace_oid;

-- Exactly six rows, each matches_accepted_evidence=true, are required.
WITH expected(kind,namespace_oid,expected_acl) AS (VALUES
 ('r',0::oid,'{supabase_admin=arwdDxtm/supabase_admin}'),
 ('f',0::oid,'{=X/supabase_admin,supabase_admin=X/supabase_admin}'),
 ('S',0::oid,'{supabase_admin=U/supabase_admin}'),
 ('r','public'::regnamespace::oid,'{postgres=arwdDxtm/supabase_admin,anon=arwdDxtm/supabase_admin,authenticated=arwdDxtm/supabase_admin,service_role=arwdDxtm/supabase_admin}'),
 ('f','public'::regnamespace::oid,'{postgres=X/supabase_admin,anon=X/supabase_admin,authenticated=X/supabase_admin,service_role=X/supabase_admin}'),
 ('S','public'::regnamespace::oid,'{postgres=rwU/supabase_admin,anon=rwU/supabase_admin,authenticated=rwU/supabase_admin,service_role=rwU/supabase_admin}')
)
SELECT 'RESIDUAL_MANAGED_DEFAULT_EXPOSURE' AS status,e.kind,
       CASE WHEN e.namespace_oid=0 THEN 'GLOBAL' ELSE 'public' END AS scope,
       d.defaclacl AS stored_acl,
       (CASE WHEN e.namespace_oid=0 THEN d.oid IS NULL ELSE d.oid IS NOT NULL END)
       AND ARRAY(SELECT a::text FROM unnest(COALESCE(d.defaclacl,
         acldefault(e.kind::"char",'supabase_admin'::regrole))) a ORDER BY a::text)
         = ARRAY(SELECT a::text FROM unnest(e.expected_acl::aclitem[]) a ORDER BY a::text)
         AS matches_accepted_evidence
FROM expected e LEFT JOIN pg_default_acl d ON d.defaclrole='supabase_admin'::regrole
  AND d.defaclobjtype=e.kind::"char" AND d.defaclnamespace=e.namespace_oid
ORDER BY e.kind,e.namespace_oid;

WITH expected(signature) AS (VALUES
 ('public.create_workbench_project(text,jsonb)'),
 ('public.delete_workbench_project(uuid,text)'),
 ('public.replace_planner_curated_queue(text,jsonb)'),
 ('public.enqueue_planner_staged_task(text,text,jsonb)'),
 ('public.import_planner_legacy_state(text,jsonb)')
)
SELECT signature, to_regprocedure(signature) IS NOT NULL AS found,
       p.prosecdef AS security_definer,
       has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
       has_function_privilege('service_role',p.oid,'EXECUTE') AS service_role_execute,
       p.proconfig,
       pg_get_functiondef(p.oid) AS definition
FROM expected LEFT JOIN pg_proc p ON p.oid = to_regprocedure(signature);

SELECT c.relname,c.relacl AS stored_acl,
       has_sequence_privilege('anon',c.oid,'USAGE,SELECT,UPDATE') AS anon_any,
       has_sequence_privilege('authenticated',c.oid,'USAGE') AS authenticated_usage,
       has_sequence_privilege('authenticated',c.oid,'SELECT,UPDATE') AS authenticated_unnecessary
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='S' AND c.relname IN (
  'projects_home_external_id_seq','projects_vehicle_external_id_seq',
  'projects_repeating_external_id_seq','projects_misc_external_id_seq')
ORDER BY c.relname;
