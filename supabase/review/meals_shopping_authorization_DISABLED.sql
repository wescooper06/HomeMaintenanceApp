-- FUTURE PRODUCTION FIXTURE WRITES: separate explicit authorization required.
-- Tests deployed SQL role/RLS behavior, NOT JWT signatures or PostgREST routing.
-- Never create Auth users. Never run after owner Shopping use begins.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $verify$
DECLARE
  approved_for_fixture_verification boolean := false;
  owner_subject constant text := 'e72bccd9-ec2b-4822-bb5c-b7c1f39dcf60';
  fixture_category_id constant uuid := 'b46b15b8-3343-4f76-a800-000000000001';
  item_id constant uuid := 'b46b15b8-3343-4f76-a800-000000000002';
  transient_category constant uuid := 'b46b15b8-3343-4f76-a800-000000000003';
  transient_item constant uuid := 'b46b15b8-3343-4f76-a800-000000000004';
  prefix constant text := '__shopping_wave1_verify_b46b15b8__';
  role_name text;
  subject text;
  object_name text;
  value_column text;
  probe_id uuid;
  retained_id uuid;
  operation text;
  query text;
  affected bigint;
  visible bigint;
  uid uuid;
BEGIN
  IF NOT approved_for_fixture_verification THEN
    RAISE EXCEPTION 'Shopping fixture verification disabled: separate authorization required.';
  END IF;
  IF current_user<>'postgres' OR session_user<>'postgres'
    OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('anon','authenticated') AND (rolsuper OR rolbypassrls))
    OR (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon','authenticated'))<>2
    OR EXISTS(SELECT 1 FROM pg_roles b CROSS JOIN pg_roles r
      WHERE b.rolname IN ('anon','authenticated') AND b.oid<>r.oid AND pg_has_role(b.oid,r.oid,'MEMBER')) THEN
    RAISE EXCEPTION 'Unexpected executor or browser role security properties.';
  END IF;
  -- Prevent a concurrent browser write from entering this fresh-install fixture window.
  LOCK TABLE public.meals_shopping_categories,public.meals_shopping_items IN SHARE ROW EXCLUSIVE MODE;
  IF EXISTS(SELECT 1 FROM public.meals_shopping_items)
    OR EXISTS(SELECT 1 FROM public.meals_shopping_categories WHERE predefined_order IS NULL)
    OR (SELECT count(*) FROM public.meals_shopping_categories)<>28
    OR EXISTS(SELECT 1 FROM public.meals_shopping_categories
      WHERE id IN (fixture_category_id,transient_category) OR starts_with(name,prefix)) THEN
    RAISE EXCEPTION 'Fresh-install/fixture collision gate failed; do not touch owner data.';
  END IF;
  PERFORM set_config('request.jwt.claim.sub',owner_subject,true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_subject,'role','authenticated')::text,true);
  PERFORM set_config('role','authenticated',true);
  IF current_user<>'authenticated' OR auth.uid() IS DISTINCT FROM owner_subject::uuid THEN
    RAISE EXCEPTION 'Owner SQL authorization context not established.';
  END IF;
  IF (SELECT count(*) FROM public.meals_shopping_categories)<>28
    OR EXISTS(SELECT 1 FROM public.meals_shopping_items) THEN
    RAISE EXCEPTION 'Owner read assertion failed.';
  END IF;
  INSERT INTO public.meals_shopping_categories(id,name) VALUES
    (fixture_category_id,prefix||'category'),(transient_category,prefix||'transient_category');
  INSERT INTO public.meals_shopping_items(id,text,category_id,checked) VALUES
    (item_id,prefix||'item',fixture_category_id,false),
    (transient_item,prefix||'transient_item',transient_category,false);
  UPDATE public.meals_shopping_categories SET name=prefix||'category_updated' WHERE id=fixture_category_id;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>1 THEN RAISE EXCEPTION 'Owner category update assertion failed.'; END IF;
  UPDATE public.meals_shopping_items SET text=prefix||'item_updated',checked=true WHERE id=item_id;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>1 THEN RAISE EXCEPTION 'Owner item update assertion failed.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.meals_shopping_items
      WHERE id=item_id AND text=prefix||'item_updated' AND checked AND category_id=fixture_category_id)
    OR NOT EXISTS(SELECT 1 FROM public.meals_shopping_categories WHERE id=fixture_category_id AND name=prefix||'category_updated') THEN
    RAISE EXCEPTION 'Owner fixture readback assertion failed.';
  END IF;
  DELETE FROM public.meals_shopping_items WHERE id=transient_item;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>1 THEN RAISE EXCEPTION 'Owner item delete assertion failed.'; END IF;
  DELETE FROM public.meals_shopping_categories WHERE id=transient_category;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>1 THEN RAISE EXCEPTION 'Owner category delete assertion failed.'; END IF;

  FOR role_name,subject IN SELECT * FROM (VALUES
    ('anon',owner_subject),
    ('authenticated','22222222-2222-4222-8222-222222222222'),
    ('authenticated',NULL::text),
    ('authenticated','not-a-valid-uuid')
  ) contexts(role_name,subject) LOOP
    PERFORM set_config('role','none',true);
    PERFORM set_config('request.jwt.claim.sub',coalesce(subject,''),true);
    PERFORM set_config('request.jwt.claim.role',role_name,true);
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',subject,'role',role_name)::text,true);
    PERFORM set_config('role',role_name,true);
    IF current_user<>role_name THEN RAISE EXCEPTION 'Role switch failed.'; END IF;
    BEGIN
      uid := auth.uid();
      IF subject='not-a-valid-uuid' THEN
        IF uid IS NOT NULL THEN RAISE EXCEPTION 'Invalid subject resolved to a UUID.'; END IF;
      ELSIF uid IS DISTINCT FROM subject::uuid THEN
        RAISE EXCEPTION 'Subject context not established.';
      END IF;
    EXCEPTION WHEN invalid_text_representation THEN
      IF subject IS DISTINCT FROM 'not-a-valid-uuid' THEN RAISE; END IF;
    END;
    FOR object_name,value_column,probe_id,retained_id IN SELECT * FROM (VALUES
      ('meals_shopping_categories','name',transient_category,fixture_category_id),
      ('meals_shopping_items','text',transient_item,item_id)
    ) objects(object_name,value_column,probe_id,retained_id) LOOP
      FOREACH operation IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
        query := CASE operation
          WHEN 'SELECT' THEN format('SELECT count(*) FROM public.%I',object_name)
          WHEN 'INSERT' THEN format('INSERT INTO public.%I(id,%I) VALUES (%L,%L)',
            object_name,value_column,probe_id,prefix||'denied_probe')
          WHEN 'UPDATE' THEN format('UPDATE public.%I SET %I=%L WHERE id=%L',
            object_name,value_column,prefix||'forbidden_change',retained_id)
          WHEN 'DELETE' THEN format('DELETE FROM public.%I WHERE id=%L',object_name,retained_id)
        END;
        BEGIN
          IF operation='SELECT' THEN
            EXECUTE query INTO visible;
            IF visible<>0 THEN RAISE EXCEPTION 'Unauthorized rows visible to % / %.',role_name,subject; END IF;
          ELSE
            EXECUTE query;
            GET DIAGNOSTICS affected=ROW_COUNT;
            IF operation='INSERT' OR affected<>0 THEN
              RAISE EXCEPTION 'Unauthorized % succeeded for % / %.',operation,role_name,subject;
            END IF;
          END IF;
          IF role_name='anon' THEN RAISE EXCEPTION 'Anon unexpectedly has table privileges.'; END IF;
        EXCEPTION
          WHEN insufficient_privilege THEN
            IF role_name<>'anon' AND operation<>'INSERT' THEN RAISE; END IF;
          WHEN invalid_text_representation THEN
            IF subject IS DISTINCT FROM 'not-a-valid-uuid' OR role_name='anon' THEN RAISE; END IF;
        END;
      END LOOP;
    END LOOP;
    BEGIN
      PERFORM public.meals_shopping_before_write();
      RAISE EXCEPTION 'Internal trigger function unexpectedly executable.';
    EXCEPTION WHEN insufficient_privilege THEN
      NULL;
    END;
  END LOOP;
  PERFORM set_config('role','none',true);
  IF current_user<>'postgres'
    OR (SELECT count(*) FROM public.meals_shopping_items)<>1
    OR (SELECT count(*) FROM public.meals_shopping_categories)<>29
    OR NOT EXISTS(SELECT 1 FROM public.meals_shopping_items WHERE id=item_id AND text=prefix||'item_updated' AND checked)
    OR NOT EXISTS(SELECT 1 FROM public.meals_shopping_categories WHERE id=fixture_category_id AND name=prefix||'category_updated') THEN
    RAISE EXCEPTION 'Fixture changed during denial checks.';
  END IF;
END
$verify$;
SELECT jsonb_build_object(
  'owner_crud',true,'anonymous_denied',true,'nonowner_denied',true,
  'null_subject_denied',true,'invalid_subject_denied',true,'internal_execute_denied',true,
  'scope','SQL roles and deployed auth.uid()/RLS, not HTTP/JWT validation',
  'rollback_still_required',true
) AS authorization;
ROLLBACK;
