BEGIN;

CREATE FUNCTION public.vehicles_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END
$function$;

REVOKE ALL PRIVILEGES ON FUNCTION public.vehicles_set_updated_at()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE public.vehicles_assets (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  usage_unit text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT vehicles_assets_name_valid CHECK (
    name = btrim(name) AND name ~ '[^[:space:]]' AND char_length(name) BETWEEN 1 AND 120
  ),
  CONSTRAINT vehicles_assets_usage_unit_valid CHECK (usage_unit IN ('miles', 'hours', 'none')),
  CONSTRAINT vehicles_assets_version_positive CHECK (version > 0),
  CONSTRAINT vehicles_assets_owner_id_key UNIQUE (owner_id, id)
);

CREATE INDEX vehicles_assets_owner_name_idx
  ON public.vehicles_assets (owner_id, name, id);

CREATE TABLE public.maintenance_items (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  item_group text NOT NULL,
  availability_mode text NOT NULL,
  current_asset_id uuid,
  archived_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT maintenance_items_name_valid CHECK (
    display_name = btrim(display_name)
    AND display_name ~ '[^[:space:]]'
    AND char_length(display_name) BETWEEN 1 AND 100
  ),
  CONSTRAINT maintenance_items_group_valid CHECK (
    item_group IN ('routine', 'fluids_drivetrain', 'components_other')
  ),
  CONSTRAINT maintenance_items_availability_valid CHECK (
    availability_mode IN ('current_asset_only', 'selected_assets', 'all_assets')
  ),
  CONSTRAINT maintenance_items_availability_shape CHECK (
    (availability_mode = 'current_asset_only' AND current_asset_id IS NOT NULL)
    OR (availability_mode IN ('selected_assets', 'all_assets') AND current_asset_id IS NULL)
  ),
  CONSTRAINT maintenance_items_version_positive CHECK (version > 0),
  CONSTRAINT maintenance_items_owner_id_key UNIQUE (owner_id, id),
  CONSTRAINT maintenance_items_current_asset_owner_fkey
    FOREIGN KEY (owner_id, current_asset_id)
    REFERENCES public.vehicles_assets(owner_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE UNIQUE INDEX maintenance_items_owner_active_name_key
  ON public.maintenance_items (owner_id, lower(btrim(display_name)))
  WHERE archived_at IS NULL;

CREATE INDEX maintenance_items_owner_group_name_idx
  ON public.maintenance_items (owner_id, item_group, lower(display_name), id)
  WHERE archived_at IS NULL;

CREATE TABLE public.vehicle_maintenance_item_assets (
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  maintenance_item_id uuid NOT NULL,
  asset_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT vehicle_maintenance_item_assets_pkey
    PRIMARY KEY (owner_id, maintenance_item_id, asset_id),
  CONSTRAINT vehicle_maintenance_item_assets_item_owner_fkey
    FOREIGN KEY (owner_id, maintenance_item_id)
    REFERENCES public.maintenance_items(owner_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT vehicle_maintenance_item_assets_asset_owner_fkey
    FOREIGN KEY (owner_id, asset_id)
    REFERENCES public.vehicles_assets(owner_id, id)
    ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE INDEX vehicle_maintenance_item_assets_owner_asset_item_idx
  ON public.vehicle_maintenance_item_assets (owner_id, asset_id, maintenance_item_id);

CREATE TABLE public.vehicle_ongoing_records (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL,
  service_date date NOT NULL,
  usage_reading_value numeric(12,2),
  usage_reading_unit text NOT NULL,
  mechanic text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT vehicle_ongoing_records_usage_unit_valid CHECK (
    usage_reading_unit IN ('miles', 'hours', 'none')
  ),
  CONSTRAINT vehicle_ongoing_records_usage_value_valid CHECK (
    usage_reading_value IS NULL OR usage_reading_value >= 0
  ),
  CONSTRAINT vehicle_ongoing_records_none_has_no_reading CHECK (
    usage_reading_unit <> 'none' OR usage_reading_value IS NULL
  ),
  CONSTRAINT vehicle_ongoing_records_mechanic_length CHECK (
    mechanic IS NULL OR char_length(mechanic) <= 160
  ),
  CONSTRAINT vehicle_ongoing_records_version_positive CHECK (version > 0),
  CONSTRAINT vehicle_ongoing_records_owner_id_key UNIQUE (owner_id, id),
  CONSTRAINT vehicle_ongoing_records_owner_asset_date_key UNIQUE (owner_id, asset_id, service_date),
  CONSTRAINT vehicle_ongoing_records_asset_owner_fkey
    FOREIGN KEY (owner_id, asset_id)
    REFERENCES public.vehicles_assets(owner_id, id)
    ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE TABLE public.vehicle_ongoing_items (
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  record_id uuid NOT NULL,
  maintenance_item_id uuid NOT NULL,
  is_performed boolean NOT NULL,
  display_name_snapshot text NOT NULL,
  group_snapshot text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT vehicle_ongoing_items_pkey PRIMARY KEY (owner_id, record_id, maintenance_item_id),
  CONSTRAINT vehicle_ongoing_items_name_snapshot_valid CHECK (
    display_name_snapshot = btrim(display_name_snapshot)
    AND display_name_snapshot ~ '[^[:space:]]'
    AND char_length(display_name_snapshot) <= 100
  ),
  CONSTRAINT vehicle_ongoing_items_group_snapshot_valid CHECK (
    group_snapshot IN ('routine', 'fluids_drivetrain', 'components_other')
  ),
  CONSTRAINT vehicle_ongoing_items_record_owner_fkey
    FOREIGN KEY (owner_id, record_id)
    REFERENCES public.vehicle_ongoing_records(owner_id, id)
    ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT vehicle_ongoing_items_item_owner_fkey
    FOREIGN KEY (owner_id, maintenance_item_id)
    REFERENCES public.maintenance_items(owner_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE INDEX vehicle_ongoing_items_owner_item_record_idx
  ON public.vehicle_ongoing_items (owner_id, maintenance_item_id, record_id);

COMMENT ON INDEX public.vehicle_ongoing_items_owner_item_record_idx IS
  'Supports interval-source joins from an owner/item to captured Ongoing records, then service date.';

COMMENT ON TABLE public.vehicle_maintenance_item_assets IS
  'Selected-asset availability only. Active selected-item nonempty association is DEFERRED TO PHASE 4B ATOMIC RPC VALIDATION.';

CREATE TABLE public.vehicle_recommended_records (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL,
  service_date date NOT NULL,
  usage_reading_value numeric(12,2),
  usage_reading_unit text NOT NULL,
  mechanic text,
  description text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT vehicle_recommended_records_usage_unit_valid CHECK (
    usage_reading_unit IN ('miles', 'hours', 'none')
  ),
  CONSTRAINT vehicle_recommended_records_usage_value_valid CHECK (
    usage_reading_value IS NULL OR usage_reading_value >= 0
  ),
  CONSTRAINT vehicle_recommended_records_none_has_no_reading CHECK (
    usage_reading_unit <> 'none' OR usage_reading_value IS NULL
  ),
  CONSTRAINT vehicle_recommended_records_mechanic_length CHECK (
    mechanic IS NULL OR char_length(mechanic) <= 160
  ),
  CONSTRAINT vehicle_recommended_records_description_valid CHECK (
    description = btrim(description)
    AND description ~ '[^[:space:]]'
    AND char_length(description) <= 10000
  ),
  CONSTRAINT vehicle_recommended_records_version_positive CHECK (version > 0),
  CONSTRAINT vehicle_recommended_records_owner_id_key UNIQUE (owner_id, id),
  CONSTRAINT vehicle_recommended_records_owner_asset_date_key UNIQUE (owner_id, asset_id, service_date),
  CONSTRAINT vehicle_recommended_records_asset_owner_fkey
    FOREIGN KEY (owner_id, asset_id)
    REFERENCES public.vehicles_assets(owner_id, id)
    ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE TABLE public.vehicle_completed_records (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL,
  service_date date NOT NULL,
  usage_reading_value numeric(12,2),
  usage_reading_unit text NOT NULL,
  mechanic text,
  service_description text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT vehicle_completed_records_usage_unit_valid CHECK (
    usage_reading_unit IN ('miles', 'hours', 'none')
  ),
  CONSTRAINT vehicle_completed_records_usage_value_valid CHECK (
    usage_reading_value IS NULL OR usage_reading_value >= 0
  ),
  CONSTRAINT vehicle_completed_records_none_has_no_reading CHECK (
    usage_reading_unit <> 'none' OR usage_reading_value IS NULL
  ),
  CONSTRAINT vehicle_completed_records_mechanic_length CHECK (
    mechanic IS NULL OR char_length(mechanic) <= 160
  ),
  CONSTRAINT vehicle_completed_records_description_valid CHECK (
    service_description = btrim(service_description)
    AND service_description ~ '[^[:space:]]'
    AND char_length(service_description) <= 10000
  ),
  CONSTRAINT vehicle_completed_records_version_positive CHECK (version > 0),
  CONSTRAINT vehicle_completed_records_owner_id_key UNIQUE (owner_id, id),
  CONSTRAINT vehicle_completed_records_owner_asset_date_key UNIQUE (owner_id, asset_id, service_date),
  CONSTRAINT vehicle_completed_records_asset_owner_fkey
    FOREIGN KEY (owner_id, asset_id)
    REFERENCES public.vehicles_assets(owner_id, id)
    ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE TABLE public.vehicle_maintenance_intervals (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL,
  maintenance_item_id uuid NOT NULL,
  interval_value numeric(12,2) NOT NULL,
  interval_unit text NOT NULL,
  comments text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT vehicle_maintenance_intervals_unit_valid CHECK (
    interval_unit IN ('miles', 'hours', 'months')
  ),
  CONSTRAINT vehicle_maintenance_intervals_value_valid CHECK (
    interval_value > 0
    AND (interval_unit <> 'months' OR interval_value = trunc(interval_value))
  ),
  CONSTRAINT vehicle_maintenance_intervals_comments_length CHECK (
    comments IS NULL OR char_length(comments) <= 2000
  ),
  CONSTRAINT vehicle_maintenance_intervals_version_positive CHECK (version > 0),
  CONSTRAINT vehicle_maintenance_intervals_owner_id_key UNIQUE (owner_id, id),
  CONSTRAINT vehicle_maintenance_intervals_owner_asset_item_key
    UNIQUE (owner_id, asset_id, maintenance_item_id),
  CONSTRAINT vehicle_maintenance_intervals_asset_owner_fkey
    FOREIGN KEY (owner_id, asset_id)
    REFERENCES public.vehicles_assets(owner_id, id)
    ON UPDATE RESTRICT ON DELETE CASCADE,
  CONSTRAINT vehicle_maintenance_intervals_item_owner_fkey
    FOREIGN KEY (owner_id, maintenance_item_id)
    REFERENCES public.maintenance_items(owner_id, id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE public.vehicle_key_information (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL,
  document jsonb NOT NULL DEFAULT '{"schemaVersion":1,"blocks":[]}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT vehicle_key_information_document_valid CHECK (
    jsonb_typeof(document) = 'object'
    AND document->'schemaVersion' IS NOT DISTINCT FROM '1'::jsonb
    AND jsonb_typeof(document->'blocks') IS NOT DISTINCT FROM 'array'
  ),
  CONSTRAINT vehicle_key_information_version_positive CHECK (version > 0),
  CONSTRAINT vehicle_key_information_owner_id_key UNIQUE (owner_id, id),
  CONSTRAINT vehicle_key_information_owner_asset_key UNIQUE (owner_id, asset_id),
  CONSTRAINT vehicle_key_information_asset_owner_fkey
    FOREIGN KEY (owner_id, asset_id)
    REFERENCES public.vehicles_assets(owner_id, id)
    ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE TABLE public.vehicle_links (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL,
  url text NOT NULL,
  display_title text,
  sort_order integer NOT NULL DEFAULT 0,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT vehicle_links_url_valid CHECK (
    url = btrim(url)
    AND url ~* '^https://[^[:space:]/?#]+([/?#].*)?$'
    AND url !~ '[[:cntrl:]]'
    AND char_length(url) <= 2048
  ),
  CONSTRAINT vehicle_links_title_length CHECK (
    display_title IS NULL OR char_length(display_title) <= 300
  ),
  CONSTRAINT vehicle_links_sort_order_nonnegative CHECK (sort_order >= 0),
  CONSTRAINT vehicle_links_version_positive CHECK (version > 0),
  CONSTRAINT vehicle_links_owner_id_key UNIQUE (owner_id, id),
  CONSTRAINT vehicle_links_asset_owner_fkey
    FOREIGN KEY (owner_id, asset_id)
    REFERENCES public.vehicles_assets(owner_id, id)
    ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE INDEX vehicle_links_owner_asset_order_idx
  ON public.vehicle_links (owner_id, asset_id, sort_order, id);

CREATE TABLE public.vehicles_save_requests (
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  payload_hash text NOT NULL,
  result jsonb NOT NULL,
  committed_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT vehicles_save_requests_pkey PRIMARY KEY (owner_id, request_id),
  CONSTRAINT vehicles_save_requests_payload_hash_valid CHECK (
    payload_hash = btrim(payload_hash) AND payload_hash ~ '[^[:space:]]'
  ),
  CONSTRAINT vehicles_save_requests_result_object CHECK (jsonb_typeof(result) = 'object')
);

CREATE TRIGGER vehicles_assets_updated_at
  BEFORE UPDATE ON public.vehicles_assets
  FOR EACH ROW EXECUTE FUNCTION public.vehicles_set_updated_at();

CREATE TRIGGER vehicles_maintenance_items_updated_at
  BEFORE UPDATE ON public.maintenance_items
  FOR EACH ROW EXECUTE FUNCTION public.vehicles_set_updated_at();

CREATE TRIGGER vehicle_ongoing_records_updated_at
  BEFORE UPDATE ON public.vehicle_ongoing_records
  FOR EACH ROW EXECUTE FUNCTION public.vehicles_set_updated_at();

CREATE TRIGGER vehicle_recommended_records_updated_at
  BEFORE UPDATE ON public.vehicle_recommended_records
  FOR EACH ROW EXECUTE FUNCTION public.vehicles_set_updated_at();

CREATE TRIGGER vehicle_completed_records_updated_at
  BEFORE UPDATE ON public.vehicle_completed_records
  FOR EACH ROW EXECUTE FUNCTION public.vehicles_set_updated_at();

CREATE TRIGGER vehicle_maintenance_intervals_updated_at
  BEFORE UPDATE ON public.vehicle_maintenance_intervals
  FOR EACH ROW EXECUTE FUNCTION public.vehicles_set_updated_at();

CREATE TRIGGER vehicle_key_information_updated_at
  BEFORE UPDATE ON public.vehicle_key_information
  FOR EACH ROW EXECUTE FUNCTION public.vehicles_set_updated_at();

CREATE TRIGGER vehicle_links_updated_at
  BEFORE UPDATE ON public.vehicle_links
  FOR EACH ROW EXECUTE FUNCTION public.vehicles_set_updated_at();

ALTER TABLE public.vehicles_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_maintenance_item_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_ongoing_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_ongoing_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_recommended_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_completed_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_maintenance_intervals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_key_information ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles_save_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY vehicles_assets_owner_select ON public.vehicles_assets
  FOR SELECT TO authenticated USING (owner_id = (SELECT auth.uid()));
CREATE POLICY vehicles_assets_owner_insert ON public.vehicles_assets
  FOR INSERT TO authenticated WITH CHECK (owner_id = (SELECT auth.uid()));
CREATE POLICY vehicles_assets_owner_update ON public.vehicles_assets
  FOR UPDATE TO authenticated USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));
CREATE POLICY vehicles_assets_owner_delete ON public.vehicles_assets
  FOR DELETE TO authenticated USING (owner_id = (SELECT auth.uid()));

CREATE POLICY maintenance_items_owner_select ON public.maintenance_items
  FOR SELECT TO authenticated USING (owner_id = (SELECT auth.uid()));
CREATE POLICY maintenance_items_owner_insert ON public.maintenance_items
  FOR INSERT TO authenticated WITH CHECK (owner_id = (SELECT auth.uid()));
CREATE POLICY maintenance_items_owner_update ON public.maintenance_items
  FOR UPDATE TO authenticated USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));
CREATE POLICY maintenance_items_owner_delete ON public.maintenance_items
  FOR DELETE TO authenticated USING (owner_id = (SELECT auth.uid()));

CREATE POLICY vehicle_maintenance_item_assets_owner_select ON public.vehicle_maintenance_item_assets
  FOR SELECT TO authenticated USING (owner_id = (SELECT auth.uid()));
CREATE POLICY vehicle_maintenance_item_assets_owner_insert ON public.vehicle_maintenance_item_assets
  FOR INSERT TO authenticated WITH CHECK (owner_id = (SELECT auth.uid()));
CREATE POLICY vehicle_maintenance_item_assets_owner_update ON public.vehicle_maintenance_item_assets
  FOR UPDATE TO authenticated USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));
CREATE POLICY vehicle_maintenance_item_assets_owner_delete ON public.vehicle_maintenance_item_assets
  FOR DELETE TO authenticated USING (owner_id = (SELECT auth.uid()));

CREATE POLICY vehicle_ongoing_records_owner_select ON public.vehicle_ongoing_records
  FOR SELECT TO authenticated USING (owner_id = (SELECT auth.uid()));
CREATE POLICY vehicle_ongoing_records_owner_insert ON public.vehicle_ongoing_records
  FOR INSERT TO authenticated WITH CHECK (owner_id = (SELECT auth.uid()));
CREATE POLICY vehicle_ongoing_records_owner_update ON public.vehicle_ongoing_records
  FOR UPDATE TO authenticated USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));
CREATE POLICY vehicle_ongoing_records_owner_delete ON public.vehicle_ongoing_records
  FOR DELETE TO authenticated USING (owner_id = (SELECT auth.uid()));

CREATE POLICY vehicle_ongoing_items_owner_select ON public.vehicle_ongoing_items
  FOR SELECT TO authenticated USING (owner_id = (SELECT auth.uid()));
CREATE POLICY vehicle_ongoing_items_owner_insert ON public.vehicle_ongoing_items
  FOR INSERT TO authenticated WITH CHECK (owner_id = (SELECT auth.uid()));
CREATE POLICY vehicle_ongoing_items_owner_update ON public.vehicle_ongoing_items
  FOR UPDATE TO authenticated USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));
CREATE POLICY vehicle_ongoing_items_owner_delete ON public.vehicle_ongoing_items
  FOR DELETE TO authenticated USING (owner_id = (SELECT auth.uid()));

CREATE POLICY vehicle_recommended_records_owner_select ON public.vehicle_recommended_records
  FOR SELECT TO authenticated USING (owner_id = (SELECT auth.uid()));
CREATE POLICY vehicle_recommended_records_owner_insert ON public.vehicle_recommended_records
  FOR INSERT TO authenticated WITH CHECK (owner_id = (SELECT auth.uid()));
CREATE POLICY vehicle_recommended_records_owner_update ON public.vehicle_recommended_records
  FOR UPDATE TO authenticated USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));
