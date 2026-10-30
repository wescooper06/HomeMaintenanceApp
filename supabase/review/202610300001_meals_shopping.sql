-- LOCAL CANDIDATE ONLY. Not authorized for production execution.
-- Confirm project home-maintenance-app / tawvchmjtkgykwwvnnnn separately.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $gate$
DECLARE approved_for_execution boolean := false;
BEGIN
  IF NOT approved_for_execution THEN
    RAISE EXCEPTION 'Shopping migration disabled: exact production authorization required.';
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
    OR to_regclass('public.meals_recipes') IS NULL THEN
    RAISE EXCEPTION 'Shopping migration prerequisites failed.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname LIKE 'meals\_shopping\_%' ESCAPE '\')
    OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname LIKE 'meals\_shopping\_%' ESCAPE '\')
    OR EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
      WHERE n.nspname='public' AND t.typname ~ '^_?meals_shopping_') THEN
    RAISE EXCEPTION 'Shopping namespace collision: stop; do not reapply.';
  END IF;
END
$gate$;

CREATE TABLE public.meals_shopping_categories (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  name text NOT NULL CHECK (name <> '' AND name = btrim(name,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')),
  predefined_order smallint UNIQUE CHECK (predefined_order BETWEEN 1 AND 28),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE UNIQUE INDEX meals_shopping_categories_name_key ON public.meals_shopping_categories(lower(name));
INSERT INTO public.meals_shopping_categories(name,predefined_order)
SELECT name, position::smallint FROM unnest(ARRAY[
  'Baking','Beans, Grains & Rice','Beverages & Water','Bread & Bakery',
  'Breakfast & Cereal','Canned Goods','Cheese & Dairy','Cleaning','Coffee',
  'Condiments & Sauces','Cookies, Chips & Snacks','Deli','Frozen Foods',
  'Health','International','Jams','Juices','Meat & Poultry','Nuts',
  'Oil & Vinegar','Produce','Pasta','Pet Food','Seafood','Soup',
  'Special Equipment','Spices','Wine & Spirits'
]) WITH ORDINALITY AS seed(name,position);

CREATE TABLE public.meals_shopping_items (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  text text NOT NULL CHECK (btrim(text,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') <> ''),
  category_id uuid REFERENCES public.meals_shopping_categories(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  checked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE INDEX meals_shopping_items_category_id_idx ON public.meals_shopping_items(category_id);

CREATE FUNCTION public.meals_shopping_before_write()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $function$
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.predefined_order IS NOT NULL THEN
      RAISE EXCEPTION 'Predefined Shopping categories cannot be deleted.' USING ERRCODE='23514';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'Shopping identity cannot change.' USING ERRCODE='22023';
    END IF;
    NEW.created_at := OLD.created_at;
    IF TG_TABLE_NAME='meals_shopping_categories' THEN
      IF OLD.predefined_order IS NOT NULL OR NEW.predefined_order IS DISTINCT FROM OLD.predefined_order THEN
        RAISE EXCEPTION 'Predefined Shopping categories cannot be changed.' USING ERRCODE='23514';
      END IF;
    END IF;
  ELSE
    NEW.created_at := statement_timestamp();
    IF TG_TABLE_NAME='meals_shopping_categories' THEN
      IF NEW.predefined_order IS NOT NULL THEN
        RAISE EXCEPTION 'Only custom Shopping categories can be added.' USING ERRCODE='23514';
      END IF;
    END IF;
  END IF;
  NEW.updated_at := statement_timestamp();
  IF TG_TABLE_NAME='meals_shopping_categories' THEN
    NEW.name := btrim(NEW.name,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
  END IF;
  RETURN NEW;
END
$function$;
ALTER FUNCTION public.meals_shopping_before_write() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.meals_shopping_before_write() FROM PUBLIC,anon,authenticated,service_role;

DO $secure$
DECLARE
  name text;
  predicate constant text := $p$(SELECT auth.uid()) = 'e72bccd9-ec2b-4822-bb5c-b7c1f39dcf60'::uuid$p$;
BEGIN
  FOREACH name IN ARRAY ARRAY['meals_shopping_categories','meals_shopping_items'] LOOP
    EXECUTE format('ALTER TABLE public.%I OWNER TO postgres',name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC,anon,authenticated,service_role',name);
    EXECUTE format('GRANT SELECT,DELETE ON TABLE public.%I TO authenticated',name);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.%I TO service_role',name);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%s)',name||'_owner_select',name,predicate);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)',name||'_owner_insert',name,predicate);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',name||'_owner_update',name,predicate,predicate);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (%s)',name||'_owner_delete',name,predicate);
    EXECUTE format('CREATE TRIGGER meals_shopping_before_write BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.meals_shopping_before_write()',name);
  END LOOP;
END
$secure$;
CREATE TRIGGER meals_shopping_before_delete BEFORE DELETE ON public.meals_shopping_categories
  FOR EACH ROW EXECUTE FUNCTION public.meals_shopping_before_write();
GRANT INSERT(id,name), UPDATE(name) ON public.meals_shopping_categories TO authenticated;
GRANT INSERT(id,text,category_id,checked), UPDATE(text,category_id,checked) ON public.meals_shopping_items TO authenticated;
COMMIT;
