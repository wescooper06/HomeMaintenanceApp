BEGIN;

CREATE FUNCTION public.delete_vehicle_asset(p_request jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_owner_id uuid := auth.uid();
  v_request_id uuid;
  v_asset_id uuid;
  v_expected_version integer;
  v_name text;
  v_asset public.vehicles_assets%ROWTYPE;
  v_receipt public.vehicles_save_requests%ROWTYPE;
  v_payload_hash text;
  v_blockers jsonb;
  v_result jsonb;
BEGIN
  IF v_owner_id IS NULL THEN
    PERFORM public.vehicles_rpc_fail('authorization_error', 'Authentication is required.');
  END IF;
  PERFORM public.vehicles_rpc_assert_object(
    p_request,
    ARRAY['request_id','asset_id','expected_version','confirmation_name'],
    ARRAY['request_id','asset_id','expected_version','confirmation_name'],
    'asset deletion request'
  );
  v_request_id := public.vehicles_rpc_uuid(p_request->'request_id', 'request_id');
  v_asset_id := public.vehicles_rpc_uuid(p_request->'asset_id', 'asset_id');
  v_expected_version := public.vehicles_rpc_version(p_request->'expected_version', 'expected_version');
  IF pg_catalog.jsonb_typeof(p_request->'confirmation_name') IS DISTINCT FROM 'string'
      OR pg_catalog.char_length(p_request->>'confirmation_name') NOT BETWEEN 1 AND 120 THEN
    PERFORM public.vehicles_rpc_fail('validation_error', 'Type the exact asset name to confirm deletion.');
  END IF;
  v_name := p_request->>'confirmation_name';
  v_payload_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object(
      'operation','delete_vehicle_asset','request_id',v_request_id,'asset_id',v_asset_id,
      'expected_version',v_expected_version,'confirmation_name',v_name
    )::text, 'UTF8'
  )), 'hex');

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_owner_id::text || ':' || v_request_id::text, 0)
  );
  SELECT * INTO v_receipt FROM public.vehicles_save_requests
  WHERE owner_id = v_owner_id AND request_id = v_request_id;
  IF FOUND THEN
    IF v_receipt.payload_hash <> v_payload_hash THEN
      PERFORM public.vehicles_rpc_fail('request_id_payload_mismatch', 'The request ID was already used with different data.');
    END IF;
    RETURN pg_catalog.jsonb_set(v_receipt.result, '{replayed}', 'true'::jsonb, true);
  END IF;

  SELECT * INTO v_asset FROM public.vehicles_assets
  WHERE owner_id = v_owner_id AND id = v_asset_id FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM public.vehicles_rpc_fail('not_found', 'The requested asset was not found.');
  END IF;
  IF v_asset.version <> v_expected_version OR v_asset.name <> v_name THEN
    PERFORM public.vehicles_rpc_fail('version_conflict', 'The asset changed. Reload before confirming deletion.');
  END IF;

  -- Match the asset-then-catalog lock order used by Vehicles saves.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('vehicles-catalog:' || v_owner_id::text, 0)
  );
  SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', mi.id, 'display_name', mi.display_name, 'archived', mi.archived_at IS NOT NULL,
    'reason', CASE WHEN mi.availability_mode = 'current_asset_only'
      THEN 'current_asset_only' ELSE 'last_selected_asset' END
  ) ORDER BY mi.display_name, mi.id)
  INTO v_blockers
  FROM public.maintenance_items AS mi
  WHERE mi.owner_id = v_owner_id AND (
    (mi.availability_mode = 'current_asset_only' AND mi.current_asset_id = v_asset_id)
    OR (mi.availability_mode = 'selected_assets' AND mi.archived_at IS NULL
      AND EXISTS (
        SELECT 1 FROM public.vehicle_maintenance_item_assets AS ma
        WHERE ma.owner_id = v_owner_id AND ma.maintenance_item_id = mi.id AND ma.asset_id = v_asset_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.vehicle_maintenance_item_assets AS ma
        WHERE ma.owner_id = v_owner_id AND ma.maintenance_item_id = mi.id AND ma.asset_id <> v_asset_id
      ))
  );
  IF v_blockers IS NOT NULL THEN
    PERFORM public.vehicles_rpc_fail(
      'asset_in_use', 'This asset is still used by Maintenance Items.',
      pg_catalog.jsonb_build_object('items', v_blockers)
    );
  END IF;

  DELETE FROM public.vehicles_assets WHERE owner_id = v_owner_id AND id = v_asset_id;
  v_result := pg_catalog.jsonb_build_object(
    'ok', true, 'request_id', v_request_id, 'asset_id', v_asset_id,
    'deleted', true, 'replayed', false
  );
  INSERT INTO public.vehicles_save_requests(owner_id, request_id, payload_hash, result)
  VALUES (v_owner_id, v_request_id, v_payload_hash, v_result);
  RETURN v_result;
EXCEPTION
  WHEN lock_not_available OR deadlock_detected THEN
    PERFORM public.vehicles_rpc_fail('version_conflict', 'Related Vehicles data is changing. Reload and retry.');
  WHEN foreign_key_violation THEN
    PERFORM public.vehicles_rpc_fail('asset_in_use', 'This asset is still referenced. Reload its Maintenance Items.');
END
$function$;

COMMENT ON FUNCTION public.delete_vehicle_asset(jsonb) IS
  'Owner-authenticated version/name-confirmed asset deletion. Blocks current-only and final active selected applicability; preserves catalog rows; existing asset-owned cascades and immutable replay receipts apply.';

REVOKE ALL PRIVILEGES ON FUNCTION public.delete_vehicle_asset(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_vehicle_asset(jsonb) TO authenticated;

COMMIT;
