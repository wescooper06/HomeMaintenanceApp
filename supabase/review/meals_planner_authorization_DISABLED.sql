-- ROLLBACK-CONTROLLED FIXTURE. Explicit authorization required; keep guard false.
-- Confirm project home-maintenance-app / tawvchmjtkgykwwvnnnn separately.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $gate$
DECLARE approved_for_fixture boolean := false;
BEGIN
  IF NOT approved_for_fixture THEN RAISE EXCEPTION 'Meal Planner fixture disabled.'; END IF;
  IF current_user <> 'postgres'
    OR EXISTS (SELECT 1 FROM public.meals_planner_entries)
    OR EXISTS (SELECT 1 FROM public.meals_recipes WHERE id='a3db0001-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'Meal Planner fixture prerequisite/collision: stop.';
  END IF;
END
$gate$;
SELECT set_config('request.jwt.claim.sub','e72bccd9-ec2b-4822-bb5c-b7c1f39dcf60',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.meals_recipes(id,title) VALUES('a3db0001-0000-4000-8000-000000000001','Planner authorization fixture');
INSERT INTO public.meals_planner_entries(id,meal_date,meal_type,recipe_id)
VALUES('a3db0001-0000-4000-8000-000000000002','2000-02-29','breakfast','a3db0001-0000-4000-8000-000000000001'),
      ('a3db0001-0000-4000-8000-000000000003','2000-02-29','breakfast','a3db0001-0000-4000-8000-000000000001');
INSERT INTO public.meals_planner_entries(id,meal_date,meal_type,display_text)
VALUES('a3db0001-0000-4000-8000-000000000004','2099-12-31','dinner','Free-text fixture');
DO $owner$
BEGIN
  IF (SELECT count(*) FROM public.meals_planner_entries) <> 3
    OR (SELECT count(DISTINCT insertion_order) FROM public.meals_planner_entries) <> 3 THEN
    RAISE EXCEPTION 'Owner create/read/duplicate-order test failed.';
  END IF;
  UPDATE public.meals_planner_entries SET display_text='Edited fixture'
    WHERE id='a3db0001-0000-4000-8000-000000000004';
  IF NOT FOUND THEN RAISE EXCEPTION 'Owner update failed.'; END IF;
END
$owner$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $anon$
BEGIN
  BEGIN
    PERFORM * FROM public.meals_planner_entries;
    RAISE EXCEPTION 'Anonymous read unexpectedly succeeded.';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.meals_planner_entries(meal_date,meal_type,display_text)
      VALUES('2026-10-30','lunch','Denied');
    RAISE EXCEPTION 'Anonymous insert unexpectedly succeeded.';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.meals_planner_entries SET display_text='Denied';
    RAISE EXCEPTION 'Anonymous update unexpectedly succeeded.';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    DELETE FROM public.meals_planner_entries;
    RAISE EXCEPTION 'Anonymous delete unexpectedly succeeded.';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END
$anon$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $denied$
DECLARE subject text;
BEGIN
  FOREACH subject IN ARRAY ARRAY['22222222-2222-4222-8222-222222222222',''] LOOP
    PERFORM set_config('request.jwt.claim.sub',subject,true);
    IF EXISTS (SELECT 1 FROM public.meals_planner_entries) THEN RAISE EXCEPTION 'Denied identity read succeeded.'; END IF;
    BEGIN
      INSERT INTO public.meals_planner_entries(meal_date,meal_type,display_text)
        VALUES('2026-10-30','lunch','Denied');
      RAISE EXCEPTION 'Denied identity insert succeeded.';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    UPDATE public.meals_planner_entries SET display_text='Denied';
    IF FOUND THEN RAISE EXCEPTION 'Denied identity update succeeded.'; END IF;
    DELETE FROM public.meals_planner_entries;
    IF FOUND THEN RAISE EXCEPTION 'Denied identity delete succeeded.'; END IF;
  END LOOP;
  PERFORM set_config('request.jwt.claim.sub','malformed',true);
  BEGIN
    PERFORM * FROM public.meals_planner_entries;
    RAISE EXCEPTION 'Malformed subject read succeeded.';
  EXCEPTION WHEN invalid_text_representation THEN NULL; END;
  BEGIN
    INSERT INTO public.meals_planner_entries(meal_date,meal_type,display_text)
      VALUES('2026-10-30','lunch','Denied');
    RAISE EXCEPTION 'Malformed subject insert succeeded.';
  EXCEPTION WHEN invalid_text_representation THEN NULL; END;
  BEGIN
    UPDATE public.meals_planner_entries SET display_text='Denied';
    RAISE EXCEPTION 'Malformed subject update succeeded.';
  EXCEPTION WHEN invalid_text_representation THEN NULL; END;
  BEGIN
    DELETE FROM public.meals_planner_entries;
    RAISE EXCEPTION 'Malformed subject delete succeeded.';
  EXCEPTION WHEN invalid_text_representation THEN NULL; END;
  PERFORM set_config('request.jwt.claim.sub','e72bccd9-ec2b-4822-bb5c-b7c1f39dcf60',true);
END
$denied$;
UPDATE public.meals_recipes SET title='Renamed fixture'
  WHERE id='a3db0001-0000-4000-8000-000000000001';
DELETE FROM public.meals_recipes WHERE id='a3db0001-0000-4000-8000-000000000001';
DO $preserved$
BEGIN
  IF (SELECT count(*) FROM public.meals_planner_entries
      WHERE recipe_id IS NULL AND display_text='Renamed fixture') <> 2 THEN
    RAISE EXCEPTION 'Recipe deletion did not preserve current title as free text.';
  END IF;
  UPDATE public.meals_planner_entries SET display_text='Edited preserved fixture'
    WHERE id='a3db0001-0000-4000-8000-000000000002';
  IF NOT FOUND THEN RAISE EXCEPTION 'Preserved meal not editable.'; END IF;
  DELETE FROM public.meals_planner_entries;
  IF EXISTS (SELECT 1 FROM public.meals_planner_entries) THEN RAISE EXCEPTION 'Owner remove failed.'; END IF;
END
$preserved$;
RESET ROLE;
SELECT 'PASS - ROLLBACK follows'::text AS fixture_result;
ROLLBACK;
