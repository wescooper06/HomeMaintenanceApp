BEGIN;

CREATE FUNCTION public.save_maintenance_item(p_request jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_owner_id uuid := auth.uid();
  v_request_id uuid;
  v_item_id uuid;
  v_operation text;
  v_expected_version integer;
  v_name text;
  v_group text;
  v_mode text;
  v_current_asset_id uuid;
  v_old_current_asset_id uuid;
  v_selected_asset_ids uuid[] := ARRAY[]::uuid[];
  v_lock_asset_ids uuid[] := ARRAY[]::uuid[];
  v_existing_asset_ids uuid[] := ARRAY[]::uuid[];
  v_lock_asset_id uuid;
  v_member jsonb;
  v_item public.maintenance_items%ROWTYPE;
  v_receipt public.vehicles_save_requests%ROWTYPE;
  v_payload_hash text;
  v_normalized_request jsonb;
  v_result jsonb;
  v_locked_count integer := 0;
  v_constraint text;
BEGIN
  IF v_owner_id IS NULL THEN
    PERFORM public.vehicles_rpc_fail('authorization_error', 'Authentication is required.');
  END IF;

  IF pg_catalog.jsonb_typeof(p_request) IS DISTINCT FROM 'object'
      OR pg_catalog.jsonb_typeof(p_request->'operation') IS DISTINCT FROM 'string' THEN
    PERFORM public.vehicles_rpc_fail('validation_error', 'A Maintenance Item operation is required.');
  END IF;
  v_operation := p_request->>'operation';

  IF v_operation = 'archive' THEN
    PERFORM public.vehicles_rpc_assert_object(
      p_request,
      ARRAY['request_id','operation','item_id','expected_version'],
      ARRAY['request_id','operation','item_id','expected_version'],
      'Maintenance Item archive request'
    );
    v_expected_version := public.vehicles_rpc_version(p_request->'expected_version', 'expected_version');
  ELSIF v_operation IN ('create','update') THEN
    IF v_operation = 'create' THEN
      PERFORM public.vehicles_rpc_assert_object(
        p_request,
        ARRAY['request_id','operation','item_id','display_name','item_group',
          'availability_mode','current_asset_id','selected_asset_ids'],
        ARRAY['request_id','operation','item_id','display_name','item_group',
          'availability_mode','current_asset_id','selected_asset_ids'],
        'Maintenance Item create request'
      );
    ELSE
      PERFORM public.vehicles_rpc_assert_object(
        p_request,
        ARRAY['request_id','operation','item_id','expected_version','display_name','item_group',
          'availability_mode','current_asset_id','selected_asset_ids'],
        ARRAY['request_id','operation','item_id','expected_version','display_name','item_group',
          'availability_mode','current_asset_id','selected_asset_ids'],
        'Maintenance Item update request'
      );
      v_expected_version := public.vehicles_rpc_version(p_request->'expected_version', 'expected_version');
    END IF;

    IF pg_catalog.jsonb_typeof(p_request->'display_name') IS DISTINCT FROM 'string'
        OR p_request->>'display_name' <> pg_catalog.btrim(p_request->>'display_name')
        OR pg_catalog.char_length(p_request->>'display_name') NOT BETWEEN 1 AND 100
        OR p_request->>'display_name' !~ '[^[:space:]]' THEN
      PERFORM public.vehicles_rpc_fail('validation_error', 'Maintenance Item name must be 1-100 trimmed nonblank characters.');
    END IF;
    IF pg_catalog.jsonb_typeof(p_request->'item_group') IS DISTINCT FROM 'string'
        OR p_request->>'item_group' NOT IN ('routine','fluids_drivetrain','components_other') THEN
      PERFORM public.vehicles_rpc_fail('validation_error', 'Maintenance Item group is invalid.');
    END IF;
    IF pg_catalog.jsonb_typeof(p_request->'availability_mode') IS DISTINCT FROM 'string'
        OR p_request->>'availability_mode' NOT IN ('all_assets','current_asset_only','selected_assets') THEN
      PERFORM public.vehicles_rpc_fail('validation_error', 'Maintenance Item availability mode is invalid.');
    END IF;

    v_name := p_request->>'display_name';
    v_group := p_request->>'item_group';
    v_mode := p_request->>'availability_mode';
    IF pg_catalog.jsonb_typeof(p_request->'selected_asset_ids') IS DISTINCT FROM 'array' THEN
      PERFORM public.vehicles_rpc_fail('validation_error', 'selected_asset_ids must be an array.');
    END IF;
    IF v_mode = 'current_asset_only' THEN
      v_current_asset_id := public.vehicles_rpc_uuid(p_request->'current_asset_id', 'current_asset_id');
      IF pg_catalog.jsonb_array_length(p_request->'selected_asset_ids') <> 0 THEN
        PERFORM public.vehicles_rpc_fail('validation_error', 'current_asset_only cannot include selected_asset_ids.');
      END IF;
    ELSE
      IF p_request->'current_asset_id' IS DISTINCT FROM 'null'::jsonb THEN
        PERFORM public.vehicles_rpc_fail('validation_error', 'Only current_asset_only may specify current_asset_id.');
      END IF;
      IF v_mode = 'all_assets' AND pg_catalog.jsonb_array_length(p_request->'selected_asset_ids') <> 0 THEN
        PERFORM public.vehicles_rpc_fail('validation_error', 'all_assets cannot include selected_asset_ids.');
      END IF;
      IF v_mode = 'selected_assets' AND pg_catalog.jsonb_array_length(p_request->'selected_asset_ids') = 0 THEN
        PERFORM public.vehicles_rpc_fail('validation_error', 'selected_assets requires at least one asset.');
      END IF;
    END IF;

    FOR v_member IN SELECT value FROM pg_catalog.jsonb_array_elements(p_request->'selected_asset_ids')
    LOOP
      v_lock_asset_id := public.vehicles_rpc_uuid(v_member, 'selected_asset_ids');
      IF v_lock_asset_id = ANY(v_selected_asset_ids) THEN
        PERFORM public.vehicles_rpc_fail('validation_error', 'Selected asset IDs must be unique.');
      END IF;
      v_selected_asset_ids := pg_catalog.array_append(v_selected_asset_ids, v_lock_asset_id);
    END LOOP;
    SELECT COALESCE(pg_catalog.array_agg(ids.id ORDER BY ids.id), ARRAY[]::uuid[])
    INTO v_selected_asset_ids
    FROM pg_catalog.unnest(v_selected_asset_ids) AS ids(id);
    IF v_current_asset_id IS NOT NULL THEN
      v_lock_asset_ids := pg_catalog.array_append(v_lock_asset_ids, v_current_asset_id);
    END IF;
    v_lock_asset_ids := v_lock_asset_ids || v_selected_asset_ids;
  ELSIF v_operation NOT IN ('create','update','archive') THEN
    PERFORM public.vehicles_rpc_fail('validation_error', 'Maintenance Item operation must be create, update, or archive.');
  END IF;

  v_request_id := public.vehicles_rpc_uuid(p_request->'request_id', 'request_id');
  v_item_id := public.vehicles_rpc_uuid(p_request->'item_id', 'item_id');
  v_normalized_request := pg_catalog.jsonb_build_object(
    'request_id', v_request_id,
    'operation', v_operation,
    'item_id', v_item_id,
    'expected_version', v_expected_version,
    'display_name', v_name,
    'item_group', v_group,
    'availability_mode', v_mode,
    'current_asset_id', v_current_asset_id,
    'selected_asset_ids', COALESCE(pg_catalog.to_jsonb(v_selected_asset_ids), '[]'::jsonb)
  );
  v_payload_hash := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(v_normalized_request::text, 'UTF8')),
    'hex'
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_owner_id::text || ':' || v_request_id::text, 0)
  );
  SELECT * INTO v_receipt
  FROM public.vehicles_save_requests
  WHERE owner_id = v_owner_id AND request_id = v_request_id;
  IF FOUND THEN
    IF v_receipt.payload_hash <> v_payload_hash THEN
      PERFORM public.vehicles_rpc_fail(
        'request_id_payload_mismatch',
        'The request ID was already used with different Maintenance Item data.'
      );
    END IF;
    RETURN pg_catalog.jsonb_set(v_receipt.result, '{replayed}', 'true'::jsonb, true);
  END IF;

  IF v_operation <> 'create' THEN
    SELECT mi.current_asset_id INTO v_old_current_asset_id
    FROM public.maintenance_items AS mi
    WHERE mi.owner_id = v_owner_id AND mi.id = v_item_id;
    IF NOT FOUND THEN
      PERFORM public.vehicles_rpc_fail('not_found', 'The Maintenance Item was not found.');
    END IF;
    v_lock_asset_ids := pg_catalog.array_append(v_lock_asset_ids, v_old_current_asset_id);
    SELECT COALESCE(pg_catalog.array_agg(ma.asset_id ORDER BY ma.asset_id), ARRAY[]::uuid[])
    INTO v_existing_asset_ids
    FROM public.vehicle_maintenance_item_assets AS ma
    WHERE ma.owner_id = v_owner_id AND ma.maintenance_item_id = v_item_id;
    v_lock_asset_ids := v_lock_asset_ids || v_existing_asset_ids;
    IF v_operation = 'archive' THEN
      v_selected_asset_ids := v_existing_asset_ids;
    END IF;
  END IF;

  SELECT COALESCE(pg_catalog.array_agg(ids.id ORDER BY ids.id), ARRAY[]::uuid[])
  INTO v_lock_asset_ids
  FROM (
    SELECT DISTINCT requested.id
    FROM pg_catalog.unnest(v_lock_asset_ids) AS requested(id)
    WHERE requested.id IS NOT NULL
  ) AS ids;

  FOR v_lock_asset_id IN
    SELECT a.id
    FROM public.vehicles_assets AS a
    WHERE a.owner_id = v_owner_id AND a.id = ANY(v_lock_asset_ids)
    ORDER BY a.id
    FOR UPDATE
  LOOP
    v_locked_count := v_locked_count + 1;
  END LOOP;
  IF v_locked_count <> pg_catalog.cardinality(v_lock_asset_ids) THEN
    PERFORM public.vehicles_rpc_fail('not_found', 'One or more selected assets were not found.');
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('vehicles-catalog:' || v_owner_id::text, 0)
  );

  IF v_operation = 'create' THEN
    INSERT INTO public.maintenance_items(
      owner_id, id, display_name, item_group, availability_mode, current_asset_id
    )
    VALUES (v_owner_id, v_item_id, v_name, v_group, v_mode, v_current_asset_id)
    RETURNING * INTO v_item;
    IF v_mode = 'selected_assets' THEN
      INSERT INTO public.vehicle_maintenance_item_assets(owner_id, maintenance_item_id, asset_id)
      SELECT v_owner_id, v_item_id, selected.id
      FROM pg_catalog.unnest(v_selected_asset_ids) AS selected(id)
      ORDER BY selected.id;
    END IF;
  ELSE
    SELECT * INTO v_item
    FROM public.maintenance_items AS mi
    WHERE mi.owner_id = v_owner_id AND mi.id = v_item_id
    FOR UPDATE;
    IF NOT FOUND THEN
      PERFORM public.vehicles_rpc_fail('not_found', 'The Maintenance Item was not found.');
    END IF;
    IF v_item.version <> v_expected_version THEN
      PERFORM public.vehicles_rpc_fail(
        'version_conflict', 'The Maintenance Item changed since it was loaded.',
        pg_catalog.jsonb_build_object(
          'entity','maintenance_item','id',v_item_id,
          'expected_version',v_expected_version,'current_version',v_item.version
        )
      );
    END IF;
    IF v_item.archived_at IS NOT NULL THEN
      PERFORM public.vehicles_rpc_fail('item_archived_or_unavailable', 'The Maintenance Item is already archived.');
    END IF;

    IF v_operation = 'archive' THEN
      IF EXISTS (
        SELECT 1 FROM public.vehicle_maintenance_intervals AS vi
        WHERE vi.owner_id = v_owner_id AND vi.maintenance_item_id = v_item_id
      ) THEN
        PERFORM public.vehicles_rpc_fail(
          'item_archived_or_unavailable',
          'A Maintenance Item cannot be archived while an interval references it.',
          pg_catalog.jsonb_build_object('maintenance_item_id', v_item_id)
        );
      END IF;
      UPDATE public.maintenance_items AS mi
      SET archived_at = pg_catalog.now(), version = mi.version + 1
      WHERE mi.owner_id = v_owner_id AND mi.id = v_item_id
      RETURNING * INTO v_item;
    ELSE
      IF EXISTS (
        SELECT 1
        FROM public.vehicle_maintenance_intervals AS vi
        WHERE vi.owner_id = v_owner_id AND vi.maintenance_item_id = v_item_id
          AND NOT (
            v_mode = 'all_assets'
            OR (v_mode = 'current_asset_only' AND vi.asset_id = v_current_asset_id)
            OR (v_mode = 'selected_assets' AND vi.asset_id = ANY(v_selected_asset_ids))
          )
      ) THEN
        PERFORM public.vehicles_rpc_fail(
          'item_archived_or_unavailable',
          'A Maintenance Item cannot become unavailable while an interval references it.',
          pg_catalog.jsonb_build_object('maintenance_item_id', v_item_id)
        );
      END IF;

      UPDATE public.maintenance_items AS mi
      SET display_name = v_name,
          item_group = v_group,
          availability_mode = v_mode,
          current_asset_id = v_current_asset_id,
          version = mi.version + 1
      WHERE mi.owner_id = v_owner_id AND mi.id = v_item_id
      RETURNING * INTO v_item;

      DELETE FROM public.vehicle_maintenance_item_assets AS ma
      WHERE ma.owner_id = v_owner_id AND ma.maintenance_item_id = v_item_id;
      IF v_mode = 'selected_assets' THEN
        INSERT INTO public.vehicle_maintenance_item_assets(owner_id, maintenance_item_id, asset_id)
        SELECT v_owner_id, v_item_id, selected.id
        FROM pg_catalog.unnest(v_selected_asset_ids) AS selected(id)
        ORDER BY selected.id;
      END IF;
    END IF;
  END IF;

  v_result := pg_catalog.jsonb_build_object(
    'ok', true,
    'request_id', v_request_id,
    'operation', v_operation,
    'item_id', v_item.id,
    'replayed', false,
    'reconciled', false,
    'item', pg_catalog.jsonb_build_object(
      'id', v_item.id,
      'display_name', v_item.display_name,
      'item_group', v_item.item_group,
      'availability_mode', v_item.availability_mode,
      'current_asset_id', v_item.current_asset_id,
      'archived_at', v_item.archived_at,
      'version', v_item.version,
      'selected_asset_ids', COALESCE(pg_catalog.to_jsonb(v_selected_asset_ids), '[]'::jsonb)
    )
  );
  INSERT INTO public.vehicles_save_requests(owner_id, request_id, payload_hash, result)
  VALUES (v_owner_id, v_request_id, v_payload_hash, v_result);
  RETURN v_result;
