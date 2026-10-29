-- DRAFT ONLY. Not deployed. Enable only the exact separately authorized copy.
-- Confirm Dashboard project home-maintenance-app / tawvchmjtkgykwwvnnnn first.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $gate$
DECLARE
  approved_for_execution boolean := true;
BEGIN
  IF NOT approved_for_execution THEN
    RAISE EXCEPTION 'Meals Recipe migration disabled: exact production authorization required.';
  END IF;
  IF current_user <> 'postgres'
     OR to_regprocedure('auth.uid()') IS NULL
     OR to_regprocedure('pg_catalog.gen_random_uuid()') IS NULL
     OR (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')) <> 3
     OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('anon','authenticated')
                AND (rolsuper OR rolbypassrls))
     OR EXISTS (
       SELECT 1 FROM pg_roles browser CROSS JOIN pg_roles inherited
       WHERE browser.rolname IN ('anon','authenticated') AND browser.oid <> inherited.oid
         AND pg_has_role(browser.oid,inherited.oid,'MEMBER')
     )
     OR NOT EXISTS (
       SELECT 1 FROM auth.users WHERE id='e72bccd9-ec2b-4822-bb5c-b7c1f39dcf60'
         AND NOT is_anonymous AND email_confirmed_at IS NOT NULL
         AND NOT coalesce(banned_until > now(),false)
     ) THEN
    RAISE EXCEPTION 'Meals migration identity, role or built-in prerequisite failed.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname LIKE 'meals\_%' ESCAPE '\'
  ) OR EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname LIKE 'meals\_%' ESCAPE '\'
  ) OR EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='public' AND t.typname ~ '^_?meals_'
  ) OR EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND t.tgname LIKE 'meals\_%' ESCAPE '\'
  ) OR EXISTS (
    SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND p.polname LIKE 'meals\_%' ESCAPE '\'
  ) OR EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
    WHERE n.nspname='public' AND c.conname LIKE 'meals\_%' ESCAPE '\'
  ) THEN
    RAISE EXCEPTION 'Meals namespace collision: stop and review; no automatic reapplication.';
  END IF;
END
$gate$;