CREATE POLICY vehicle_recommended_records_owner_delete ON public.vehicle_recommended_records
  FOR DELETE TO authenticated USING (owner_id = (SELECT auth.uid()));

CREATE POLICY vehicle_completed_records_owner_select ON public.vehicle_completed_records
  FOR SELECT TO authenticated USING (owner_id = (SELECT auth.uid()));
CREATE POLICY vehicle_completed_records_owner_insert ON public.vehicle_completed_records
  FOR INSERT TO authenticated WITH CHECK (owner_id = (SELECT auth.uid()));
CREATE POLICY vehicle_completed_records_owner_update ON public.vehicle_completed_records
  FOR UPDATE TO authenticated USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));
CREATE POLICY vehicle_completed_records_owner_delete ON public.vehicle_completed_records
  FOR DELETE TO authenticated USING (owner_id = (SELECT auth.uid()));

CREATE POLICY vehicle_maintenance_intervals_owner_select ON public.vehicle_maintenance_intervals
  FOR SELECT TO authenticated USING (owner_id = (SELECT auth.uid()));
CREATE POLICY vehicle_maintenance_intervals_owner_insert ON public.vehicle_maintenance_intervals
  FOR INSERT TO authenticated WITH CHECK (owner_id = (SELECT auth.uid()));
