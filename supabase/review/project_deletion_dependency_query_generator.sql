-- Read-only discovery, NOT an ownership rule and NOT a deletion script.
-- After schema review, replace ONLY the first settings CTE's nil UUID
-- and 'home' with the disposable persisted UUID and canonical project type.
-- Allowed types: home, vehicle, repeating, misc. Keep the later nil-ID guard.
-- Do not use Home Recycle or Repeating Project Test.
-- This returns ONE generated read-only SQL script as TEXT. Copy that cell
-- into a separate SQL Editor tab, review it, then run it as the owner role.
-- It scans public base tables, not views. It can be expensive.
-- Exact scalar matches are CANDIDATES only; never delete from this output.
-- READY FOR DEPENDENCY INSPECTION against the supplied catalog evidence.
-- Run generated SQL as postgres: older profile-scoped RLS can hide other profiles.
BEGIN TRANSACTION READ ONLY;

WITH settings AS (
  SELECT '3ad885b1-d2dc-43e2-931c-2d802ced63f8'::uuid AS project_id,
         'home'::text AS project_type
), tables AS (
  SELECT n.nspname, c.relname
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
    AND NOT c.relispartition
), scans AS (
  SELECT string_agg(format(
    'SELECT %L::text AS relation, to_jsonb(t) AS document FROM %I.%I t',
    nspname || '.' || relname, nspname, relname), E'\nUNION ALL\n'
    ORDER BY relname) AS sql FROM tables
)
SELECT format($query$BEGIN TRANSACTION READ ONLY;
WITH RECURSIVE
settings AS (SELECT %L::uuid AS project_id, %L::text AS project_type),
master AS (
  SELECT a.id::text AS id, a.external_id, a.project_type
  FROM public.projects_all a CROSS JOIN settings s
  WHERE a.id = s.project_id AND a.project_type = s.project_type
    AND s.project_id <> '00000000-0000-0000-0000-000000000000'::uuid
    AND s.project_type IN ('home', 'vehicle', 'repeating', 'misc')
),
records AS (
%s
),
identities(identity) AS (
  SELECT id FROM master
  UNION
  SELECT external_id FROM master WHERE nullif(external_id, '') IS NOT NULL
),
candidate_links AS (
  SELECT r.relation, r.document, link.identity
  FROM records r
  CROSS JOIN LATERAL (
    SELECT r.document->>'id' AS identity
    UNION
    SELECT field.value
    FROM jsonb_each_text(r.document) field
    WHERE r.relation IN (
      'public.project_registry', 'public.planner_tasks',
      'public.planner_weekly_tasks', 'public.planner_parking_lot',
      'public.repeatable_masters', 'public.repeatable_overrides',
      'public.task_manager', 'public.weekly_tasks',
      'public.curated_queue', 'public.staged_queue', 'public.parking_lot')
      AND field.key IN (
        'project_id', 'projectId', 'project_registry_id', 'planner_task_id',
        'taskId', 'parent_rep', 'parentRepeatableId', 'converted_to_id')
    UNION
    SELECT r.document #>> path.keys
    FROM (VALUES
      (ARRAY['metadata_json', 'sourceTaskId']),
      (ARRAY['metadataJson', 'sourceTaskId']),
      (ARRAY['convertedTo', 'id']),
      (ARRAY['item', 'id']), (ARRAY['item', 'taskId']),
      (ARRAY['item', 'projectId']), (ARRAY['item', 'parentRepeatableId']),
      (ARRAY['item', 'externalId']), (ARRAY['item', 'external_id'])
    ) AS path(keys)
    WHERE r.relation IN (
      'public.planner_weekly_tasks', 'public.weekly_tasks',
      'public.parking_lot', 'public.curated_queue', 'public.staged_queue')
  ) link
  WHERE nullif(link.identity, '') IS NOT NULL
),
candidate_ids(identity) AS (
  SELECT identity FROM identities
  UNION
  SELECT r.identity
  FROM candidate_ids c JOIN candidate_links r
    ON jsonb_path_exists(r.document, '$.** ? (@ == $identity)',
                        jsonb_build_object('identity', c.identity))
),
matches AS (
  SELECT DISTINCT r.relation, r.document->>'id' AS record_id,
         jsonb_strip_nulls(jsonb_build_object(
           'id', r.document->'id', 'source', r.document->'source',
           'profileId', r.document->'profileId', 'taskId', r.document->'taskId'
         )) AS candidate_row_key,
         field.key AS candidate_field, c.identity AS matched_identity,
         jsonb_strip_nulls(jsonb_build_object(
           'project_id', r.document->'project_id', 'projectId', r.document->'projectId',
           'project_type', r.document->'project_type', 'source', r.document->'source',
           'project_registry_id', r.document->'project_registry_id',
           'planner_task_id', r.document->'planner_task_id',
           'parent_rep', r.document->'parent_rep',
           'parentRepeatableId', r.document->'parentRepeatableId',
           'converted_to_type', r.document->'converted_to_type',
           'converted_to_id', r.document->'converted_to_id',
           'convertedTo', r.document->'convertedTo',
           'conversionType', r.document #> ARRAY['metadata_json', 'conversionType'],
           'sourceTaskId', r.document #> ARRAY['metadata_json', 'sourceTaskId'],
           'historicalSourceTaskId', r.document #> ARRAY['metadataJson', 'sourceTaskId'],
           'item', r.document->'item'
         )) AS identity_context,
         r.document->'deleted' AS deleted,
         r.document->'archived' AS archived,
         r.document->'completed' AS completed,
         r.document->'overridden' AS overridden,
         r.document->'deleted_instance' AS deleted_instance,
         r.document->'deletedInstance' AS historical_deleted_instance,
         r.document #> ARRAY['metadata_json', 'series'] AS series_state,
         r.document #> ARRAY['metadata_json', 'queue'] AS queue_state,
         r.document->'reminder_json' AS reminder_state,
         r.document->'reminderJson' AS historical_reminder_state
  FROM records r CROSS JOIN LATERAL jsonb_each(r.document) field
  JOIN candidate_ids c
    ON jsonb_path_exists(field.value, '$.** ? (@ == $identity)',
                        jsonb_build_object('identity', c.identity))
)
SELECT 'identity_check' AS section,
       jsonb_build_object('requested_uuid', s.project_id,
         'requested_type', s.project_type,
         'matching_masters', (SELECT count(*) FROM master),
         'valid_for_review', (SELECT count(*) = 1 FROM master)) AS detail
FROM settings s
UNION ALL
SELECT 'inspection_context', jsonb_build_object(
  'role', current_user, 'row_security', current_setting('row_security'),
  'has_bypass_rls', roles.rolbypassrls, 'is_superuser', roles.rolsuper,
  'scope', 'public base tables; candidate references are not ownership')
FROM pg_roles roles WHERE roles.rolname = current_user
UNION ALL
SELECT 'profile_scope', jsonb_build_object(
  'relation', r.relation, 'profile_id', r.document->>'profileId',
  'row_count', count(*))
FROM records r
WHERE r.relation IN ('public.parking_lot', 'public.curated_queue', 'public.staged_queue')
GROUP BY r.relation, r.document->>'profileId'
UNION ALL
SELECT 'candidate_reference', to_jsonb(m) FROM matches m
ORDER BY section, detail;
COMMIT;$query$, s.project_id::text, s.project_type, scans.sql) AS inspection_sql
FROM settings s CROSS JOIN scans;

COMMIT;