CREATE TABLE public.meals_recipe_categories (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  name text NOT NULL CONSTRAINT meals_recipe_categories_name_nonblank CHECK (name <> '')
    CONSTRAINT meals_recipe_categories_name_canonical CHECK (
      name = btrim(name,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE UNIQUE INDEX meals_recipe_categories_name_key
  ON public.meals_recipe_categories (lower(name));

CREATE TABLE public.meals_recipe_cuisines (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  name text NOT NULL CONSTRAINT meals_recipe_cuisines_name_nonblank CHECK (name <> '')
    CONSTRAINT meals_recipe_cuisines_name_canonical CHECK (
      name = btrim(name,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE UNIQUE INDEX meals_recipe_cuisines_name_key
  ON public.meals_recipe_cuisines (lower(name));

CREATE TABLE public.meals_recipes (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  title text NOT NULL CONSTRAINT meals_recipes_title_nonblank CHECK (title ~ '[^[:space:]]'),
  category_id uuid REFERENCES public.meals_recipe_categories(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  cuisine_id uuid REFERENCES public.meals_recipe_cuisines(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  source text NOT NULL DEFAULT '',
  favorite boolean NOT NULL DEFAULT false,
  ingredient_sections jsonb NOT NULL DEFAULT '[{"name":"Ingredients","text":""}]'::jsonb,
  instructions text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE INDEX meals_recipes_category_id_idx ON public.meals_recipes(category_id);
CREATE INDEX meals_recipes_cuisine_id_idx ON public.meals_recipes(cuisine_id);

CREATE FUNCTION public.meals_recipe_before_write()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $function$
DECLARE
  section jsonb;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'Meals record identity cannot change.' USING ERRCODE='22023';
    END IF;
    NEW.created_at := OLD.created_at;
  ELSE
    NEW.created_at := statement_timestamp();
  END IF;
  NEW.updated_at := statement_timestamp();
  IF TG_TABLE_NAME='meals_recipes' THEN
    IF jsonb_typeof(NEW.ingredient_sections) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Ingredient sections must be an array.' USING ERRCODE='23514';
    END IF;
    FOR section IN SELECT value FROM jsonb_array_elements(NEW.ingredient_sections)
    LOOP
      IF jsonb_typeof(section) IS DISTINCT FROM 'object'
         OR jsonb_typeof(section->'name') IS DISTINCT FROM 'string'
         OR jsonb_typeof(section->'text') IS DISTINCT FROM 'string'
         OR (section - 'name' - 'text') <> '{}'::jsonb THEN
        RAISE EXCEPTION 'Each ingredient section must contain only string name and text.'
          USING ERRCODE='23514';
      END IF;
    END LOOP;
  ELSE
    NEW.name := btrim(NEW.name,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
  END IF;
  RETURN NEW;
END
$function$;
ALTER FUNCTION public.meals_recipe_before_write() OWNER TO postgres;
REVOKE ALL PRIVILEGES ON FUNCTION public.meals_recipe_before_write()
  FROM PUBLIC, anon, authenticated, service_role;

DO $secure$
DECLARE
  table_name text;
  predicate constant text := $expression$(SELECT auth.uid()) = 'e72bccd9-ec2b-4822-bb5c-b7c1f39dcf60'::uuid$expression$;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['meals_recipe_categories','meals_recipe_cuisines','meals_recipes']
  LOOP
    EXECUTE format('ALTER TABLE public.%I OWNER TO postgres',table_name);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated, service_role',table_name);
    EXECUTE format('GRANT SELECT, DELETE ON TABLE public.%I TO authenticated',table_name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role',table_name);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%s)',
                   table_name || '_owner_select',table_name,predicate);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (%s)',
                   table_name || '_owner_insert',table_name,predicate);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',
                   table_name || '_owner_update',table_name,predicate,predicate);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (%s)',
                   table_name || '_owner_delete',table_name,predicate);
    EXECUTE format('CREATE TRIGGER meals_recipe_before_write BEFORE INSERT OR UPDATE ON public.%I
                    FOR EACH ROW EXECUTE FUNCTION public.meals_recipe_before_write()',table_name);
  END LOOP;
END
$secure$;

GRANT INSERT (id,name), UPDATE (name) ON public.meals_recipe_categories TO authenticated;
GRANT INSERT (id,name), UPDATE (name) ON public.meals_recipe_cuisines TO authenticated;
GRANT INSERT (id,title,category_id,cuisine_id,source,favorite,ingredient_sections,instructions),
      UPDATE (title,category_id,cuisine_id,source,favorite,ingredient_sections,instructions)
  ON public.meals_recipes TO authenticated;

COMMENT ON COLUMN public.meals_recipes.ingredient_sections IS
  'Ordered array of {name:string,text:string}; array order and text are preserved. Empty array is valid.';
COMMENT ON FUNCTION public.meals_recipe_before_write() IS
  'Internal invoker trigger only: immutable identity, server timestamps, ingredient JSON shape, canonical lookup names. Not a browser RPC.';

DO $assert_acl$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN LATERAL aclexplode(c.relacl) a
    WHERE n.nspname='public'
      AND c.relname IN ('meals_recipes','meals_recipe_categories','meals_recipe_cuisines')
      AND (a.grantee NOT IN ('postgres'::regrole,'authenticated'::regrole,'service_role'::regrole)
           OR a.is_grantable AND a.grantee<>'postgres'::regrole)
  ) OR EXISTS (
    SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
    WHERE p.oid='public.meals_recipe_before_write()'::regprocedure
      AND a.grantee<>'postgres'::regrole
  ) THEN
    RAISE EXCEPTION 'Unexpected inherited object ACL: stop; do not alter managed defaults.';
  END IF;
END
$assert_acl$;
COMMIT;