CREATE POLICY vehicle_maintenance_intervals_owner_update ON public.vehicle_maintenance_intervals
  FOR UPDATE TO authenticated USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));
CREATE POLICY vehicle_maintenance_intervals_owner_delete ON public.vehicle_maintenance_intervals
  FOR DELETE TO authenticated USING (owner_id = (SELECT auth.uid()));

CREATE POLICY vehicle_key_information_owner_select ON public.vehicle_key_information
  FOR SELECT TO authenticated USING (owner_id = (SELECT auth.uid()));
CREATE POLICY vehicle_key_information_owner_insert ON public.vehicle_key_information
  FOR INSERT TO authenticated WITH CHECK (owner_id = (SELECT auth.uid()));
CREATE POLICY vehicle_key_information_owner_update ON public.vehicle_key_information
  FOR UPDATE TO authenticated USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));
CREATE POLICY vehicle_key_information_owner_delete ON public.vehicle_key_information
  FOR DELETE TO authenticated USING (owner_id = (SELECT auth.uid()));

CREATE POLICY vehicle_links_owner_select ON public.vehicle_links
  FOR SELECT TO authenticated USING (owner_id = (SELECT auth.uid()));
CREATE POLICY vehicle_links_owner_insert ON public.vehicle_links
  FOR INSERT TO authenticated WITH CHECK (owner_id = (SELECT auth.uid()));
