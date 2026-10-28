-- REVIEW ONLY. Catalog/identity metadata only, no application rows or credentials.
-- Set the exact human Auth UUID after creating/identifying that account.
WITH configured AS (SELECT NULL::uuid AS owner_uuid)
SELECT c.owner_uuid, u.id IS NOT NULL AS owner_exists,
       u.email_confirmed_at IS NOT NULL AS email_confirmed,
       u.is_anonymous,
       COALESCE(u.banned_until > now(),false) AS currently_banned,
       c.owner_uuid IS NOT NULL
         AND c.owner_uuid <> 'c01098c9-ffa6-4134-a1ad-025a076e9855'::uuid
         AND u.id IS NOT NULL AND NOT u.is_anonymous
         AND u.email_confirmed_at IS NOT NULL
         AND NOT COALESCE(u.banned_until > now(),false) AS human_owner_ready
FROM configured c LEFT JOIN auth.users u ON u.id=c.owner_uuid;

SELECT r.rolname,r.rolsuper,r.rolbypassrls,
       ARRAY(SELECT inherited.rolname FROM pg_roles inherited
             WHERE inherited.oid<>r.oid AND pg_has_role(r.oid,inherited.oid,'MEMBER')
             ORDER BY inherited.rolname) AS member_of
FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role');

SELECT n.nspname,c.relname,c.relkind,pg_get_userbyid(c.relowner) AS owner,
       c.relrowsecurity,c.relforcerowsecurity,c.reloptions,c.relacl,
       a.attname,a.attacl
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
LEFT JOIN pg_attribute a ON a.attrelid=c.oid AND a.attacl IS NOT NULL AND a.attnum>0
WHERE n.nspname='public' AND c.relname IN (
  'planner_tasks','planner_weekly_tasks','planner_parking_lot',
  'projects_home','projects_vehicle','projects_repeating','projects_misc',
  'activity_types','activity_rules','activity_weekly_grid',
  'trips','trips_workflow_metadata','trips_timeline',
  'project_registry','projects','repeatable_masters','repeatable_overrides',
  'task_manager','weekly_tasks','curated_queue','parking_lot','planner_profiles','staged_queue',
  'projects_all','projects_home_external_id_seq','projects_vehicle_external_id_seq',
  'projects_repeating_external_id_seq','projects_misc_external_id_seq')
ORDER BY c.relname,a.attname;

-- postgres authority is required. supabase_admin is informational only:
-- its six scopes are preserved and checked against accepted evidence.
SELECT current_user AS executor,r.rolname AS object_creator,
       pg_has_role(current_user,r.oid,'USAGE') AS can_alter_creator_defaults,
       CASE WHEN r.rolname='postgres' THEN 'REQUIRED_FOR_CUTOVER'
            ELSE 'RESIDUAL_MANAGED_DEFAULT_EXPOSURE' END AS treatment
FROM pg_roles r WHERE r.rolname IN ('postgres','supabase_admin')
ORDER BY r.rolname;

-- Review schema and global layers. Absence of a global function ACL means the
-- built-in PUBLIC EXECUTE default; the rollback generator captures that too.
SELECT pg_get_userbyid(d.defaclrole) AS creator,n.nspname,d.defaclobjtype,d.defaclacl
FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
WHERE d.defaclnamespace=0 OR n.nspname='public';
