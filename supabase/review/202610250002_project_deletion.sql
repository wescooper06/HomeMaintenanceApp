-- NOT EXECUTED. Owner-reviewed modern-only cascade; deploy before application.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.delete_workbench_project(p_id uuid, p_type text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $function$
DECLARE
  target text;
  master jsonb;
  task_ids uuid[];
  weekly_ids text[];
  parking_ids text[];
  blockers jsonb;
  task_count bigint;
  weekly_count bigint;
  parking_count bigint;
  master_count bigint;
BEGIN
  IF p_id IS NULL OR p_id = '00000000-0000-0000-0000-000000000000'::uuid
     OR p_type IS NULL OR p_type NOT IN ('home', 'vehicle', 'repeating', 'misc') THEN
    RAISE EXCEPTION 'An existing project UUID and canonical type are required.' USING ERRCODE = '22023';
  END IF;
  target := 'projects_' || p_type;
  PERFORM pg_catalog.set_config('lock_timeout', '5s', true);
  -- Fixed ordering serializes modern writers for dependency collection/deletion.
  LOCK TABLE public.projects_home, public.projects_vehicle,
    public.projects_repeating, public.projects_misc,
    public.planner_tasks, public.planner_weekly_tasks, public.planner_parking_lot
    IN SHARE ROW EXCLUSIVE MODE;

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
  EXECUTE pg_catalog.format('SELECT to_jsonb(p) FROM public.%I p WHERE id = $1', target)
    INTO master USING p_id;
  IF master IS NULL THEN
    RAISE EXCEPTION 'Project UUID/type mismatch or project not found.' USING ERRCODE = 'P0002';
  END IF;
  IF (SELECT count(*) FROM public.projects_all WHERE id = p_id) <> 1 THEN
    RAISE EXCEPTION 'Project UUID is ambiguous across raw tables.';
  END IF;
  SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO task_ids
  FROM public.planner_tasks WHERE project_id = p_id::text;
  SELECT coalesce(array_agg(id), ARRAY[]::text[]) INTO weekly_ids
  FROM public.planner_weekly_tasks
  WHERE project_id = p_id::text
     OR (p_type = 'repeating' AND parent_rep = p_id::text)
     OR metadata_json->>'sourceTaskId' = ANY(task_ids::text[])
     OR parent_rep = ANY(task_ids::text[]);
  IF 'week-settings' = ANY(weekly_ids) THEN
    RAISE EXCEPTION 'Shared week-settings contains a project ownership conflict; no records deleted.';
  END IF;
  -- An explicit link to another project must not be silently cascaded.
  IF EXISTS (
    SELECT 1 FROM public.planner_weekly_tasks w
    WHERE w.id = ANY(weekly_ids) AND (
      (nullif(w.project_id, '') IS NOT NULL AND w.project_id <> p_id::text
        AND NOT w.project_id = ANY(task_ids::text[]))
      OR (nullif(w.parent_rep, '') IS NOT NULL AND w.parent_rep <> p_id::text
        AND NOT w.parent_rep = ANY(task_ids::text[]))
      OR (nullif(w.metadata_json->>'sourceTaskId', '') IS NOT NULL
        AND w.metadata_json->>'sourceTaskId' <> p_id::text
        AND NOT w.metadata_json->>'sourceTaskId' = ANY(task_ids::text[]))
    )
  ) THEN
    RAISE EXCEPTION 'Weekly ownership identities conflict; no records deleted.';
  END IF;
  SELECT coalesce(array_agg(id), ARRAY[]::text[]) INTO parking_ids
  FROM public.planner_parking_lot
  WHERE converted_to_type IS TRUE AND (
    (metadata_json->>'conversionType' IN ('project', 'repeatable') AND converted_to_id = p_id::text)
    OR (metadata_json->>'conversionType' IN ('task-manager', 'ad-hoc')
        AND converted_to_id = ANY(task_ids::text[]))
    OR (metadata_json->>'conversionType' = 'weekly' AND converted_to_id = ANY(weekly_ids))
  );
  SELECT jsonb_agg(candidate) INTO blockers FROM (
    SELECT jsonb_build_object('table', 'planner_tasks', 'id', t.id,
             'path', r.path, 'notification', r.reminder) AS candidate
    FROM public.planner_tasks t
    CROSS JOIN LATERAL (VALUES
      ('metadata_json.reminder', t.metadata_json->'reminder'),
      ('metadata_json.reminderJson', t.metadata_json->'reminderJson')
    ) r(path, reminder)
    WHERE t.id = ANY(task_ids)
      AND lower(coalesce(r.reminder->>'active', '')) = 'true'
      AND (nullif(r.reminder->>'eventId', '') IS NOT NULL
        OR nullif(r.reminder->>'event_id', '') IS NOT NULL
        OR r.reminder->>'provider' IN ('google-calendar', 'google_calendar'))
    UNION ALL
    SELECT jsonb_build_object('table', 'planner_weekly_tasks', 'id', w.id,
             'path', r.path, 'notification', r.reminder)
    FROM public.planner_weekly_tasks w
    CROSS JOIN LATERAL (VALUES
      ('reminder_json', w.reminder_json),
      ('metadata_json.reminder', w.metadata_json->'reminder'),
      ('metadata_json.reminderJson', w.metadata_json->'reminderJson')
    ) r(path, reminder)
    WHERE w.id = ANY(weekly_ids)
      AND lower(coalesce(r.reminder->>'active', '')) = 'true'
      AND (nullif(r.reminder->>'eventId', '') IS NOT NULL
        OR nullif(r.reminder->>'event_id', '') IS NOT NULL
        OR r.reminder->>'provider' IN ('google-calendar', 'google_calendar'))
  ) notifications;
  IF blockers IS NOT NULL THEN
    RAISE EXCEPTION 'Active remote notifications block project deletion.'
      USING DETAIL = blockers::text;
  END IF;
  DELETE FROM public.planner_parking_lot WHERE id = ANY(parking_ids);
  GET DIAGNOSTICS parking_count = ROW_COUNT;
  DELETE FROM public.planner_weekly_tasks WHERE id = ANY(weekly_ids);
  GET DIAGNOSTICS weekly_count = ROW_COUNT;
  DELETE FROM public.planner_tasks WHERE id = ANY(task_ids);
  GET DIAGNOSTICS task_count = ROW_COUNT;
  EXECUTE pg_catalog.format('DELETE FROM public.%I WHERE id = $1', target) USING p_id;
  GET DIAGNOSTICS master_count = ROW_COUNT;
  IF master_count <> 1 OR task_count <> cardinality(task_ids)
     OR weekly_count <> cardinality(weekly_ids) OR parking_count <> cardinality(parking_ids) THEN
    RAISE EXCEPTION 'Project deletion row counts did not match the verified dependency set.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.projects_all WHERE id = p_id) THEN
    RAISE EXCEPTION 'Deleted project remains in projects_all.';
  END IF;
  RETURN jsonb_build_object('deleted', true, 'id', p_id, 'project_type', p_type,
    'external_id', master->>'external_id', 'table', target,
    'counts', jsonb_build_object(target, master_count,
      'planner_tasks', task_count, 'planner_weekly_tasks', weekly_count,
      'planner_parking_lot', parking_count));
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_workbench_project(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_workbench_project(uuid, text) TO anon, authenticated;
COMMIT;
