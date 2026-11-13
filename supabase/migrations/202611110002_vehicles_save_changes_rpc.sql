BEGIN;

CREATE FUNCTION public.vehicles_rpc_fail(
  p_code text,
  p_message text,
  p_context jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = 'P0001',
    MESSAGE = p_message,
    DETAIL = pg_catalog.jsonb_build_object(
      'code', p_code,
      'context', COALESCE(p_context, '{}'::jsonb)
    )::text;
END
$function$;

CREATE FUNCTION public.vehicles_rpc_assert_object(
  p_value jsonb,
  p_allowed text[],
  p_required text[],
  p_context text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_key text;
BEGIN
  IF pg_catalog.jsonb_typeof(p_value) IS DISTINCT FROM 'object' THEN
    PERFORM public.vehicles_rpc_fail(
      'validation_error', 'Expected a JSON object.',
      pg_catalog.jsonb_build_object('field', p_context)
    );
  END IF;

  SELECT key INTO v_key
  FROM pg_catalog.jsonb_object_keys(p_value) AS keys(key)
  WHERE NOT key = ANY (p_allowed)
  LIMIT 1;
  IF v_key IS NOT NULL THEN
    PERFORM public.vehicles_rpc_fail(
      'validation_error', 'The request contains an unsupported field.',
      pg_catalog.jsonb_build_object('field', p_context, 'key', v_key)
    );
  END IF;

  SELECT key INTO v_key
  FROM pg_catalog.unnest(p_required) AS required(key)
  WHERE NOT (p_value ? key)
  LIMIT 1;
  IF v_key IS NOT NULL THEN
    PERFORM public.vehicles_rpc_fail(
      'validation_error', 'The request is missing a required field.',
      pg_catalog.jsonb_build_object('field', p_context, 'key', v_key)
    );
  END IF;
END
$function$;

CREATE FUNCTION public.vehicles_rpc_uuid(p_value jsonb, p_field text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_text text;
BEGIN
  IF pg_catalog.jsonb_typeof(p_value) IS DISTINCT FROM 'string' THEN
    PERFORM public.vehicles_rpc_fail(
      'validation_error', 'A UUID field must be a string.',
      pg_catalog.jsonb_build_object('field', p_field)
    );
  END IF;
  v_text := p_value #>> '{}';
  IF v_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    PERFORM public.vehicles_rpc_fail(
      'validation_error', 'A UUID field is malformed.',
      pg_catalog.jsonb_build_object('field', p_field)
    );
  END IF;
  RETURN v_text::uuid;
END
$function$;

CREATE FUNCTION public.vehicles_rpc_version(p_value jsonb, p_field text)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_text text;
  v_version integer;
BEGIN
  IF pg_catalog.jsonb_typeof(p_value) IS DISTINCT FROM 'number' THEN
    PERFORM public.vehicles_rpc_fail(
      'validation_error', 'An expected version must be an integer.',
      pg_catalog.jsonb_build_object('field', p_field)
    );
  END IF;
  v_text := p_value #>> '{}';
  IF v_text !~ '^[1-9][0-9]*$' THEN
    PERFORM public.vehicles_rpc_fail(
      'validation_error', 'An expected version must be a positive integer.',
      pg_catalog.jsonb_build_object('field', p_field)
    );
  END IF;
  v_version := v_text::integer;
  RETURN v_version;
END
$function$;

CREATE FUNCTION public.vehicles_validate_key_information_document(p_document jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_block jsonb;
  v_run jsonb;
  v_item jsonb;
  v_runs jsonb;
  v_run_index integer;
  v_total integer := 0;
  v_type text;
BEGIN
  PERFORM public.vehicles_rpc_assert_object(
    p_document, ARRAY['schemaVersion', 'blocks'], ARRAY['schemaVersion', 'blocks'],
    'key_information.document'
  );
  IF p_document->'schemaVersion' IS DISTINCT FROM '1'::jsonb
      OR pg_catalog.jsonb_typeof(p_document->'blocks') IS DISTINCT FROM 'array' THEN
    PERFORM public.vehicles_rpc_fail(
      'validation_error', 'Key Information must use schema version 1 and an array of blocks.'
    );
  END IF;

  FOR v_block IN SELECT value FROM pg_catalog.jsonb_array_elements(p_document->'blocks')
  LOOP
    IF pg_catalog.jsonb_typeof(v_block) IS DISTINCT FROM 'object'
        OR pg_catalog.jsonb_typeof(v_block->'type') IS DISTINCT FROM 'string' THEN
      PERFORM public.vehicles_rpc_fail('validation_error', 'A Key Information block is malformed.');
    END IF;
    v_type := v_block->>'type';
    IF v_type = 'paragraph' THEN
      PERFORM public.vehicles_rpc_assert_object(
        v_block, ARRAY['type', 'runs'], ARRAY['type', 'runs'], 'key_information.paragraph'
      );
      IF pg_catalog.jsonb_typeof(v_block->'runs') IS DISTINCT FROM 'array' THEN
        PERFORM public.vehicles_rpc_fail('validation_error', 'Paragraph runs must be an array.');
      END IF;
      v_runs := v_block->'runs';
    ELSIF v_type = 'bullet_list' THEN
      PERFORM public.vehicles_rpc_assert_object(
        v_block, ARRAY['type', 'items'], ARRAY['type', 'items'], 'key_information.bullet_list'
      );
      IF pg_catalog.jsonb_typeof(v_block->'items') IS DISTINCT FROM 'array' THEN
        PERFORM public.vehicles_rpc_fail('validation_error', 'Bullet-list items must be an array.');
      END IF;
      FOR v_item IN SELECT value FROM pg_catalog.jsonb_array_elements(v_block->'items')
      LOOP
        IF pg_catalog.jsonb_typeof(v_item) IS DISTINCT FROM 'array' THEN
          PERFORM public.vehicles_rpc_fail('validation_error', 'Each bullet-list item must be an array of runs.');
        END IF;
        FOR v_run IN SELECT value FROM pg_catalog.jsonb_array_elements(v_item)
        LOOP
          PERFORM public.vehicles_rpc_assert_object(
            v_run, ARRAY['text', 'bold'], ARRAY['text'], 'key_information.run'
          );
          IF pg_catalog.jsonb_typeof(v_run->'text') IS DISTINCT FROM 'string'
              OR (v_run ? 'bold' AND pg_catalog.jsonb_typeof(v_run->'bold') IS DISTINCT FROM 'boolean')
              OR (v_run->>'text') ~ '<[/!?]?[A-Za-z][^>]*>'
              OR (v_run->>'text') ~* '<\s*script' THEN
            PERFORM public.vehicles_rpc_fail(
              'validation_error', 'Key Information supports plain or bold text only.'
            );
          END IF;
          v_total := v_total + pg_catalog.char_length(v_run->>'text');
        END LOOP;
      END LOOP;
      CONTINUE;
    ELSE
      PERFORM public.vehicles_rpc_fail(
        'validation_error', 'The Key Information block type is not supported.',
        pg_catalog.jsonb_build_object('type', v_type)
      );
    END IF;

    FOR v_run IN SELECT value FROM pg_catalog.jsonb_array_elements(v_runs)
    LOOP
      PERFORM public.vehicles_rpc_assert_object(
        v_run, ARRAY['text', 'bold'], ARRAY['text'], 'key_information.run'
      );
      IF pg_catalog.jsonb_typeof(v_run->'text') IS DISTINCT FROM 'string'
          OR (v_run ? 'bold' AND pg_catalog.jsonb_typeof(v_run->'bold') IS DISTINCT FROM 'boolean')
          OR (v_run->>'text') ~ '<[/!?]?[A-Za-z][^>]*>'
          OR (v_run->>'text') ~* '<\s*script' THEN
        PERFORM public.vehicles_rpc_fail(
          'validation_error', 'Key Information supports plain or bold text only.'
        );
      END IF;
      v_total := v_total + pg_catalog.char_length(v_run->>'text');
    END LOOP;
  END LOOP;

  IF v_total > 50000 THEN
    PERFORM public.vehicles_rpc_fail(
      'validation_error', 'Extracted Key Information text exceeds 50000 characters.'
    );
  END IF;
END
$function$;

COMMENT ON FUNCTION public.vehicles_validate_key_information_document(jsonb) IS
  'Phase 4B private validator: schema v1 paragraphs and bullet lists with plain/bold text runs only.';

CREATE FUNCTION public.save_vehicles_changes(p_request jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_owner_id uuid := auth.uid();
  v_request_id uuid;
  v_asset_id uuid;
  v_expected_asset_version integer;
  v_asset_version integer;
  v_payload_hash text;
  v_receipt public.vehicles_save_requests%ROWTYPE;
  v_op jsonb;
  v_member jsonb;
  v_item_id uuid;
  v_entity_id uuid;
  v_parent_id uuid;
  v_expected_version integer;
  v_current_version integer;
  v_action text;
  v_mode text;
  v_interval_asset_id uuid;
  v_unit text;
  v_service_date date;
  v_reading numeric;
  v_interval_value numeric;
  v_archived_at timestamptz;
  v_asset_patch jsonb;
  v_item_ids uuid[] := ARRAY[]::uuid[];
  v_lock_asset_ids uuid[] := ARRAY[]::uuid[];
  v_changed_asset_ids uuid[] := ARRAY[]::uuid[];
  v_external_asset_versions jsonb := '{}'::jsonb;
  v_seen_ids uuid[];
  v_catalog_updated_ids uuid[] := ARRAY[]::uuid[];
  v_created_ids jsonb := '{}'::jsonb;
  v_deleted_ids jsonb := '{}'::jsonb;
  v_entity_versions jsonb := '{}'::jsonb;
  v_asset_versions jsonb := '{}'::jsonb;
  v_applicable_ids uuid[];
  v_submitted_ids uuid[];
  v_changed boolean := false;
  v_row_changed boolean;
  v_rows integer;
  v_constraint text;
  v_result jsonb;
BEGIN
  IF v_owner_id IS NULL THEN
    PERFORM public.vehicles_rpc_fail('authorization_error', 'Authentication is required.');
  END IF;
  PERFORM public.vehicles_rpc_assert_object(
    p_request,
    ARRAY[
      'request_id', 'asset_id', 'expected_asset_version', 'asset_patch',
      'maintenance_item_operations', 'availability_operations', 'ongoing_operations',
      'recommended_operations', 'completed_operations', 'interval_operations',
      'key_information_operation', 'link_operations'
    ],
    ARRAY['request_id', 'asset_id', 'expected_asset_version'],
    'request'
  );
  v_request_id := public.vehicles_rpc_uuid(p_request->'request_id', 'request_id');
  v_asset_id := public.vehicles_rpc_uuid(p_request->'asset_id', 'asset_id');
  v_expected_asset_version := public.vehicles_rpc_version(
    p_request->'expected_asset_version', 'expected_asset_version'
  );
  v_payload_hash := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(p_request::text, 'UTF8')), 'hex'
  );

  FOREACH v_action IN ARRAY ARRAY[
    'maintenance_item_operations', 'availability_operations', 'ongoing_operations',
    'recommended_operations', 'completed_operations', 'interval_operations', 'link_operations'
  ]
  LOOP
    IF p_request ? v_action
        AND pg_catalog.jsonb_typeof(p_request->v_action) IS DISTINCT FROM 'array' THEN
      PERFORM public.vehicles_rpc_fail('validation_error',v_action||' must be an array.');
    END IF;
  END LOOP;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_owner_id::text || ':' || v_request_id::text, 0)
  );
  SELECT * INTO v_receipt
  FROM public.vehicles_save_requests
  WHERE owner_id = v_owner_id AND request_id = v_request_id;
  IF FOUND THEN
    IF v_receipt.payload_hash <> v_payload_hash THEN
      PERFORM public.vehicles_rpc_fail(
        'request_id_payload_mismatch', 'The request ID was already used with a different payload.'
      );
    END IF;
    RETURN pg_catalog.jsonb_set(v_receipt.result, '{replayed}', 'true'::jsonb, true);
  END IF;

  PERFORM 1 FROM public.vehicles_assets AS a
  WHERE a.owner_id=v_owner_id AND a.id=v_asset_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM public.vehicles_rpc_fail('not_found','The requested asset was not found.'); END IF;
  SELECT a.version INTO v_asset_version
  FROM public.vehicles_assets AS a
  WHERE a.owner_id=v_owner_id AND a.id=v_asset_id;
  IF v_asset_version <> v_expected_asset_version THEN
    PERFORM public.vehicles_rpc_fail(
      'version_conflict','The Vehicles workspace changed since it was loaded.',
      pg_catalog.jsonb_build_object(
        'entity','asset','asset_id',v_asset_id,
        'expected_version',v_expected_asset_version,'current_version',v_asset_version
      )
    );
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('vehicles-catalog:' || v_owner_id::text, 0)
  );
  v_lock_asset_ids := ARRAY[v_asset_id];
  IF p_request ? 'interval_operations' THEN
    FOR v_op IN SELECT value FROM pg_catalog.jsonb_array_elements(p_request->'interval_operations')
    LOOP
      IF v_op ? 'asset_id' THEN
        v_interval_asset_id := public.vehicles_rpc_uuid(v_op->'asset_id', 'interval_operations.asset_id');
        IF v_interval_asset_id<>v_asset_id THEN
          IF v_op->>'action'<>'delete' OR NOT (v_op ? 'expected_asset_version') THEN
            PERFORM public.vehicles_rpc_fail(
              'validation_error','Cross-asset interval resolution requires an expected asset version.'
            );
          END IF;
          v_expected_version:=public.vehicles_rpc_version(
            v_op->'expected_asset_version','interval_operations.expected_asset_version'
          );
          IF v_external_asset_versions ? v_interval_asset_id::text
              AND (v_external_asset_versions->>v_interval_asset_id::text)::integer<>v_expected_version THEN
            PERFORM public.vehicles_rpc_fail(
              'validation_error','Each related asset must use one expected version.'
            );
          END IF;
          v_external_asset_versions:=v_external_asset_versions
            || pg_catalog.jsonb_build_object(v_interval_asset_id::text,v_expected_version);
        ELSIF v_op ? 'expected_asset_version' THEN
          PERFORM public.vehicles_rpc_fail(
            'validation_error','expected_asset_version is only allowed for cross-asset interval resolution.'
          );
        END IF;
        v_lock_asset_ids := pg_catalog.array_append(v_lock_asset_ids, v_interval_asset_id);
      END IF;
    END LOOP;
  END IF;
  FOR v_interval_asset_id IN
    SELECT DISTINCT ids.id FROM pg_catalog.unnest(v_lock_asset_ids) AS ids(id) ORDER BY ids.id
  LOOP
    IF v_interval_asset_id=v_asset_id THEN CONTINUE; END IF;
    PERFORM 1 FROM public.vehicles_assets AS a
    WHERE a.owner_id=v_owner_id AND a.id=v_interval_asset_id FOR UPDATE NOWAIT;
    IF NOT FOUND THEN
      PERFORM public.vehicles_rpc_fail('not_found', 'A requested asset was not found.');
    END IF;
    IF v_external_asset_versions ? v_interval_asset_id::text THEN
      SELECT a.version INTO v_current_version FROM public.vehicles_assets AS a
      WHERE a.owner_id=v_owner_id AND a.id=v_interval_asset_id;
      IF v_current_version<>(v_external_asset_versions->>v_interval_asset_id::text)::integer THEN
        PERFORM public.vehicles_rpc_fail(
          'version_conflict','A related Vehicles workspace changed since it was loaded.',
          pg_catalog.jsonb_build_object('asset_id',v_interval_asset_id,'current_version',v_current_version)
        );
      END IF;
    END IF;
  END LOOP;
  FOR v_op IN SELECT value FROM pg_catalog.jsonb_array_elements(
    COALESCE(p_request->'maintenance_item_operations', '[]'::jsonb)
  )
  LOOP
    IF pg_catalog.jsonb_typeof(p_request->'maintenance_item_operations') IS DISTINCT FROM 'array' THEN
      PERFORM public.vehicles_rpc_fail('validation_error', 'maintenance_item_operations must be an array.');
    END IF;
    IF pg_catalog.jsonb_typeof(v_op) = 'object' AND v_op ? 'id' THEN
      v_item_id := public.vehicles_rpc_uuid(v_op->'id', 'maintenance_item_operations.id');
      v_item_ids := pg_catalog.array_append(v_item_ids, v_item_id);
    END IF;
  END LOOP;
  IF p_request ? 'availability_operations' THEN
    IF pg_catalog.jsonb_typeof(p_request->'availability_operations') IS DISTINCT FROM 'array' THEN
      PERFORM public.vehicles_rpc_fail('validation_error', 'availability_operations must be an array.');
    END IF;
    FOR v_op IN SELECT value FROM pg_catalog.jsonb_array_elements(p_request->'availability_operations')
    LOOP
      v_item_id := public.vehicles_rpc_uuid(v_op->'maintenance_item_id', 'availability_operations.maintenance_item_id');
      v_item_ids := pg_catalog.array_append(v_item_ids, v_item_id);
    END LOOP;
  END IF;
  IF p_request ? 'interval_operations' THEN
    IF pg_catalog.jsonb_typeof(p_request->'interval_operations') IS DISTINCT FROM 'array' THEN
      PERFORM public.vehicles_rpc_fail('validation_error', 'interval_operations must be an array.');
    END IF;
    FOR v_op IN SELECT value FROM pg_catalog.jsonb_array_elements(p_request->'interval_operations')
    LOOP
      IF v_op ? 'maintenance_item_id' THEN
        v_item_id := public.vehicles_rpc_uuid(v_op->'maintenance_item_id', 'interval_operations.maintenance_item_id');
        v_item_ids := pg_catalog.array_append(v_item_ids, v_item_id);
      END IF;
    END LOOP;
  END IF;
  IF p_request ? 'ongoing_operations' THEN
    IF pg_catalog.jsonb_typeof(p_request->'ongoing_operations') IS DISTINCT FROM 'array' THEN
      PERFORM public.vehicles_rpc_fail('validation_error', 'ongoing_operations must be an array.');
    END IF;
    FOR v_op IN SELECT value FROM pg_catalog.jsonb_array_elements(p_request->'ongoing_operations')
    LOOP
      IF v_op->>'action' = 'create' AND pg_catalog.jsonb_typeof(v_op->'items') = 'array' THEN
        FOR v_member IN SELECT value FROM pg_catalog.jsonb_array_elements(v_op->'items')
        LOOP
          v_item_id := public.vehicles_rpc_uuid(v_member->'maintenance_item_id', 'ongoing_operations.items.maintenance_item_id');
          v_item_ids := pg_catalog.array_append(v_item_ids, v_item_id);
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  -- Prevent a concurrent active all-assets item from being omitted by a new snapshot.
  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(
      COALESCE(p_request->'ongoing_operations', '[]'::jsonb)
    ) AS ops(value) WHERE ops.value->>'action' = 'create'
  ) THEN
    SELECT pg_catalog.array_cat(
      v_item_ids,
      COALESCE(pg_catalog.array_agg(mi.id),ARRAY[]::uuid[])
    )
    INTO v_item_ids
    FROM public.maintenance_items AS mi
    WHERE mi.owner_id = v_owner_id
      AND mi.archived_at IS NULL
      AND (
        mi.availability_mode = 'all_assets'
        OR (mi.availability_mode = 'current_asset_only' AND mi.current_asset_id = v_asset_id)
        OR (mi.availability_mode = 'selected_assets' AND EXISTS (
          SELECT 1 FROM public.vehicle_maintenance_item_assets AS ma
          WHERE ma.owner_id = v_owner_id AND ma.maintenance_item_id = mi.id AND ma.asset_id = v_asset_id
        ))
      );
  END IF;
  FOR v_item_id IN
    SELECT DISTINCT ids.id
    FROM pg_catalog.unnest(v_item_ids) AS ids(id)
    ORDER BY ids.id
  LOOP
    PERFORM 1
    FROM public.maintenance_items AS mi
    WHERE mi.owner_id = v_owner_id AND mi.id = v_item_id
    FOR UPDATE;
  END LOOP;

  IF p_request ? 'asset_patch' AND p_request->'asset_patch' <> 'null'::jsonb THEN
    v_asset_patch := p_request->'asset_patch';
    PERFORM public.vehicles_rpc_assert_object(
      v_asset_patch, ARRAY['name', 'usage_unit'], ARRAY[]::text[], 'asset_patch'
    );
    IF v_asset_patch ? 'name' THEN
      IF pg_catalog.jsonb_typeof(v_asset_patch->'name') IS DISTINCT FROM 'string'
          OR pg_catalog.char_length(v_asset_patch->>'name') NOT BETWEEN 1 AND 120
          OR v_asset_patch->>'name' <> pg_catalog.btrim(v_asset_patch->>'name')
          OR v_asset_patch->>'name' !~ '[^[:space:]]' THEN
        PERFORM public.vehicles_rpc_fail('validation_error', 'Asset name must be 1-120 trimmed characters.');
      END IF;
    END IF;
    IF v_asset_patch ? 'usage_unit'
        AND (pg_catalog.jsonb_typeof(v_asset_patch->'usage_unit') IS DISTINCT FROM 'string'
          OR v_asset_patch->>'usage_unit' NOT IN ('miles', 'hours', 'none')) THEN
      PERFORM public.vehicles_rpc_fail('validation_error', 'Asset usage_unit is not supported.');
    END IF;
    IF v_asset_patch <> '{}'::jsonb THEN
      UPDATE public.vehicles_assets AS a
      SET name = CASE WHEN v_asset_patch ? 'name' THEN v_asset_patch->>'name' ELSE a.name END,
          usage_unit = CASE WHEN v_asset_patch ? 'usage_unit' THEN v_asset_patch->>'usage_unit' ELSE a.usage_unit END
      WHERE a.owner_id = v_owner_id AND a.id = v_asset_id;
      v_changed := true;
    END IF;
  END IF;

  -- Catalog create/update/delete operations are applied before availability and intervals.
  IF p_request ? 'maintenance_item_operations' THEN
    IF pg_catalog.jsonb_typeof(p_request->'maintenance_item_operations') IS DISTINCT FROM 'array' THEN
      PERFORM public.vehicles_rpc_fail('validation_error', 'maintenance_item_operations must be an array.');
    END IF;
    v_seen_ids := ARRAY[]::uuid[];
    FOR v_op IN SELECT value FROM pg_catalog.jsonb_array_elements(p_request->'maintenance_item_operations')
    LOOP
      v_action := v_op->>'action';
      IF v_action = 'create' THEN
        PERFORM public.vehicles_rpc_assert_object(
          v_op,
          ARRAY['action','id','display_name','item_group','availability_mode','current_asset_id','selected_asset_ids'],
          ARRAY['action','id','display_name','item_group','availability_mode'],
          'maintenance_item_operations.create'
        );
        v_entity_id := public.vehicles_rpc_uuid(v_op->'id', 'maintenance_item_operations.id');
        IF v_entity_id = ANY(v_seen_ids) THEN
          PERFORM public.vehicles_rpc_fail('validation_error', 'A Maintenance Item may appear only once per request.');
        END IF;
        v_seen_ids := pg_catalog.array_append(v_seen_ids, v_entity_id);
        v_mode := v_op->>'availability_mode';
        IF v_op->>'display_name' IS NULL OR pg_catalog.jsonb_typeof(v_op->'display_name') IS DISTINCT FROM 'string'
            OR pg_catalog.char_length(v_op->>'display_name') NOT BETWEEN 1 AND 100
            OR v_op->>'display_name' <> pg_catalog.btrim(v_op->>'display_name')
            OR v_op->>'display_name' !~ '[^[:space:]]'
            OR v_op->>'item_group' NOT IN ('routine','fluids_drivetrain','components_other')
            OR v_mode NOT IN ('current_asset_only','selected_assets','all_assets') THEN
          PERFORM public.vehicles_rpc_fail('validation_error', 'Maintenance Item fields are invalid.');
        END IF;
        v_parent_id := NULL;
        IF v_mode = 'current_asset_only' THEN
          IF NOT (v_op ? 'current_asset_id') THEN
            PERFORM public.vehicles_rpc_fail('validation_error', 'current_asset_only requires current_asset_id.');
          END IF;
          v_parent_id := public.vehicles_rpc_uuid(v_op->'current_asset_id', 'maintenance_item_operations.current_asset_id');
        ELSIF v_op ? 'current_asset_id' AND v_op->'current_asset_id' <> 'null'::jsonb THEN
          PERFORM public.vehicles_rpc_fail('validation_error', 'Only current_asset_only may set current_asset_id.');
        END IF;
        IF v_mode = 'selected_assets' THEN
          IF pg_catalog.jsonb_typeof(v_op->'selected_asset_ids') IS DISTINCT FROM 'array'
              OR pg_catalog.jsonb_array_length(v_op->'selected_asset_ids') = 0 THEN
            PERFORM public.vehicles_rpc_fail('validation_error', 'An active selected_assets item requires at least one asset.');
          END IF;
        ELSIF v_op ? 'selected_asset_ids'
            AND (pg_catalog.jsonb_typeof(v_op->'selected_asset_ids') IS DISTINCT FROM 'array'
              OR pg_catalog.jsonb_array_length(v_op->'selected_asset_ids') <> 0) THEN
          PERFORM public.vehicles_rpc_fail('validation_error', 'Only selected_assets may include selected_asset_ids.');
        END IF;
        INSERT INTO public.maintenance_items
          (id, owner_id, display_name, item_group, availability_mode, current_asset_id)
        VALUES
          (v_entity_id, v_owner_id, v_op->>'display_name', v_op->>'item_group', v_mode, v_parent_id);
        IF v_mode = 'selected_assets' THEN
          v_submitted_ids := ARRAY[]::uuid[];
          FOR v_member IN SELECT value FROM pg_catalog.jsonb_array_elements(v_op->'selected_asset_ids')
          LOOP
            v_parent_id := public.vehicles_rpc_uuid(v_member, 'maintenance_item_operations.selected_asset_ids');
            IF v_parent_id = ANY(v_submitted_ids) THEN
              PERFORM public.vehicles_rpc_fail('validation_error', 'Selected asset IDs must be unique.');
            END IF;
            v_submitted_ids := pg_catalog.array_append(v_submitted_ids, v_parent_id);
            INSERT INTO public.vehicle_maintenance_item_assets(owner_id, maintenance_item_id, asset_id)
            VALUES (v_owner_id, v_entity_id, v_parent_id);
          END LOOP;
        END IF;
        v_created_ids := v_created_ids || pg_catalog.jsonb_build_object(
          'maintenance_items', COALESCE(v_created_ids->'maintenance_items','[]'::jsonb) || pg_catalog.jsonb_build_array(v_entity_id)
        );
        v_entity_versions := v_entity_versions || pg_catalog.jsonb_build_object(
          'maintenance_items', COALESCE(v_entity_versions->'maintenance_items','{}'::jsonb)
            || pg_catalog.jsonb_build_object(v_entity_id::text, 1)
        );
        v_catalog_updated_ids := pg_catalog.array_append(v_catalog_updated_ids,v_entity_id);
        v_changed := true;
      ELSIF v_action IN ('update','delete') THEN
        PERFORM public.vehicles_rpc_assert_object(
          v_op,
          ARRAY['action','id','expected_version','display_name','item_group','availability_mode','current_asset_id','archived'],
          ARRAY['action','id','expected_version'],
          'maintenance_item_operations.' || v_action
        );
        v_entity_id := public.vehicles_rpc_uuid(v_op->'id', 'maintenance_item_operations.id');
        v_expected_version := public.vehicles_rpc_version(v_op->'expected_version', 'maintenance_item_operations.expected_version');
        IF v_entity_id = ANY(v_seen_ids) THEN
          PERFORM public.vehicles_rpc_fail('validation_error', 'A Maintenance Item may appear only once per request.');
        END IF;
        v_seen_ids := pg_catalog.array_append(v_seen_ids, v_entity_id);
        SELECT mi.version INTO v_current_version FROM public.maintenance_items AS mi
        WHERE mi.owner_id = v_owner_id AND mi.id = v_entity_id;
        IF NOT FOUND THEN
          PERFORM public.vehicles_rpc_fail('not_found', 'The Maintenance Item was not found.');
        END IF;
        IF v_current_version <> v_expected_version THEN
          PERFORM public.vehicles_rpc_fail(
            'version_conflict', 'The Maintenance Item changed since it was loaded.',
            pg_catalog.jsonb_build_object('entity','maintenance_item','id',v_entity_id,'current_version',v_current_version)
          );
        END IF;
        IF v_action = 'delete' THEN
          IF EXISTS (
            SELECT 1 FROM public.vehicle_ongoing_items oi
            WHERE oi.owner_id=v_owner_id AND oi.maintenance_item_id=v_entity_id
          ) OR EXISTS (
            SELECT 1 FROM public.vehicle_maintenance_intervals vi
            WHERE vi.owner_id=v_owner_id AND vi.maintenance_item_id=v_entity_id
          ) THEN
            PERFORM public.vehicles_rpc_fail(
              'item_archived_or_unavailable',
              'A Maintenance Item referenced by history or an interval must be archived, not deleted.'
            );
          END IF;
          DELETE FROM public.vehicle_maintenance_item_assets
          WHERE owner_id = v_owner_id AND maintenance_item_id = v_entity_id;
          DELETE FROM public.maintenance_items
          WHERE owner_id = v_owner_id AND id = v_entity_id;
          v_deleted_ids := v_deleted_ids || pg_catalog.jsonb_build_object(
            'maintenance_items', COALESCE(v_deleted_ids->'maintenance_items','[]'::jsonb) || pg_catalog.jsonb_build_array(v_entity_id)
          );
        ELSE
          IF NOT (v_op ? 'display_name' OR v_op ? 'item_group' OR v_op ? 'availability_mode'
              OR v_op ? 'current_asset_id' OR v_op ? 'archived') THEN
            PERFORM public.vehicles_rpc_fail('validation_error', 'A Maintenance Item update must change a field.');
          END IF;
          IF v_op ? 'display_name' AND (
            pg_catalog.jsonb_typeof(v_op->'display_name') IS DISTINCT FROM 'string'
            OR pg_catalog.char_length(v_op->>'display_name') NOT BETWEEN 1 AND 100
            OR v_op->>'display_name' <> pg_catalog.btrim(v_op->>'display_name')
            OR v_op->>'display_name' !~ '[^[:space:]]'
          ) THEN
            PERFORM public.vehicles_rpc_fail('validation_error', 'Maintenance Item name is invalid.');
          END IF;
          IF v_op ? 'item_group' AND (pg_catalog.jsonb_typeof(v_op->'item_group') IS DISTINCT FROM 'string'
              OR v_op->>'item_group' NOT IN ('routine','fluids_drivetrain','components_other')) THEN
            PERFORM public.vehicles_rpc_fail('validation_error', 'Maintenance Item group is invalid.');
          END IF;
          IF v_op ? 'availability_mode' AND (
            pg_catalog.jsonb_typeof(v_op->'availability_mode') IS DISTINCT FROM 'string'
            OR v_op->>'availability_mode' NOT IN ('current_asset_only','selected_assets','all_assets')
          ) THEN
            PERFORM public.vehicles_rpc_fail('validation_error', 'Maintenance Item availability mode is invalid.');
          END IF;
          IF v_op ? 'archived' AND pg_catalog.jsonb_typeof(v_op->'archived') IS DISTINCT FROM 'boolean' THEN
            PERFORM public.vehicles_rpc_fail('validation_error', 'archived must be a Boolean.');
          END IF;
          IF v_op ? 'current_asset_id' AND v_op->'current_asset_id' <> 'null'::jsonb THEN
            v_parent_id := public.vehicles_rpc_uuid(v_op->'current_asset_id', 'maintenance_item_operations.current_asset_id');
          ELSE
            v_parent_id := NULL;
          END IF;
          v_mode := CASE WHEN v_op ? 'availability_mode' THEN v_op->>'availability_mode' ELSE NULL END;
          IF v_mode IS NULL THEN
            SELECT mi.availability_mode INTO v_mode FROM public.maintenance_items AS mi
            WHERE mi.owner_id=v_owner_id AND mi.id=v_entity_id;
          END IF;
          IF v_mode = 'current_asset_only'
              AND NOT (v_op ? 'current_asset_id' OR (
                SELECT mi.current_asset_id IS NOT NULL FROM public.maintenance_items AS mi
                WHERE mi.owner_id=v_owner_id AND mi.id=v_entity_id
              )) THEN
            PERFORM public.vehicles_rpc_fail('validation_error', 'current_asset_only requires current_asset_id.');
          END IF;
          IF v_mode IN ('selected_assets','all_assets')
              AND (v_op ? 'current_asset_id' AND v_op->'current_asset_id' <> 'null'::jsonb) THEN
            PERFORM public.vehicles_rpc_fail('validation_error', 'Only current_asset_only may set current_asset_id.');
          END IF;
          UPDATE public.maintenance_items AS mi
          SET display_name = CASE WHEN v_op ? 'display_name' THEN v_op->>'display_name' ELSE mi.display_name END,
              item_group = CASE WHEN v_op ? 'item_group' THEN v_op->>'item_group' ELSE mi.item_group END,
              availability_mode = CASE WHEN v_op ? 'availability_mode' THEN v_op->>'availability_mode' ELSE mi.availability_mode END,
              current_asset_id = CASE
                WHEN v_op ? 'current_asset_id' THEN v_parent_id
                WHEN v_op ? 'availability_mode' AND v_op->>'availability_mode' <> 'current_asset_only' THEN NULL
                ELSE mi.current_asset_id END,
              archived_at = CASE
                WHEN v_op ? 'archived' AND v_op->>'archived' = 'true' THEN COALESCE(mi.archived_at, pg_catalog.now())
                WHEN v_op ? 'archived' THEN NULL ELSE mi.archived_at END,
              version = mi.version + 1
          WHERE mi.owner_id=v_owner_id AND mi.id=v_entity_id
          RETURNING mi.version INTO v_current_version;
          v_entity_versions := v_entity_versions || pg_catalog.jsonb_build_object(
            'maintenance_items', COALESCE(v_entity_versions->'maintenance_items','{}'::jsonb)
              || pg_catalog.jsonb_build_object(v_entity_id::text,v_current_version)
          );
          v_catalog_updated_ids := pg_catalog.array_append(v_catalog_updated_ids,v_entity_id);
        END IF;
        v_changed := true;
      ELSE
        PERFORM public.vehicles_rpc_fail('validation_error', 'Maintenance Item action must be create, update, or delete.');
      END IF;
    END LOOP;
  END IF;

  -- Mode transitions clear associations that are no longer part of the normalized model.
  DELETE FROM public.vehicle_maintenance_item_assets AS ma
  USING public.maintenance_items AS mi
  WHERE ma.owner_id=v_owner_id AND mi.owner_id=v_owner_id
    AND mi.id=ma.maintenance_item_id
    AND mi.id=ANY(v_catalog_updated_ids)
    AND mi.availability_mode IN ('all_assets','current_asset_only');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN v_changed := true; END IF;

  IF p_request ? 'availability_operations' THEN
    v_seen_ids := ARRAY[]::uuid[];
    FOR v_op IN SELECT value FROM pg_catalog.jsonb_array_elements(p_request->'availability_operations')
    LOOP
      PERFORM public.vehicles_rpc_assert_object(
        v_op,
        ARRAY['maintenance_item_id','expected_version','add_asset_ids','remove_asset_ids'],
        ARRAY['maintenance_item_id','expected_version'],
        'availability_operations'
      );
      v_item_id := public.vehicles_rpc_uuid(v_op->'maintenance_item_id','availability_operations.maintenance_item_id');
      v_expected_version := public.vehicles_rpc_version(v_op->'expected_version','availability_operations.expected_version');
      IF v_item_id=ANY(v_seen_ids) THEN
        PERFORM public.vehicles_rpc_fail('validation_error','Each Maintenance Item may have one availability operation.');
      END IF;
      v_seen_ids := pg_catalog.array_append(v_seen_ids,v_item_id);
      SELECT mi.version,mi.availability_mode,mi.archived_at INTO v_current_version,v_mode,v_archived_at
      FROM public.maintenance_items AS mi WHERE mi.owner_id=v_owner_id AND mi.id=v_item_id;
      IF NOT FOUND THEN PERFORM public.vehicles_rpc_fail('not_found','The Maintenance Item was not found.'); END IF;
      IF v_current_version <> v_expected_version
          AND NOT (v_item_id=ANY(v_catalog_updated_ids) AND v_current_version=v_expected_version+1) THEN
        PERFORM public.vehicles_rpc_fail('version_conflict','The Maintenance Item changed since it was loaded.');
      END IF;
      IF v_archived_at IS NOT NULL OR v_mode <> 'selected_assets' THEN
        PERFORM public.vehicles_rpc_fail('item_archived_or_unavailable','Only active selected_assets items can change selected assets.');
      END IF;
      IF (v_op ? 'add_asset_ids' AND pg_catalog.jsonb_typeof(v_op->'add_asset_ids') IS DISTINCT FROM 'array')
          OR (v_op ? 'remove_asset_ids' AND pg_catalog.jsonb_typeof(v_op->'remove_asset_ids') IS DISTINCT FROM 'array') THEN
        PERFORM public.vehicles_rpc_fail('validation_error','Availability asset IDs must be arrays.');
      END IF;
      IF NOT (v_op ? 'add_asset_ids' OR v_op ? 'remove_asset_ids')
          OR COALESCE(pg_catalog.jsonb_array_length(v_op->'add_asset_ids'),0)
            + COALESCE(pg_catalog.jsonb_array_length(v_op->'remove_asset_ids'),0)=0
          OR COALESCE(pg_catalog.jsonb_array_length(v_op->'add_asset_ids'),0)>1
          OR COALESCE(pg_catalog.jsonb_array_length(v_op->'remove_asset_ids'),0)>1
          OR EXISTS (
            SELECT 1
            FROM pg_catalog.jsonb_array_elements_text(COALESCE(v_op->'add_asset_ids','[]'::jsonb)) AS added(id)
            JOIN pg_catalog.jsonb_array_elements_text(COALESCE(v_op->'remove_asset_ids','[]'::jsonb)) AS removed(id)
              ON pg_catalog.lower(added.id)=pg_catalog.lower(removed.id)
          ) THEN
        PERFORM public.vehicles_rpc_fail('validation_error','Availability operations must make a unique, non-overlapping selected-asset change.');
      END IF;
      v_row_changed := false;
      FOREACH v_action IN ARRAY ARRAY['add_asset_ids','remove_asset_ids']
      LOOP
        IF v_op ? v_action THEN
          IF pg_catalog.jsonb_typeof(v_op->v_action) IS DISTINCT FROM 'array' THEN
            PERFORM public.vehicles_rpc_fail('validation_error','Availability asset IDs must be arrays.');
          END IF;
          FOR v_member IN SELECT value FROM pg_catalog.jsonb_array_elements(v_op->v_action)
          LOOP
            v_parent_id := public.vehicles_rpc_uuid(v_member,'availability_operations.asset_ids');
            IF v_parent_id <> v_asset_id THEN
              PERFORM public.vehicles_rpc_fail('validation_error','Availability changes must target the request asset.');
            END IF;
            IF v_action='add_asset_ids' THEN
              INSERT INTO public.vehicle_maintenance_item_assets(owner_id,maintenance_item_id,asset_id)
              VALUES(v_owner_id,v_item_id,v_parent_id) ON CONFLICT DO NOTHING;
            ELSE
              DELETE FROM public.vehicle_maintenance_item_assets
              WHERE owner_id=v_owner_id AND maintenance_item_id=v_item_id AND asset_id=v_parent_id;
            END IF;
            GET DIAGNOSTICS v_rows = ROW_COUNT;
            IF v_rows > 0 THEN
              v_changed := true;
              v_row_changed := true;
            END IF;
          END LOOP;
        END IF;
      END LOOP;
      IF v_row_changed AND NOT (v_item_id=ANY(v_catalog_updated_ids)) THEN
        UPDATE public.maintenance_items SET version=version+1
        WHERE owner_id=v_owner_id AND id=v_item_id
        RETURNING version INTO v_current_version;
        v_catalog_updated_ids := pg_catalog.array_append(v_catalog_updated_ids,v_item_id);
      END IF;
      v_entity_versions := v_entity_versions || pg_catalog.jsonb_build_object(
        'maintenance_items', COALESCE(v_entity_versions->'maintenance_items','{}'::jsonb)
          || pg_catalog.jsonb_build_object(v_item_id::text,v_current_version)
      );
    END LOOP;
  END IF;

  -- Validate final catalog availability shape and nonempty active selections.
  IF EXISTS (
    SELECT 1 FROM public.maintenance_items AS mi
    WHERE mi.owner_id=v_owner_id AND mi.id=ANY(v_catalog_updated_ids)
      AND (
        (mi.availability_mode='current_asset_only' AND (
          mi.current_asset_id IS NULL OR EXISTS (
            SELECT 1 FROM public.vehicle_maintenance_item_assets ma
            WHERE ma.owner_id=v_owner_id AND ma.maintenance_item_id=mi.id
          )
        ))
        OR (mi.availability_mode='selected_assets' AND (
          mi.current_asset_id IS NOT NULL
          OR (mi.archived_at IS NULL AND NOT EXISTS (
            SELECT 1 FROM public.vehicle_maintenance_item_assets ma
            WHERE ma.owner_id=v_owner_id AND ma.maintenance_item_id=mi.id
          ))
        ))
        OR (mi.availability_mode='all_assets' AND (
          mi.current_asset_id IS NOT NULL OR EXISTS (
            SELECT 1 FROM public.vehicle_maintenance_item_assets ma
            WHERE ma.owner_id=v_owner_id AND ma.maintenance_item_id=mi.id
          )
        ))
      )
  ) THEN
    PERFORM public.vehicles_rpc_fail('validation_error','Maintenance Item availability state is incomplete or inconsistent.');
  END IF;

  -- Interval operations run before historical writes; final applicability is checked after all changes.
  IF p_request ? 'interval_operations' THEN
    v_seen_ids := ARRAY[]::uuid[];
    FOR v_op IN SELECT value FROM pg_catalog.jsonb_array_elements(p_request->'interval_operations')
    LOOP
      v_action := v_op->>'action';
      v_interval_asset_id := CASE
        WHEN v_op ? 'asset_id' THEN public.vehicles_rpc_uuid(v_op->'asset_id','interval_operations.asset_id')
        ELSE v_asset_id END;
      IF v_action<>'delete' AND v_interval_asset_id<>v_asset_id THEN
        PERFORM public.vehicles_rpc_fail('validation_error','Only interval removals for catalog-wide resolution may target another asset.');
      END IF;
      IF v_action='create' THEN
        PERFORM public.vehicles_rpc_assert_object(
          v_op, ARRAY['action','id','asset_id','maintenance_item_id','interval_value','interval_unit','comments'],
          ARRAY['action','id','maintenance_item_id','interval_value','interval_unit'], 'interval_operations.create'
        );
        v_entity_id := public.vehicles_rpc_uuid(v_op->'id','interval_operations.id');
        v_item_id := public.vehicles_rpc_uuid(v_op->'maintenance_item_id','interval_operations.maintenance_item_id');
        v_expected_version := NULL;
      ELSIF v_action='update' THEN
        PERFORM public.vehicles_rpc_assert_object(
          v_op, ARRAY['action','id','asset_id','expected_version','maintenance_item_id','interval_value','interval_unit','comments'],
          ARRAY['action','id','expected_version'], 'interval_operations.update'
        );
        IF NOT (v_op ? 'maintenance_item_id' OR v_op ? 'interval_value'
            OR v_op ? 'interval_unit' OR v_op ? 'comments') THEN
          PERFORM public.vehicles_rpc_fail('validation_error','An interval update must change at least one field.');
        END IF;
        v_entity_id := public.vehicles_rpc_uuid(v_op->'id','interval_operations.id');
        v_expected_version := public.vehicles_rpc_version(v_op->'expected_version','interval_operations.expected_version');
        SELECT interval_version.version INTO v_current_version
        FROM public.vehicle_maintenance_intervals AS interval_version
        WHERE interval_version.owner_id=v_owner_id AND interval_version.asset_id=v_interval_asset_id
          AND interval_version.id=v_entity_id FOR UPDATE;
        IF NOT FOUND THEN PERFORM public.vehicles_rpc_fail('not_found','The Maintenance Interval was not found.'); END IF;
        IF v_current_version<>v_expected_version THEN
          PERFORM public.vehicles_rpc_fail('version_conflict','The Maintenance Interval changed since it was loaded.');
        END IF;
        IF v_op ? 'maintenance_item_id' THEN
          v_item_id := public.vehicles_rpc_uuid(v_op->'maintenance_item_id','interval_operations.maintenance_item_id');
        ELSE
          SELECT maintenance_item_id INTO v_item_id FROM public.vehicle_maintenance_intervals
          WHERE owner_id=v_owner_id AND asset_id=v_asset_id AND id=v_entity_id;
        END IF;
      ELSIF v_action='delete' THEN
        PERFORM public.vehicles_rpc_assert_object(
          v_op, ARRAY['action','id','asset_id','expected_version','expected_asset_version'], ARRAY['action','id','expected_version'], 'interval_operations.delete'
        );
        v_entity_id := public.vehicles_rpc_uuid(v_op->'id','interval_operations.id');
        v_expected_version := public.vehicles_rpc_version(v_op->'expected_version','interval_operations.expected_version');
        SELECT version,maintenance_item_id INTO v_current_version,v_item_id
        FROM public.vehicle_maintenance_intervals
        WHERE owner_id=v_owner_id AND asset_id=v_interval_asset_id AND id=v_entity_id FOR UPDATE;
        IF NOT FOUND THEN PERFORM public.vehicles_rpc_fail('not_found','The Maintenance Interval was not found.'); END IF;
        IF v_current_version<>v_expected_version THEN
          PERFORM public.vehicles_rpc_fail('version_conflict','The Maintenance Interval changed since it was loaded.');
        END IF;
      ELSE
        PERFORM public.vehicles_rpc_fail('validation_error','Interval action must be create, update, or delete.');
      END IF;
      IF v_entity_id=ANY(v_seen_ids) THEN PERFORM public.vehicles_rpc_fail('validation_error','An interval may appear only once per request.'); END IF;
      v_seen_ids := pg_catalog.array_append(v_seen_ids,v_entity_id);
      IF v_action='delete' THEN
        IF v_interval_asset_id<>v_asset_id THEN
          IF NOT (v_item_id=ANY(v_catalog_updated_ids)) THEN
            PERFORM public.vehicles_rpc_fail(
              'validation_error','Cross-asset interval removal must resolve a Maintenance Item availability change.'
            );
          END IF;
          SELECT mi.archived_at,mi.availability_mode,mi.current_asset_id
          INTO v_archived_at,v_mode,v_parent_id
          FROM public.maintenance_items AS mi
          WHERE mi.owner_id=v_owner_id AND mi.id=v_item_id;
          IF NOT FOUND THEN PERFORM public.vehicles_rpc_fail('not_found','The Maintenance Item was not found.'); END IF;
          IF v_archived_at IS NULL AND (
            v_mode='all_assets'
            OR (v_mode='current_asset_only' AND v_parent_id=v_interval_asset_id)
            OR (v_mode='selected_assets' AND EXISTS (
              SELECT 1 FROM public.vehicle_maintenance_item_assets ma
              WHERE ma.owner_id=v_owner_id AND ma.maintenance_item_id=v_item_id AND ma.asset_id=v_interval_asset_id
            ))
          ) THEN
            PERFORM public.vehicles_rpc_fail(
              'validation_error','A cross-asset interval may be removed only when the Maintenance Item becomes unavailable there.'
            );
          END IF;
        END IF;
        DELETE FROM public.vehicle_maintenance_intervals
        WHERE owner_id=v_owner_id AND asset_id=v_interval_asset_id AND id=v_entity_id;
        v_deleted_ids := v_deleted_ids || pg_catalog.jsonb_build_object('intervals',COALESCE(v_deleted_ids->'intervals','[]'::jsonb)||pg_catalog.jsonb_build_array(v_entity_id));
        IF v_interval_asset_id<>v_asset_id THEN
          v_changed_asset_ids:=pg_catalog.array_append(v_changed_asset_ids,v_interval_asset_id);
        END IF;
        v_changed := true;
        CONTINUE;
      END IF;
      IF v_item_id IS NULL THEN PERFORM public.vehicles_rpc_fail('validation_error','An interval requires a Maintenance Item.'); END IF;
      IF v_op ? 'interval_unit' THEN v_unit:=v_op->>'interval_unit';
      ELSE SELECT interval_unit INTO v_unit FROM public.vehicle_maintenance_intervals WHERE owner_id=v_owner_id AND asset_id=v_interval_asset_id AND id=v_entity_id;
      END IF;
      IF v_op ? 'interval_value' THEN
        IF pg_catalog.jsonb_typeof(v_op->'interval_value') IS DISTINCT FROM 'number' THEN
          PERFORM public.vehicles_rpc_fail('validation_error','Interval value must be numeric.');
        END IF;
        v_interval_value := (v_op->>'interval_value')::numeric;
      ELSE
        SELECT interval_value INTO v_interval_value FROM public.vehicle_maintenance_intervals WHERE owner_id=v_owner_id AND asset_id=v_interval_asset_id AND id=v_entity_id;
      END IF;
      IF v_unit NOT IN ('miles','hours','months') OR v_interval_value<=0
          OR (v_unit='months' AND v_interval_value<>pg_catalog.trunc(v_interval_value)) THEN
        PERFORM public.vehicles_rpc_fail('validation_error','Interval unit or value is invalid.');
      END IF;
      IF v_op ? 'comments' AND v_op->'comments'<>'null'::jsonb
          AND (pg_catalog.jsonb_typeof(v_op->'comments') IS DISTINCT FROM 'string'
            OR pg_catalog.char_length(v_op->>'comments')>2000) THEN
        PERFORM public.vehicles_rpc_fail('validation_error','Interval comments are invalid.');
      END IF;
      SELECT mi.archived_at,mi.availability_mode,mi.current_asset_id INTO v_archived_at,v_mode,v_parent_id
      FROM public.maintenance_items AS mi WHERE mi.owner_id=v_owner_id AND mi.id=v_item_id;
      IF NOT FOUND THEN PERFORM public.vehicles_rpc_fail('not_found','The Maintenance Item was not found.'); END IF;
      IF v_archived_at IS NOT NULL OR NOT (
        v_mode='all_assets'
        OR (v_mode='current_asset_only' AND v_parent_id=v_asset_id)
        OR (v_mode='selected_assets' AND EXISTS (
          SELECT 1 FROM public.vehicle_maintenance_item_assets ma
          WHERE ma.owner_id=v_owner_id AND ma.maintenance_item_id=v_item_id AND ma.asset_id=v_asset_id
        ))
      ) THEN
        PERFORM public.vehicles_rpc_fail('item_archived_or_unavailable','The Maintenance Item is not active and applicable to this asset.');
      END IF;
      IF v_action='create' THEN
        INSERT INTO public.vehicle_maintenance_intervals
          (id,owner_id,asset_id,maintenance_item_id,interval_value,interval_unit,comments)
        VALUES(v_entity_id,v_owner_id,v_asset_id,v_item_id,v_interval_value,v_unit,
          CASE WHEN v_op ? 'comments' THEN v_op->>'comments' ELSE NULL END);
        v_current_version:=1;
        v_created_ids:=v_created_ids||pg_catalog.jsonb_build_object('intervals',COALESCE(v_created_ids->'intervals','[]'::jsonb)||pg_catalog.jsonb_build_array(v_entity_id));
      ELSE
        UPDATE public.vehicle_maintenance_intervals
        SET maintenance_item_id=v_item_id, interval_value=v_interval_value, interval_unit=v_unit,
            comments=CASE WHEN v_op ? 'comments' THEN v_op->>'comments' ELSE comments END,
            version=version+1
        WHERE owner_id=v_owner_id AND asset_id=v_asset_id AND id=v_entity_id
        RETURNING version INTO v_current_version;
      END IF;
      v_entity_versions:=v_entity_versions||pg_catalog.jsonb_build_object(
        'intervals',COALESCE(v_entity_versions->'intervals','{}'::jsonb)||pg_catalog.jsonb_build_object(v_entity_id::text,v_current_version)
      );
      v_changed:=true;
    END LOOP;
  END IF;

  -- Every interval for a changed catalog item must remain applicable in final state.
  IF EXISTS (
    SELECT 1 FROM public.vehicle_maintenance_intervals AS vi
    JOIN public.maintenance_items AS mi ON mi.owner_id=vi.owner_id AND mi.id=vi.maintenance_item_id
    WHERE vi.owner_id=v_owner_id AND vi.maintenance_item_id=ANY(v_catalog_updated_ids)
      AND (mi.archived_at IS NOT NULL OR NOT (
        mi.availability_mode='all_assets'
        OR (mi.availability_mode='current_asset_only' AND mi.current_asset_id=vi.asset_id)
        OR (mi.availability_mode='selected_assets' AND EXISTS (
          SELECT 1 FROM public.vehicle_maintenance_item_assets ma
          WHERE ma.owner_id=vi.owner_id AND ma.maintenance_item_id=mi.id AND ma.asset_id=vi.asset_id
        ))
      ))
  ) THEN
    PERFORM public.vehicles_rpc_fail(
      'item_archived_or_unavailable',
      'A Maintenance Item cannot become unavailable while an interval references it.',
      pg_catalog.jsonb_build_object('maintenance_item_id',v_catalog_updated_ids[1])
    );
  END IF;

  -- Ongoing Maintenance records and their immutable historical labels.
  IF p_request ? 'ongoing_operations' THEN
    v_seen_ids:=ARRAY[]::uuid[];
    FOR v_op IN SELECT value FROM pg_catalog.jsonb_array_elements(p_request->'ongoing_operations')
    LOOP
      v_action:=v_op->>'action';
      IF v_action='create' THEN
        PERFORM public.vehicles_rpc_assert_object(
          v_op,ARRAY['action','id','service_date','usage_reading_unit','usage_reading_value','mechanic','items'],
          ARRAY['action','id','service_date','usage_reading_unit','items'],'ongoing_operations.create'
        );
        v_entity_id:=public.vehicles_rpc_uuid(v_op->'id','ongoing_operations.id');
      ELSIF v_action IN ('update','delete') THEN
        PERFORM public.vehicles_rpc_assert_object(
          v_op,
          CASE WHEN v_action='update'
            THEN ARRAY['action','id','expected_version','service_date','usage_reading_unit','usage_reading_value','mechanic','items']
            ELSE ARRAY['action','id','expected_version'] END,
          ARRAY['action','id','expected_version'],'ongoing_operations.'||v_action
        );
        v_entity_id:=public.vehicles_rpc_uuid(v_op->'id','ongoing_operations.id');
        v_expected_version:=public.vehicles_rpc_version(v_op->'expected_version','ongoing_operations.expected_version');
        SELECT version INTO v_current_version FROM public.vehicle_ongoing_records
        WHERE owner_id=v_owner_id AND asset_id=v_asset_id AND id=v_entity_id FOR UPDATE;
        IF NOT FOUND THEN PERFORM public.vehicles_rpc_fail('not_found','The Ongoing Maintenance record was not found.'); END IF;
        IF v_current_version<>v_expected_version THEN PERFORM public.vehicles_rpc_fail('version_conflict','The Ongoing Maintenance record changed since it was loaded.'); END IF;
      ELSE
        PERFORM public.vehicles_rpc_fail('validation_error','Ongoing action must be create, update, or delete.');
      END IF;
      IF v_entity_id=ANY(v_seen_ids) THEN PERFORM public.vehicles_rpc_fail('validation_error','An Ongoing record may appear only once per request.'); END IF;
      v_seen_ids:=pg_catalog.array_append(v_seen_ids,v_entity_id);
      IF v_action='delete' THEN
        DELETE FROM public.vehicle_ongoing_records WHERE owner_id=v_owner_id AND asset_id=v_asset_id AND id=v_entity_id;
        v_deleted_ids:=v_deleted_ids||pg_catalog.jsonb_build_object('ongoing',COALESCE(v_deleted_ids->'ongoing','[]'::jsonb)||pg_catalog.jsonb_build_array(v_entity_id));
        v_changed:=true;
        CONTINUE;
      END IF;
      IF v_op ? 'service_date' THEN
        IF pg_catalog.jsonb_typeof(v_op->'service_date') IS DISTINCT FROM 'string'
            OR v_op->>'service_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
          PERFORM public.vehicles_rpc_fail('validation_error','service_date must be a canonical date.');
        END IF;
        v_service_date:=(v_op->>'service_date')::date;
      ELSIF v_action='update' THEN
        SELECT service_date INTO v_service_date FROM public.vehicle_ongoing_records
        WHERE owner_id=v_owner_id AND asset_id=v_asset_id AND id=v_entity_id;
      ELSE
        PERFORM public.vehicles_rpc_fail('validation_error','Create requires service_date.');
      END IF;
      IF v_op ? 'usage_reading_unit' THEN
        IF pg_catalog.jsonb_typeof(v_op->'usage_reading_unit') IS DISTINCT FROM 'string' THEN
          PERFORM public.vehicles_rpc_fail('validation_error','Historical reading unit must be a string.');
        END IF;
        v_unit:=v_op->>'usage_reading_unit';
      ELSIF v_action='update' THEN
        SELECT usage_reading_unit INTO v_unit FROM public.vehicle_ongoing_records
        WHERE owner_id=v_owner_id AND asset_id=v_asset_id AND id=v_entity_id;
      ELSE
        v_unit:=NULL;
      END IF;
      IF v_unit NOT IN ('miles','hours','none') THEN PERFORM public.vehicles_rpc_fail('validation_error','Historical reading unit is invalid.'); END IF;
      IF v_action='create' AND NOT (v_op ? 'usage_reading_value') THEN v_reading:=NULL;
      ELSIF v_op ? 'usage_reading_value' AND v_op->'usage_reading_value'<>'null'::jsonb THEN
        IF pg_catalog.jsonb_typeof(v_op->'usage_reading_value') IS DISTINCT FROM 'number' THEN PERFORM public.vehicles_rpc_fail('validation_error','Historical reading must be numeric or null.'); END IF;
        v_reading:=(v_op->>'usage_reading_value')::numeric;
      ELSIF v_action='update' AND NOT (v_op ? 'usage_reading_value') THEN
        SELECT usage_reading_value INTO v_reading FROM public.vehicle_ongoing_records WHERE owner_id=v_owner_id AND asset_id=v_asset_id AND id=v_entity_id;
      ELSE v_reading:=NULL;
      END IF;
      IF (v_unit='none' AND v_reading IS NOT NULL) OR (v_reading IS NOT NULL AND v_reading<0) THEN PERFORM public.vehicles_rpc_fail('validation_error','Historical reading value does not match its stored unit.'); END IF;
      IF v_op ? 'mechanic' AND v_op->'mechanic'<>'null'::jsonb
          AND pg_catalog.jsonb_typeof(v_op->'mechanic') IS DISTINCT FROM 'string' THEN
        PERFORM public.vehicles_rpc_fail('validation_error','Mechanic must be a string or null.');
      END IF;
      IF v_action='create' THEN
        IF pg_catalog.jsonb_typeof(v_op->'items') IS DISTINCT FROM 'array' THEN PERFORM public.vehicles_rpc_fail('validation_error','Ongoing creation requires captured item states.'); END IF;
        SELECT COALESCE(pg_catalog.array_agg(mi.id ORDER BY mi.id),ARRAY[]::uuid[]) INTO v_applicable_ids
        FROM public.maintenance_items mi
        WHERE mi.owner_id=v_owner_id AND mi.archived_at IS NULL AND (
          mi.availability_mode='all_assets'
          OR (mi.availability_mode='current_asset_only' AND mi.current_asset_id=v_asset_id)
          OR (mi.availability_mode='selected_assets' AND EXISTS (
            SELECT 1 FROM public.vehicle_maintenance_item_assets ma
            WHERE ma.owner_id=v_owner_id AND ma.maintenance_item_id=mi.id AND ma.asset_id=v_asset_id
          ))
        );
        v_submitted_ids:=ARRAY[]::uuid[];
        FOR v_member IN SELECT value FROM pg_catalog.jsonb_array_elements(v_op->'items')
        LOOP
          PERFORM public.vehicles_rpc_assert_object(
            v_member,ARRAY['maintenance_item_id','is_performed','display_name_snapshot','group_snapshot'],
            ARRAY['maintenance_item_id','is_performed','display_name_snapshot','group_snapshot'],
            'ongoing_operations.items'
          );
          v_item_id:=public.vehicles_rpc_uuid(v_member->'maintenance_item_id','ongoing_operations.items.maintenance_item_id');
          IF v_item_id=ANY(v_submitted_ids) THEN PERFORM public.vehicles_rpc_fail('validation_error','Captured item IDs must be unique.'); END IF;
          v_submitted_ids:=pg_catalog.array_append(v_submitted_ids,v_item_id);
          IF pg_catalog.jsonb_typeof(v_member->'is_performed') IS DISTINCT FROM 'boolean' THEN PERFORM public.vehicles_rpc_fail('validation_error','is_performed must be a Boolean.'); END IF;
          IF NOT v_item_id=ANY(v_applicable_ids) THEN PERFORM public.vehicles_rpc_fail('item_archived_or_unavailable','A captured Maintenance Item is not applicable to this asset.'); END IF;
          IF NOT EXISTS (
            SELECT 1 FROM public.maintenance_items mi
            WHERE mi.owner_id=v_owner_id AND mi.id=v_item_id
              AND mi.display_name=v_member->>'display_name_snapshot'
              AND mi.item_group=v_member->>'group_snapshot'
          ) THEN PERFORM public.vehicles_rpc_fail('validation_error','Captured item labels must match the current catalog at creation.'); END IF;
        END LOOP;
        SELECT COALESCE(pg_catalog.array_agg(ids.id ORDER BY ids.id),ARRAY[]::uuid[])
        INTO v_submitted_ids FROM pg_catalog.unnest(v_submitted_ids) AS ids(id);
        IF v_submitted_ids IS DISTINCT FROM v_applicable_ids THEN PERFORM public.vehicles_rpc_fail('validation_error','Ongoing creation must capture every applicable active Maintenance Item exactly once.'); END IF;
        INSERT INTO public.vehicle_ongoing_records
          (id,owner_id,asset_id,service_date,usage_reading_unit,usage_reading_value,mechanic)
        VALUES(v_entity_id,v_owner_id,v_asset_id,v_service_date,v_unit,v_reading,v_op->>'mechanic');
        FOR v_member IN SELECT value FROM pg_catalog.jsonb_array_elements(v_op->'items')
        LOOP
          INSERT INTO public.vehicle_ongoing_items
            (owner_id,record_id,maintenance_item_id,is_performed,display_name_snapshot,group_snapshot)
          VALUES(v_owner_id,v_entity_id,(v_member->>'maintenance_item_id')::uuid,
            (v_member->>'is_performed')::boolean,v_member->>'display_name_snapshot',v_member->>'group_snapshot');
        END LOOP;
        v_current_version:=1;
        v_created_ids:=v_created_ids||pg_catalog.jsonb_build_object('ongoing',COALESCE(v_created_ids->'ongoing','[]'::jsonb)||pg_catalog.jsonb_build_array(v_entity_id));
      ELSE
        IF v_action='update' THEN
          IF NOT (v_op ? 'service_date' OR v_op ? 'usage_reading_unit'
              OR v_op ? 'usage_reading_value' OR v_op ? 'mechanic' OR v_op ? 'items') THEN
            PERFORM public.vehicles_rpc_fail('validation_error','An Ongoing update must change at least one field.');
          END IF;
          UPDATE public.vehicle_ongoing_records
          SET service_date=CASE WHEN v_op ? 'service_date' THEN v_service_date ELSE service_date END,
              usage_reading_unit=v_unit,usage_reading_value=v_reading,
              mechanic=CASE WHEN v_op ? 'mechanic' THEN v_op->>'mechanic' ELSE mechanic END,
              version=version+1
          WHERE owner_id=v_owner_id AND asset_id=v_asset_id AND id=v_entity_id
          RETURNING version INTO v_current_version;
          IF v_op ? 'items' THEN
            IF pg_catalog.jsonb_typeof(v_op->'items') IS DISTINCT FROM 'array' THEN PERFORM public.vehicles_rpc_fail('validation_error','Ongoing item states must be an array.'); END IF;
            SELECT COALESCE(pg_catalog.array_agg(maintenance_item_id ORDER BY maintenance_item_id),ARRAY[]::uuid[]) INTO v_applicable_ids
            FROM public.vehicle_ongoing_items WHERE owner_id=v_owner_id AND record_id=v_entity_id;
            v_submitted_ids:=ARRAY[]::uuid[];
            FOR v_member IN SELECT value FROM pg_catalog.jsonb_array_elements(v_op->'items')
            LOOP
              PERFORM public.vehicles_rpc_assert_object(v_member,ARRAY['maintenance_item_id','is_performed'],ARRAY['maintenance_item_id','is_performed'],'ongoing_operations.items');
              v_item_id:=public.vehicles_rpc_uuid(v_member->'maintenance_item_id','ongoing_operations.items.maintenance_item_id');
              IF v_item_id=ANY(v_submitted_ids) THEN PERFORM public.vehicles_rpc_fail('validation_error','Captured item IDs must be unique.'); END IF;
              v_submitted_ids:=pg_catalog.array_append(v_submitted_ids,v_item_id);
              IF pg_catalog.jsonb_typeof(v_member->'is_performed') IS DISTINCT FROM 'boolean' THEN PERFORM public.vehicles_rpc_fail('validation_error','is_performed must be a Boolean.'); END IF;
            END LOOP;
            SELECT COALESCE(pg_catalog.array_agg(ids.id ORDER BY ids.id),ARRAY[]::uuid[])
            INTO v_submitted_ids FROM pg_catalog.unnest(v_submitted_ids) AS ids(id);
            IF v_submitted_ids IS DISTINCT FROM v_applicable_ids THEN PERFORM public.vehicles_rpc_fail('validation_error','Ongoing edits must preserve the captured Maintenance Item set.'); END IF;
            FOR v_member IN SELECT value FROM pg_catalog.jsonb_array_elements(v_op->'items')
            LOOP
              UPDATE public.vehicle_ongoing_items SET is_performed=(v_member->>'is_performed')::boolean
              WHERE owner_id=v_owner_id AND record_id=v_entity_id
                AND maintenance_item_id=(v_member->>'maintenance_item_id')::uuid;
            END LOOP;
          END IF;
        END IF;
      END IF;
      v_entity_versions:=v_entity_versions||pg_catalog.jsonb_build_object(
        'ongoing',COALESCE(v_entity_versions->'ongoing','{}'::jsonb)||pg_catalog.jsonb_build_object(v_entity_id::text,v_current_version)
      );
      v_changed:=true;
    END LOOP;
  END IF;

  -- Recommended and Completed records share the historical reading rules but remain independent.
  FOR v_action IN SELECT unnest(ARRAY['recommended','completed'])
  LOOP
    IF NOT p_request ? (v_action||'_operations') THEN CONTINUE; END IF;
    IF pg_catalog.jsonb_typeof(p_request->(v_action||'_operations')) IS DISTINCT FROM 'array' THEN
      PERFORM public.vehicles_rpc_fail('validation_error',(v_action||'_operations must be an array.'));
    END IF;
    v_seen_ids:=ARRAY[]::uuid[];
    FOR v_op IN SELECT value FROM pg_catalog.jsonb_array_elements(p_request->(v_action||'_operations'))
    LOOP
      v_unit:=v_action;
      IF v_op->>'action'='create' THEN
        IF v_action='recommended' THEN
          PERFORM public.vehicles_rpc_assert_object(v_op,ARRAY['action','id','service_date','usage_reading_unit','usage_reading_value','mechanic','description'],ARRAY['action','id','service_date','usage_reading_unit','description'],'recommended_operations.create');
        ELSE
          PERFORM public.vehicles_rpc_assert_object(v_op,ARRAY['action','id','service_date','usage_reading_unit','usage_reading_value','mechanic','service_description'],ARRAY['action','id','service_date','usage_reading_unit','service_description'],'completed_operations.create');
        END IF;
        v_entity_id:=public.vehicles_rpc_uuid(v_op->'id',v_action||'_operations.id');
      ELSIF v_op->>'action' IN ('update','delete') THEN
        IF v_op->>'action'='update' AND NOT (
          v_op ? 'service_date' OR v_op ? 'usage_reading_unit'
          OR v_op ? 'usage_reading_value' OR v_op ? 'mechanic'
          OR v_op ? 'description' OR v_op ? 'service_description'
        ) THEN
          PERFORM public.vehicles_rpc_fail('validation_error',(v_action||' update must change at least one field.'));
        END IF;
        IF v_action='recommended' THEN
          PERFORM public.vehicles_rpc_assert_object(v_op,ARRAY['action','id','expected_version','service_date','usage_reading_unit','usage_reading_value','mechanic','description'],ARRAY['action','id','expected_version'], 'recommended_operations.'||(v_op->>'action'));
        ELSE
          PERFORM public.vehicles_rpc_assert_object(v_op,ARRAY['action','id','expected_version','service_date','usage_reading_unit','usage_reading_value','mechanic','service_description'],ARRAY['action','id','expected_version'], 'completed_operations.'||(v_op->>'action'));
        END IF;
        v_entity_id:=public.vehicles_rpc_uuid(v_op->'id',v_action||'_operations.id');
        v_expected_version:=public.vehicles_rpc_version(v_op->'expected_version',v_action||'_operations.expected_version');
        IF v_action='recommended' THEN
          SELECT version INTO v_current_version FROM public.vehicle_recommended_records WHERE owner_id=v_owner_id AND asset_id=v_asset_id AND id=v_entity_id FOR UPDATE;
        ELSE
          SELECT version INTO v_current_version FROM public.vehicle_completed_records WHERE owner_id=v_owner_id AND asset_id=v_asset_id AND id=v_entity_id FOR UPDATE;
        END IF;
        IF NOT FOUND THEN PERFORM public.vehicles_rpc_fail('not_found',(v_action||' record was not found.')); END IF;
        IF v_current_version<>v_expected_version THEN PERFORM public.vehicles_rpc_fail('version_conflict',(v_action||' record changed since it was loaded.')); END IF;
      ELSE
        PERFORM public.vehicles_rpc_fail('validation_error',(v_action||' action must be create, update, or delete.'));
      END IF;
      IF v_entity_id=ANY(v_seen_ids) THEN PERFORM public.vehicles_rpc_fail('validation_error',(v_action||' record may appear only once per request.')); END IF;
      v_seen_ids:=pg_catalog.array_append(v_seen_ids,v_entity_id);
      IF v_op->>'action'='delete' THEN
        IF v_action='recommended' THEN DELETE FROM public.vehicle_recommended_records WHERE owner_id=v_owner_id AND asset_id=v_asset_id AND id=v_entity_id;
        ELSE DELETE FROM public.vehicle_completed_records WHERE owner_id=v_owner_id AND asset_id=v_asset_id AND id=v_entity_id; END IF;
        v_deleted_ids:=v_deleted_ids||pg_catalog.jsonb_build_object(v_action,COALESCE(v_deleted_ids->v_action,'[]'::jsonb)||pg_catalog.jsonb_build_array(v_entity_id));
        v_changed:=true; CONTINUE;
      END IF;
      IF v_op ? 'service_date' THEN
        IF pg_catalog.jsonb_typeof(v_op->'service_date') IS DISTINCT FROM 'string' OR v_op->>'service_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN PERFORM public.vehicles_rpc_fail('validation_error','service_date must be a canonical date.'); END IF;
        v_service_date:=(v_op->>'service_date')::date;
      ELSIF v_op->>'action'='update' THEN
        IF v_action='recommended' THEN SELECT service_date INTO v_service_date FROM public.vehicle_recommended_records WHERE owner_id=v_owner_id AND asset_id=v_asset_id AND id=v_entity_id;
        ELSE SELECT service_date INTO v_service_date FROM public.vehicle_completed_records WHERE owner_id=v_owner_id AND asset_id=v_asset_id AND id=v_entity_id; END IF;
      ELSE PERFORM public.vehicles_rpc_fail('validation_error','Create requires service_date.'); END IF;
      IF v_op ? 'usage_reading_unit' THEN v_unit:=v_op->>'usage_reading_unit';
      ELSIF v_op->>'action'='update' THEN
        IF v_action='recommended' THEN SELECT usage_reading_unit INTO v_unit FROM public.vehicle_recommended_records WHERE owner_id=v_owner_id AND asset_id=v_asset_id AND id=v_entity_id;
        ELSE SELECT usage_reading_unit INTO v_unit FROM public.vehicle_completed_records WHERE owner_id=v_owner_id AND asset_id=v_asset_id AND id=v_entity_id; END IF;
      ELSE v_unit:=NULL; END IF;
      IF v_op ? 'usage_reading_unit'
          AND pg_catalog.jsonb_typeof(v_op->'usage_reading_unit') IS DISTINCT FROM 'string' THEN
        PERFORM public.vehicles_rpc_fail('validation_error','Historical reading unit must be a string.');
      END IF;
      IF v_unit NOT IN ('miles','hours','none') THEN PERFORM public.vehicles_rpc_fail('validation_error','Historical reading unit is invalid.'); END IF;
      IF v_op ? 'usage_reading_value' AND v_op->'usage_reading_value'<>'null'::jsonb THEN
        IF pg_catalog.jsonb_typeof(v_op->'usage_reading_value') IS DISTINCT FROM 'number' THEN PERFORM public.vehicles_rpc_fail('validation_error','Historical reading must be numeric or null.'); END IF;
        v_reading:=(v_op->>'usage_reading_value')::numeric;
      ELSIF v_op->>'action'='update' AND NOT (v_op ? 'usage_reading_value') THEN
        IF v_action='recommended' THEN SELECT usage_reading_value INTO v_reading FROM public.vehicle_recommended_records WHERE owner_id=v_owner_id AND asset_id=v_asset_id AND id=v_entity_id;
        ELSE SELECT usage_reading_value INTO v_reading FROM public.vehicle_completed_records WHERE owner_id=v_owner_id AND asset_id=v_asset_id AND id=v_entity_id; END IF;
      ELSE v_reading:=NULL; END IF;
      IF (v_unit='none' AND v_reading IS NOT NULL) OR (v_reading IS NOT NULL AND v_reading<0) THEN PERFORM public.vehicles_rpc_fail('validation_error','Historical reading value does not match its stored unit.'); END IF;
      IF v_op ? 'mechanic' AND v_op->'mechanic'<>'null'::jsonb
          AND pg_catalog.jsonb_typeof(v_op->'mechanic') IS DISTINCT FROM 'string' THEN
        PERFORM public.vehicles_rpc_fail('validation_error','Mechanic must be a string or null.');
      END IF;
      IF v_action='recommended' THEN
        IF v_op->>'action'='create' OR v_op ? 'description' THEN
          IF pg_catalog.jsonb_typeof(v_op->'description') IS DISTINCT FROM 'string' OR pg_catalog.char_length(v_op->>'description') NOT BETWEEN 1 AND 10000 OR v_op->>'description'<>pg_catalog.btrim(v_op->>'description') THEN PERFORM public.vehicles_rpc_fail('validation_error','Recommended Service description is invalid.'); END IF;
        END IF;
        IF v_op->>'action'='create' THEN
          INSERT INTO public.vehicle_recommended_records(id,owner_id,asset_id,service_date,usage_reading_unit,usage_reading_value,mechanic,description)
          VALUES(v_entity_id,v_owner_id,v_asset_id,v_service_date,v_unit,v_reading,v_op->>'mechanic',v_op->>'description');
          v_current_version:=1; v_created_ids:=v_created_ids||pg_catalog.jsonb_build_object('recommended',COALESCE(v_created_ids->'recommended','[]'::jsonb)||pg_catalog.jsonb_build_array(v_entity_id));
        ELSE
          UPDATE public.vehicle_recommended_records SET service_date=v_service_date,usage_reading_unit=v_unit,usage_reading_value=v_reading,
            mechanic=CASE WHEN v_op ? 'mechanic' THEN v_op->>'mechanic' ELSE mechanic END,
            description=CASE WHEN v_op ? 'description' THEN v_op->>'description' ELSE description END,version=version+1
          WHERE owner_id=v_owner_id AND asset_id=v_asset_id AND id=v_entity_id RETURNING version INTO v_current_version;
        END IF;
      ELSE
        IF v_op->>'action'='create' OR v_op ? 'service_description' THEN
          IF pg_catalog.jsonb_typeof(v_op->'service_description') IS DISTINCT FROM 'string' OR pg_catalog.char_length(v_op->>'service_description') NOT BETWEEN 1 AND 10000 OR v_op->>'service_description'<>pg_catalog.btrim(v_op->>'service_description') THEN PERFORM public.vehicles_rpc_fail('validation_error','Completed Service description is invalid.'); END IF;
        END IF;
        IF v_op->>'action'='create' THEN
          INSERT INTO public.vehicle_completed_records(id,owner_id,asset_id,service_date,usage_reading_unit,usage_reading_value,mechanic,service_description)
          VALUES(v_entity_id,v_owner_id,v_asset_id,v_service_date,v_unit,v_reading,v_op->>'mechanic',v_op->>'service_description');
          v_current_version:=1; v_created_ids:=v_created_ids||pg_catalog.jsonb_build_object('completed',COALESCE(v_created_ids->'completed','[]'::jsonb)||pg_catalog.jsonb_build_array(v_entity_id));
        ELSE
          UPDATE public.vehicle_completed_records SET service_date=v_service_date,usage_reading_unit=v_unit,usage_reading_value=v_reading,
            mechanic=CASE WHEN v_op ? 'mechanic' THEN v_op->>'mechanic' ELSE mechanic END,
            service_description=CASE WHEN v_op ? 'service_description' THEN v_op->>'service_description' ELSE service_description END,version=version+1
          WHERE owner_id=v_owner_id AND asset_id=v_asset_id AND id=v_entity_id RETURNING version INTO v_current_version;
        END IF;
      END IF;
      v_entity_versions:=v_entity_versions||pg_catalog.jsonb_build_object(v_action,COALESCE(v_entity_versions->v_action,'{}'::jsonb)||pg_catalog.jsonb_build_object(v_entity_id::text,v_current_version));
      v_changed:=true;
    END LOOP;
  END LOOP;

  -- Key Information uses paragraphs and bullet-list items of plain/bold text runs.
  IF p_request ? 'key_information_operation' AND p_request->'key_information_operation'<>'null'::jsonb THEN
    v_op:=p_request->'key_information_operation';
    v_action:=v_op->>'action';
    IF v_action='create' THEN
      PERFORM public.vehicles_rpc_assert_object(v_op,ARRAY['action','id','document'],ARRAY['action','id','document'],'key_information_operation.create');
      v_entity_id:=public.vehicles_rpc_uuid(v_op->'id','key_information_operation.id');
      PERFORM public.vehicles_validate_key_information_document(v_op->'document');
      IF v_op->'document'->'blocks'='[]'::jsonb THEN PERFORM public.vehicles_rpc_fail('validation_error','Empty Key Information should be saved as a clear operation.'); END IF;
      INSERT INTO public.vehicle_key_information(id,owner_id,asset_id,document) VALUES(v_entity_id,v_owner_id,v_asset_id,v_op->'document');
      v_current_version:=1;
      v_created_ids:=v_created_ids||pg_catalog.jsonb_build_object('key_information',pg_catalog.jsonb_build_array(v_entity_id));
      v_entity_versions:=v_entity_versions||pg_catalog.jsonb_build_object('key_information',pg_catalog.jsonb_build_object(v_entity_id::text,1));
      v_changed:=true;
    ELSIF v_action IN ('update','delete','clear') THEN
      PERFORM public.vehicles_rpc_assert_object(v_op,CASE WHEN v_action='update' THEN ARRAY['action','id','expected_version','document'] ELSE ARRAY['action','id','expected_version'] END,ARRAY['action','id','expected_version'],'key_information_operation.'||v_action);
      v_entity_id:=public.vehicles_rpc_uuid(v_op->'id','key_information_operation.id');
      v_expected_version:=public.vehicles_rpc_version(v_op->'expected_version','key_information_operation.expected_version');
      SELECT version INTO v_current_version FROM public.vehicle_key_information WHERE owner_id=v_owner_id AND asset_id=v_asset_id AND id=v_entity_id FOR UPDATE;
      IF NOT FOUND THEN PERFORM public.vehicles_rpc_fail('not_found','Key Information was not found.'); END IF;
      IF v_current_version<>v_expected_version THEN PERFORM public.vehicles_rpc_fail('version_conflict','Key Information changed since it was loaded.'); END IF;
      IF v_action IN ('delete','clear') OR (v_op ? 'document' AND v_op->'document'->'blocks'='[]'::jsonb) THEN
        IF v_action='update' THEN PERFORM public.vehicles_validate_key_information_document(v_op->'document'); END IF;
        DELETE FROM public.vehicle_key_information WHERE owner_id=v_owner_id AND asset_id=v_asset_id AND id=v_entity_id;
        v_deleted_ids:=v_deleted_ids||pg_catalog.jsonb_build_object('key_information',pg_catalog.jsonb_build_array(v_entity_id));
      ELSE
        IF NOT v_op ? 'document' THEN PERFORM public.vehicles_rpc_fail('validation_error','Key Information update requires document.'); END IF;
        PERFORM public.vehicles_validate_key_information_document(v_op->'document');
        UPDATE public.vehicle_key_information SET document=v_op->'document',version=version+1
        WHERE owner_id=v_owner_id AND asset_id=v_asset_id AND id=v_entity_id RETURNING version INTO v_current_version;
        v_entity_versions:=v_entity_versions||pg_catalog.jsonb_build_object('key_information',pg_catalog.jsonb_build_object(v_entity_id::text,v_current_version));
      END IF;
      v_changed:=true;
    ELSE
      PERFORM public.vehicles_rpc_fail('validation_error','Key Information action must be create, update, delete, or clear.');
    END IF;
  END IF;

  -- Links: update may change only submitted fields; every version check is asset-scoped.
  IF p_request ? 'link_operations' THEN
    IF pg_catalog.jsonb_typeof(p_request->'link_operations') IS DISTINCT FROM 'array' THEN PERFORM public.vehicles_rpc_fail('validation_error','link_operations must be an array.'); END IF;
    v_seen_ids:=ARRAY[]::uuid[];
    FOR v_op IN SELECT value FROM pg_catalog.jsonb_array_elements(p_request->'link_operations')
    LOOP
      v_action:=v_op->>'action';
      IF v_action='create' THEN
        PERFORM public.vehicles_rpc_assert_object(v_op,ARRAY['action','id','url','display_title','sort_order'],ARRAY['action','id','url'],'link_operations.create');
        v_entity_id:=public.vehicles_rpc_uuid(v_op->'id','link_operations.id');
      ELSIF v_action IN ('update','delete') THEN
        IF v_action='update' AND NOT (v_op ? 'url' OR v_op ? 'display_title' OR v_op ? 'sort_order') THEN
          PERFORM public.vehicles_rpc_fail('validation_error','A Link update must change at least one field.');
        END IF;
        PERFORM public.vehicles_rpc_assert_object(v_op,ARRAY['action','id','expected_version','url','display_title','sort_order'],ARRAY['action','id','expected_version'],'link_operations.'||v_action);
        v_entity_id:=public.vehicles_rpc_uuid(v_op->'id','link_operations.id');
        v_expected_version:=public.vehicles_rpc_version(v_op->'expected_version','link_operations.expected_version');
        SELECT version INTO v_current_version FROM public.vehicle_links WHERE owner_id=v_owner_id AND asset_id=v_asset_id AND id=v_entity_id FOR UPDATE;
        IF NOT FOUND THEN PERFORM public.vehicles_rpc_fail('not_found','The Link was not found.'); END IF;
        IF v_current_version<>v_expected_version THEN PERFORM public.vehicles_rpc_fail('version_conflict','The Link changed since it was loaded.'); END IF;
      ELSE PERFORM public.vehicles_rpc_fail('validation_error','Link action must be create, update, or delete.'); END IF;
      IF v_entity_id=ANY(v_seen_ids) THEN PERFORM public.vehicles_rpc_fail('validation_error','A Link may appear only once per request.'); END IF;
      v_seen_ids:=pg_catalog.array_append(v_seen_ids,v_entity_id);
      IF v_action='delete' THEN
        DELETE FROM public.vehicle_links WHERE owner_id=v_owner_id AND asset_id=v_asset_id AND id=v_entity_id;
        v_deleted_ids:=v_deleted_ids||pg_catalog.jsonb_build_object('links',COALESCE(v_deleted_ids->'links','[]'::jsonb)||pg_catalog.jsonb_build_array(v_entity_id));
        v_changed:=true; CONTINUE;
      END IF;
      IF v_op ? 'url' THEN
        IF pg_catalog.jsonb_typeof(v_op->'url') IS DISTINCT FROM 'string'
            OR pg_catalog.char_length(v_op->>'url')>2048
            OR v_op->>'url' !~* '^https://[^[:space:]/?#]+([/?#].*)?$'
            OR (pg_catalog.split_part(
              pg_catalog.split_part(pg_catalog.split_part(v_op->>'url', '/', 3), '?', 1),
              '#', 1
            ) LIKE '%@%')
            OR v_op->>'url' ~ '[[:cntrl:]]' THEN
          PERFORM public.vehicles_rpc_fail('validation_error','Links require an absolute HTTPS URL without credentials or control characters.');
        END IF;
      ELSIF v_action='create' THEN PERFORM public.vehicles_rpc_fail('validation_error','Link creation requires url.'); END IF;
      IF v_op ? 'display_title' AND v_op->'display_title'<>'null'::jsonb
          AND (pg_catalog.jsonb_typeof(v_op->'display_title') IS DISTINCT FROM 'string' OR pg_catalog.char_length(v_op->>'display_title')>300) THEN
        PERFORM public.vehicles_rpc_fail('validation_error','Link display_title is invalid.');
      END IF;
      IF v_op ? 'sort_order' AND (pg_catalog.jsonb_typeof(v_op->'sort_order') IS DISTINCT FROM 'number' OR v_op->>'sort_order' !~ '^(0|[1-9][0-9]*)$') THEN
        PERFORM public.vehicles_rpc_fail('validation_error','Link sort_order must be a nonnegative integer.');
      END IF;
      IF v_action='create' THEN
        INSERT INTO public.vehicle_links(id,owner_id,asset_id,url,display_title,sort_order)
        VALUES(v_entity_id,v_owner_id,v_asset_id,v_op->>'url',v_op->>'display_title',COALESCE((v_op->>'sort_order')::integer,0));
        v_current_version:=1;
        v_created_ids:=v_created_ids||pg_catalog.jsonb_build_object('links',COALESCE(v_created_ids->'links','[]'::jsonb)||pg_catalog.jsonb_build_array(v_entity_id));
      ELSE
        UPDATE public.vehicle_links SET
          url=CASE WHEN v_op ? 'url' THEN v_op->>'url' ELSE url END,
          display_title=CASE WHEN v_op ? 'display_title' THEN v_op->>'display_title' ELSE display_title END,
          sort_order=CASE WHEN v_op ? 'sort_order' THEN (v_op->>'sort_order')::integer ELSE sort_order END,
          version=version+1
        WHERE owner_id=v_owner_id AND asset_id=v_asset_id AND id=v_entity_id RETURNING version INTO v_current_version;
      END IF;
      v_entity_versions:=v_entity_versions||pg_catalog.jsonb_build_object('links',COALESCE(v_entity_versions->'links','{}'::jsonb)||pg_catalog.jsonb_build_object(v_entity_id::text,v_current_version));
      v_changed:=true;
    END LOOP;
  END IF;

  IF v_changed THEN
    UPDATE public.vehicles_assets SET version=version+1
    WHERE owner_id=v_owner_id AND id=v_asset_id
    RETURNING version INTO v_asset_version;
    v_asset_versions:=pg_catalog.jsonb_build_object(v_asset_id::text,v_asset_version);
    FOR v_interval_asset_id IN
      SELECT DISTINCT ids.id FROM pg_catalog.unnest(v_changed_asset_ids) AS ids(id) ORDER BY ids.id
    LOOP
      UPDATE public.vehicles_assets SET version=version+1
      WHERE owner_id=v_owner_id AND id=v_interval_asset_id
      RETURNING version INTO v_current_version;
      v_asset_versions:=v_asset_versions||pg_catalog.jsonb_build_object(v_interval_asset_id::text,v_current_version);
    END LOOP;
  END IF;

  v_result:=pg_catalog.jsonb_build_object(
    'ok',true,'request_id',v_request_id,'replayed',false,'asset_id',v_asset_id,
    'asset_version',v_asset_version,'entity_versions',v_entity_versions,
    'created_ids',v_created_ids,'deleted_ids',v_deleted_ids,
    'affected_asset_versions',v_asset_versions
  );
  INSERT INTO public.vehicles_save_requests(owner_id,request_id,payload_hash,result)
  VALUES(v_owner_id,v_request_id,v_payload_hash,v_result);
  RETURN v_result;
