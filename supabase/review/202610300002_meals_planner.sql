-- LOCAL CANDIDATE ONLY. Production execution requires exact authorization.
-- Confirm project home-maintenance-app / tawvchmjtkgykwwvnnnn separately.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $gate$
DECLARE approved_for_execution boolean := false;
BEGIN
  IF NOT approved_for_execution THEN
    RAISE EXCEPTION 'Meal Planner migration disabled: exact production authorization required.';
  END IF;
  IF current_user <> 'postgres'
    OR to_regprocedure('auth.uid()') IS NULL
    OR to_regprocedure('pg_catalog.gen_random_uuid()') IS NULL
    OR (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')) <> 3
    OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('anon','authenticated') AND (rolsuper OR rolbypassrls))
    OR EXISTS (SELECT 1 FROM pg_roles b CROSS JOIN pg_roles r
      WHERE b.rolname IN ('anon','authenticated') AND b.oid <> r.oid AND pg_has_role(b.oid,r.oid,'MEMBER'))
    OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id='e72bccd9-ec2b-4822-bb5c-b7c1f39dcf60'
      AND NOT is_anonymous AND email_confirmed_at IS NOT NULL AND NOT coalesce(banned_until > now(),false))
    OR NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname='meals_recipes' AND c.relkind='r'
        AND pg_get_userbyid(c.relowner)='postgres' AND c.relrowsecurity) THEN
    RAISE EXCEPTION 'Meal Planner migration prerequisites failed.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname LIKE 'meals\_planner\_%' ESCAPE '\')
    OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname LIKE 'meals\_planner\_%' ESCAPE '\')
    OR EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
      WHERE n.nspname='public' AND t.typname ~ '^_?meals_planner_')
    OR EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND t.tgname LIKE 'meals\_planner\_%' ESCAPE '\')
    OR EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
      WHERE n.nspname='public' AND c.conname LIKE 'meals\_planner\_%' ESCAPE '\') THEN
    RAISE EXCEPTION 'Meal Planner namespace collision: stop; do not reapply.';
  END IF;
END
$gate$;

CREATE TABLE public.meals_planner_entries (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  meal_date date NOT NULL CHECK (meal_date BETWEEN DATE '0001-01-01' AND DATE '9999-12-31'),
  meal_type text NOT NULL CHECK (meal_type IN ('breakfast','lunch','dinner')),
  recipe_id uuid REFERENCES public.meals_recipes(id) ON UPDATE RESTRICT ON DELETE SET NULL,
  display_text text NOT NULL DEFAULT '' CHECK (
    btrim(display_text,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') <> ''),
  insertion_order bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE INDEX meals_planner_entries_week_idx
  ON public.meals_planner_entries(meal_date,meal_type,insertion_order);
CREATE INDEX meals_planner_entries_recipe_id_idx ON public.meals_planner_entries(recipe_id);

CREATE FUNCTION public.meals_planner_before_write()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $function$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.insertion_order IS DISTINCT FROM OLD.insertion_order THEN
      RAISE EXCEPTION 'Meal entry identity and insertion order cannot change.' USING ERRCODE='22023';
    END IF;
    NEW.created_at := OLD.created_at;
  ELSE
    NEW.created_at := statement_timestamp();
  END IF;
  NEW.updated_at := statement_timestamp();
  IF NEW.recipe_id IS NOT NULL THEN
    -- Lock the parent so concurrent deletion cannot strand a stale title snapshot.
    SELECT r.title INTO STRICT NEW.display_text FROM public.meals_recipes r
      WHERE r.id=NEW.recipe_id FOR KEY SHARE;
  END IF;
  RETURN NEW;
END
$function$;

CREATE FUNCTION public.meals_planner_preserve_recipe()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $function$
BEGIN
  -- Capture the current title before the FK detaches the surviving occurrences.
  UPDATE public.meals_planner_entries SET display_text=OLD.title WHERE recipe_id=OLD.id;
  RETURN OLD;
END
$function$;

ALTER TABLE public.meals_planner_entries OWNER TO postgres;
ALTER SEQUENCE public.meals_planner_entries_insertion_order_seq OWNER TO postgres;
ALTER FUNCTION public.meals_planner_before_write() OWNER TO postgres;
ALTER FUNCTION public.meals_planner_preserve_recipe() OWNER TO postgres;
REVOKE ALL ON TABLE public.meals_planner_entries FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON SEQUENCE public.meals_planner_entries_insertion_order_seq FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.meals_planner_before_write() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.meals_planner_preserve_recipe() FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,DELETE ON public.meals_planner_entries TO authenticated;
GRANT INSERT(id,meal_date,meal_type,recipe_id,display_text), UPDATE(display_text)
  ON public.meals_planner_entries TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.meals_planner_entries TO service_role;

ALTER TABLE public.meals_planner_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY meals_planner_entries_owner_select ON public.meals_planner_entries FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = 'e72bccd9-ec2b-4822-bb5c-b7c1f39dcf60'::uuid);
CREATE POLICY meals_planner_entries_owner_insert ON public.meals_planner_entries FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = 'e72bccd9-ec2b-4822-bb5c-b7c1f39dcf60'::uuid);
CREATE POLICY meals_planner_entries_owner_update ON public.meals_planner_entries FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = 'e72bccd9-ec2b-4822-bb5c-b7c1f39dcf60'::uuid)
  WITH CHECK ((SELECT auth.uid()) = 'e72bccd9-ec2b-4822-bb5c-b7c1f39dcf60'::uuid);
CREATE POLICY meals_planner_entries_owner_delete ON public.meals_planner_entries FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = 'e72bccd9-ec2b-4822-bb5c-b7c1f39dcf60'::uuid);
CREATE TRIGGER meals_planner_before_write BEFORE INSERT OR UPDATE ON public.meals_planner_entries
  FOR EACH ROW EXECUTE FUNCTION public.meals_planner_before_write();
CREATE TRIGGER meals_planner_preserve_recipe BEFORE DELETE ON public.meals_recipes
  FOR EACH ROW EXECUTE FUNCTION public.meals_planner_preserve_recipe();
COMMIT;