CREATE POLICY vehicle_links_owner_update ON public.vehicle_links
  FOR UPDATE TO authenticated USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));
CREATE POLICY vehicle_links_owner_delete ON public.vehicle_links
  FOR DELETE TO authenticated USING (owner_id = (SELECT auth.uid()));

REVOKE ALL PRIVILEGES ON TABLE
  public.vehicles_assets,
  public.maintenance_items,
  public.vehicle_maintenance_item_assets,
  public.vehicle_ongoing_records,
  public.vehicle_ongoing_items,
  public.vehicle_recommended_records,
  public.vehicle_completed_records,
  public.vehicle_maintenance_intervals,
  public.vehicle_key_information,
  public.vehicle_links,
  public.vehicles_save_requests
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE
  public.vehicles_assets,
  public.maintenance_items,
  public.vehicle_maintenance_item_assets,
  public.vehicle_ongoing_records,
  public.vehicle_ongoing_items,
  public.vehicle_recommended_records,
  public.vehicle_completed_records,
  public.vehicle_maintenance_intervals,
  public.vehicle_key_information,
  public.vehicle_links
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.vehicles_assets,
  public.maintenance_items,
  public.vehicle_maintenance_item_assets,
  public.vehicle_ongoing_records,
  public.vehicle_ongoing_items,
  public.vehicle_recommended_records,
  public.vehicle_completed_records,
  public.vehicle_maintenance_intervals,
  public.vehicle_key_information,
  public.vehicle_links
TO service_role;

GRANT SELECT, INSERT ON TABLE public.vehicles_save_requests TO service_role;

COMMENT ON TABLE public.vehicles_save_requests IS
  'Immutable idempotency receipts for Phase 4B; no client policy or direct client grant.';
COMMENT ON TABLE public.vehicle_key_information IS
  'Nested block validation, prohibition on arbitrary HTML, and the 50,000-character extracted-text limit are DEFERRED TO PHASE 4B.';
COMMENT ON TABLE public.vehicles_assets IS
  'version is the aggregate Vehicles workspace revision; increment behavior is DEFERRED TO PHASE 4B.';
COMMENT ON TABLE public.maintenance_items IS
  'all_assets availability applies automatically to existing and future owner assets; current and selected availability use explicit asset identities.';

-- Reverse isolated cleanup order: receipts, links, key information, intervals,
-- completed history, recommended history, ongoing snapshots, ongoing records,
-- selected associations, catalog, assets, then the shared updated-at function.

COMMIT;