EXCEPTION
  WHEN lock_not_available THEN
    PERFORM public.vehicles_rpc_fail(
      'version_conflict','A related Vehicles workspace is being saved; reload and retry.'
    );
  WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint IN (
      'vehicle_ongoing_records_owner_asset_date_key',
      'vehicle_recommended_records_owner_asset_date_key',
      'vehicle_completed_records_owner_asset_date_key'
    ) THEN
      PERFORM public.vehicles_rpc_fail(
        'duplicate_service_date','A record already exists in this collection for the service date.',
        pg_catalog.jsonb_build_object('constraint',v_constraint)
      );
    ELSIF v_constraint='maintenance_items_owner_active_name_key' THEN
      PERFORM public.vehicles_rpc_fail('duplicate_active_item_name','An active Maintenance Item already has this name.');
    ELSIF v_constraint='vehicle_maintenance_intervals_owner_asset_item_key' THEN
      PERFORM public.vehicles_rpc_fail('duplicate_interval','An interval already exists for this asset and Maintenance Item.');
    ELSE
      PERFORM public.vehicles_rpc_fail('validation_error','The request conflicts with an existing entity.');
    END IF;
  WHEN check_violation OR foreign_key_violation OR not_null_violation
      OR invalid_text_representation OR numeric_value_out_of_range
      OR invalid_parameter_value OR string_data_right_truncation
      OR datetime_field_overflow THEN
    PERFORM public.vehicles_rpc_fail('validation_error','The request violates a Vehicles field or relationship constraint.');
END
$function$;

COMMENT ON FUNCTION public.save_vehicles_changes(jsonb) IS
  'Atomic owner-authenticated Vehicles save. JSONB text is canonicalized before SHA-256; lock order is request advisory lock, selected asset row, owner catalog advisory lock, related asset rows by UUID using NOWAIT, Maintenance Items by UUID, then entities. Cross-asset interval deletes require the related asset version and bump each affected asset revision once. Empty operations are no-ops; an explicit valid update is a versioned change even if its submitted value equals the stored value.';

REVOKE ALL PRIVILEGES ON FUNCTION public.save_vehicles_changes(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON FUNCTION public.vehicles_rpc_fail(text,text,jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON FUNCTION public.vehicles_rpc_assert_object(jsonb,text[],text[],text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON FUNCTION public.vehicles_rpc_uuid(jsonb,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON FUNCTION public.vehicles_rpc_version(jsonb,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON FUNCTION public.vehicles_validate_key_information_document(jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_vehicles_changes(jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
