BEGIN;

CREATE FUNCTION public.create_vehicle_asset(p_request jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_owner_id uuid := auth.uid();
  v_request_id uuid;
  v_asset_id uuid;
  v_name text;
  v_usage_unit text;
  v_payload_hash text;
  v_receipt public.vehicles_save_requests%ROWTYPE;
  v_asset public.vehicles_assets%ROWTYPE;
  v_inserted boolean := false;
  v_result jsonb;
BEGIN
  IF v_owner_id IS NULL THEN
    PERFORM public.vehicles_rpc_fail('authorization_error', 'Authentication is required.');
  END IF;

  PERFORM public.vehicles_rpc_assert_object(
    p_request,
    ARRAY['request_id', 'asset_id', 'name', 'usage_unit'],
    ARRAY['request_id', 'asset_id', 'name', 'usage_unit'],
    'asset creation request'
  );
  v_request_id := public.vehicles_rpc_uuid(p_request->'request_id', 'request_id');
  v_asset_id := public.vehicles_rpc_uuid(p_request->'asset_id', 'asset_id');

  IF pg_catalog.jsonb_typeof(p_request->'name') IS DISTINCT FROM 'string' THEN
    PERFORM public.vehicles_rpc_fail('validation_error', 'Asset name must be a string.');
  END IF;
  v_name := pg_catalog.regexp_replace(
    p_request->>'name', '^[[:space:]]+|[[:space:]]+$', '', 'g'
  );
  IF pg_catalog.char_length(v_name) NOT BETWEEN 1 AND 120
      OR v_name !~ '[^[:space:]]' THEN
    PERFORM public.vehicles_rpc_fail('validation_error', 'Asset name must be 1-120 nonblank characters.');
  END IF;

  IF pg_catalog.jsonb_typeof(p_request->'usage_unit') IS DISTINCT FROM 'string'
      OR p_request->>'usage_unit' NOT IN ('miles', 'hours', 'none') THEN
    PERFORM public.vehicles_rpc_fail('validation_error', 'Asset usage unit is not supported.');
  END IF;
  v_usage_unit := p_request->>'usage_unit';

  v_payload_hash := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(
      pg_catalog.jsonb_build_object(
        'operation', 'create_vehicle_asset',
        'request_id', v_request_id,
        'asset_id', v_asset_id,
        'name', v_name,
        'usage_unit', v_usage_unit
      )::text,
      'UTF8'
    )),
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
        'request_id_payload_mismatch', 'The request ID was already used with different asset creation data.'
      );
    END IF;
    RETURN pg_catalog.jsonb_set(v_receipt.result, '{replayed}', 'true'::jsonb, true);
  END IF;

  INSERT INTO public.vehicles_assets(owner_id, id, name, usage_unit)
  VALUES (v_owner_id, v_asset_id, v_name, v_usage_unit)
  ON CONFLICT (id) DO NOTHING
  RETURNING * INTO v_asset;
  v_inserted := FOUND;

  IF NOT v_inserted THEN
    SELECT * INTO v_asset
    FROM public.vehicles_assets
    WHERE id = v_asset_id;
    IF NOT FOUND OR v_asset.owner_id <> v_owner_id
        OR v_asset.name <> v_name OR v_asset.usage_unit <> v_usage_unit THEN
      PERFORM public.vehicles_rpc_fail(
        'asset_id_conflict', 'The requested asset ID is already assigned to incompatible data.'
      );
    END IF;
  END IF;

  v_result := pg_catalog.jsonb_build_object(
    'ok', true,
    'request_id', v_request_id,
    'replayed', false,
    'reconciled', NOT v_inserted,
    'asset_id', v_asset.id,
    'asset_version', v_asset.version,
    'asset', pg_catalog.jsonb_build_object(
      'id', v_asset.id,
      'name', v_asset.name,
      'usage_unit', v_asset.usage_unit,
      'version', v_asset.version,
      'created_at', v_asset.created_at,
      'updated_at', v_asset.updated_at
    )
  );

  INSERT INTO public.vehicles_save_requests(owner_id, request_id, payload_hash, result)
  VALUES (v_owner_id, v_request_id, v_payload_hash, v_result);

  RETURN v_result;
EXCEPTION
  WHEN unique_violation THEN
    PERFORM public.vehicles_rpc_fail(
      'request_id_payload_mismatch', 'The request ID conflicts with an existing Vehicles operation.'
    );
  WHEN check_violation OR foreign_key_violation OR not_null_violation
      OR invalid_text_representation OR string_data_right_truncation THEN
    PERFORM public.vehicles_rpc_fail(
      'validation_error', 'The asset creation request violates a Vehicles field constraint.'
    );
END
$function$;

COMMENT ON FUNCTION public.create_vehicle_asset(jsonb) IS
  'Atomic owner-authenticated asset creation. Uses a client-generated asset UUID and request receipt for retry reconciliation; creates no related Vehicles rows.';

REVOKE ALL PRIVILEGES ON FUNCTION public.create_vehicle_asset(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_vehicle_asset(jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