EXCEPTION
  WHEN lock_not_available THEN
    PERFORM public.vehicles_rpc_fail(
      'version_conflict', 'A related Vehicles workspace is being saved; reload and retry.'
    );
  WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint = 'maintenance_items_owner_active_name_key' THEN
      PERFORM public.vehicles_rpc_fail(
        'duplicate_active_item_name', 'An active Maintenance Item already has this name.'
      );
    ELSIF v_constraint = 'maintenance_items_pkey' THEN
      PERFORM public.vehicles_rpc_fail(
        'item_id_conflict', 'The Maintenance Item ID is already assigned to another item.'
      );
    ELSE
      PERFORM public.vehicles_rpc_fail('validation_error', 'The request conflicts with an existing entity.');
    END IF;
  WHEN check_violation OR foreign_key_violation OR not_null_violation
      OR invalid_text_representation OR numeric_value_out_of_range
      OR string_data_right_truncation THEN
    PERFORM public.vehicles_rpc_fail(
      'validation_error', 'The Maintenance Item request violates a Vehicles field or relationship constraint.'
    );
END
$function$;

COMMENT ON FUNCTION public.save_maintenance_item(jsonb) IS
  'Atomic owner-authenticated Maintenance Item catalog save. Replaces complete applicability sets under deterministic asset locks and the owner catalog lock; uses the shared Vehicles request receipt table.';

REVOKE ALL PRIVILEGES ON FUNCTION public.save_maintenance_item(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_maintenance_item(jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
