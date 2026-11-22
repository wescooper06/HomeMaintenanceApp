-- REVIEW CANDIDATE ONLY. Not deployed. Enable only an exact separately authorized copy.
-- Confirm the Dashboard project is home-maintenance-app / tawvchmjtkgykwwvnnnn first.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $preflight$
DECLARE
  approved_for_execution boolean := false;
  owner_predicate constant text := $owner$((SELECT auth.uid() AS uid) = 'e72bccd9-ec2b-4822-bb5c-b7c1f39dcf60'::uuid)$owner$;
BEGIN
  IF NOT approved_for_execution THEN
    RAISE EXCEPTION 'Recipe Notes and Ideas candidate disabled: exact production authorization required.';
  END IF;

  IF current_user <> 'postgres'
     OR to_regprocedure('auth.uid()') IS NULL
     OR to_regprocedure('pg_catalog.gen_random_uuid()') IS NULL
     OR (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')) <> 3
     OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('anon','authenticated') AND (rolsuper OR rolbypassrls))
     OR EXISTS (
       SELECT 1 FROM pg_roles browser CROSS JOIN pg_roles inherited
       WHERE browser.rolname IN ('anon','authenticated') AND browser.oid <> inherited.oid
         AND pg_has_role(browser.oid,inherited.oid,'MEMBER')
     )
     OR NOT has_schema_privilege('authenticated','public','USAGE')
     OR NOT EXISTS (
       SELECT 1 FROM auth.users
       WHERE id='e72bccd9-ec2b-4822-bb5c-b7c1f39dcf60'
         AND NOT is_anonymous AND email_confirmed_at IS NOT NULL
         AND NOT coalesce(banned_until > now(),false)
     ) THEN
    RAISE EXCEPTION 'Recipe Notes and Ideas identity or role preconditions failed.';
  END IF;

  IF to_regclass('public.meals_recipes') IS NULL
     OR (SELECT relowner FROM pg_class WHERE oid=to_regclass('public.meals_recipes')) <> 'postgres'::regrole
     OR (SELECT relkind FROM pg_class WHERE oid=to_regclass('public.meals_recipes')) <> 'r'
     OR (SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.meals_recipes')) IS DISTINCT FROM true
     OR (SELECT relforcerowsecurity FROM pg_class WHERE oid=to_regclass('public.meals_recipes')) IS DISTINCT FROM false
     OR (SELECT count(*) FROM pg_attribute
         WHERE attrelid=to_regclass('public.meals_recipes') AND attnum>0 AND NOT attisdropped) <> 10 THEN
    RAISE EXCEPTION 'Recipe table inventory or RLS differs from the reviewed baseline.';
  END IF;

  IF EXISTS (
    WITH expected(name,type_name,not_null,default_expression) AS (VALUES
      ('id','uuid',true,'gen_random_uuid()'),
      ('title','text',true,NULL::text),
      ('category_id','uuid',false,NULL::text),
      ('cuisine_id','uuid',false,NULL::text),
      ('source','text',true,NULL::text),
      ('favorite','boolean',true,'false'),
      ('ingredient_sections','jsonb',true,'''[{"name": "Ingredients", "text": ""}]''::jsonb'),
      ('instructions','text',true,NULL::text),
      ('created_at','timestamp with time zone',true,'statement_timestamp()'),
      ('updated_at','timestamp with time zone',true,'statement_timestamp()')
    ), actual AS (
      SELECT a.attname,format_type(a.atttypid,a.atttypmod) AS type_name,a.attnotnull,
        pg_get_expr(d.adbin,d.adrelid) AS default_expression
      FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE a.attrelid=to_regclass('public.meals_recipes') AND a.attnum>0 AND NOT a.attisdropped
    )
    SELECT 1 FROM expected e LEFT JOIN actual a ON a.attname=e.name
    WHERE a.attname IS NULL OR a.type_name IS DISTINCT FROM e.type_name
      OR a.attnotnull IS DISTINCT FROM e.not_null
      OR CASE e.name
          WHEN 'source' THEN a.default_expression IS DISTINCT FROM (quote_literal('') || '::text')
          WHEN 'instructions' THEN a.default_expression IS DISTINCT FROM (quote_literal('') || '::text')
          ELSE a.default_expression IS DISTINCT FROM e.default_expression
        END
  ) THEN
    RAISE EXCEPTION 'Recipe column metadata differs from the reviewed baseline.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policy p
    WHERE p.polrelid=to_regclass('public.meals_recipes')
      AND (p.polroles <> ARRAY['authenticated'::regrole::oid]
        OR regexp_replace(coalesce(pg_get_expr(p.polqual,p.polrelid),''),'\s','','g')
             IS DISTINCT FROM CASE p.polcmd
               WHEN 'a' THEN ''
               ELSE regexp_replace(owner_predicate,'\s','','g')
             END
        OR regexp_replace(coalesce(pg_get_expr(p.polwithcheck,p.polrelid),''),'\s','','g')
             IS DISTINCT FROM CASE p.polcmd
               WHEN 'a' THEN regexp_replace(owner_predicate,'\s','','g')
               WHEN 'w' THEN regexp_replace(owner_predicate,'\s','','g')
               ELSE ''
             END)
  ) OR (SELECT count(*) FROM pg_policy WHERE polrelid=to_regclass('public.meals_recipes')) <> 4
    OR EXISTS (
      SELECT 1 FROM pg_policy
      WHERE polrelid=to_regclass('public.meals_recipes')
        AND (polname,polcmd) NOT IN (
          ('meals_recipes_owner_select','r'),('meals_recipes_owner_insert','a'),
          ('meals_recipes_owner_update','w'),('meals_recipes_owner_delete','d')
        )
    ) THEN
    RAISE EXCEPTION 'Recipe owner policy matrix differs from the reviewed baseline.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class c CROSS JOIN LATERAL
      aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
    WHERE c.oid=to_regclass('public.meals_recipes')
      AND (a.grantee NOT IN ('postgres'::regrole,'authenticated'::regrole,'service_role'::regrole)
        OR a.grantee='authenticated'::regrole AND a.privilege_type NOT IN ('SELECT','DELETE')
        OR a.grantee='service_role'::regrole AND a.privilege_type NOT IN ('SELECT','INSERT','UPDATE','DELETE')
        OR a.grantee<>'postgres'::regrole AND a.is_grantable)
  ) OR (SELECT count(*) FROM pg_class c CROSS JOIN LATERAL
          aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
        WHERE c.oid=to_regclass('public.meals_recipes') AND a.grantee='authenticated'::regrole) <> 2
    OR (SELECT count(*) FROM pg_class c CROSS JOIN LATERAL
          aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
        WHERE c.oid=to_regclass('public.meals_recipes') AND a.grantee='service_role'::regrole) <> 4
    OR EXISTS (
      WITH expected(column_name,privilege_type) AS (VALUES
        ('id','INSERT'),('title','INSERT'),('category_id','INSERT'),('cuisine_id','INSERT'),
        ('source','INSERT'),('favorite','INSERT'),('ingredient_sections','INSERT'),('instructions','INSERT'),
        ('title','UPDATE'),('category_id','UPDATE'),('cuisine_id','UPDATE'),('source','UPDATE'),
        ('favorite','UPDATE'),('ingredient_sections','UPDATE'),('instructions','UPDATE')
      ), actual AS (
        SELECT c.attname,a.privilege_type
        FROM pg_attribute c CROSS JOIN LATERAL aclexplode(c.attacl) a
        WHERE c.attrelid=to_regclass('public.meals_recipes')
          AND a.grantee='authenticated'::regrole AND a.grantor='postgres'::regrole AND NOT a.is_grantable
      )
      SELECT 1 FROM (
        (SELECT * FROM expected EXCEPT SELECT * FROM actual)
        UNION ALL
        (SELECT * FROM actual EXCEPT SELECT * FROM expected)
      ) difference
    ) THEN
    RAISE EXCEPTION 'Recipe grants differ from the reviewed least-privilege baseline.';
  END IF;

  IF NOT (
    SELECT count(*)=2
      AND count(*) FILTER (WHERE t.tgname='meals_recipe_before_write'
        AND t.tgtype=23 AND t.tgenabled='O' AND t.tgconstraint=0
        AND NOT t.tgdeferrable AND NOT t.tginitdeferred
        AND t.tgfoid=to_regprocedure('public.meals_recipe_before_write()')
        AND l.lanname='plpgsql' AND f.proowner='postgres'::regrole
        AND NOT f.prosecdef AND f.prorettype='trigger'::regtype
        AND pg_get_function_identity_arguments(f.oid)=''
        AND f.proconfig=ARRAY['search_path=""']
        AND pg_catalog.md5(pg_catalog.replace(f.prosrc,pg_catalog.chr(13),''))=
          '8b5e0b081d8cb634e85325d833e1cb35')=1
      AND count(*) FILTER (WHERE t.tgname='meals_planner_preserve_recipe'
        AND t.tgtype=11 AND t.tgenabled='O' AND t.tgconstraint=0
        AND NOT t.tgdeferrable AND NOT t.tginitdeferred
        AND t.tgfoid=to_regprocedure('public.meals_planner_preserve_recipe()')
        AND l.lanname='plpgsql' AND f.proowner='postgres'::regrole
        AND NOT f.prosecdef AND f.prorettype='trigger'::regtype
        AND pg_get_function_identity_arguments(f.oid)=''
        AND f.proconfig=ARRAY['search_path=""']
        AND pg_catalog.md5(pg_catalog.replace(f.prosrc,pg_catalog.chr(13),''))=
          'df81cf963a0bcbe408c0e8820d985c76')=1
    FROM pg_trigger t
    JOIN pg_proc f ON f.oid=t.tgfoid
    JOIN pg_language l ON l.oid=f.prolang
    WHERE t.tgrelid=to_regclass('public.meals_recipes') AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'Recipe trigger inventory differs from the reviewed baseline.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname LIKE 'meals\_ideas%' ESCAPE '\'
    UNION ALL
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname LIKE 'meals\_ideas%' ESCAPE '\'
    UNION ALL
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='public' AND t.typname ~ '^_?meals_ideas'
    UNION ALL
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND t.tgname LIKE 'meals\_ideas%' ESCAPE '\'
    UNION ALL
    SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND p.polname LIKE 'meals\_ideas%' ESCAPE '\'
    UNION ALL
    SELECT 1 FROM pg_constraint k JOIN pg_namespace n ON n.oid=k.connamespace
    WHERE n.nspname='public' AND k.conname LIKE 'meals\_ideas%' ESCAPE '\'
  ) THEN
    RAISE EXCEPTION 'Ideas namespace collision: stop and review; no automatic reapplication.';
  END IF;
END
$preflight$;

ALTER TABLE public.meals_recipes ADD COLUMN notes text;
GRANT INSERT (notes), UPDATE (notes) ON TABLE public.meals_recipes TO authenticated;
COMMENT ON COLUMN public.meals_recipes.notes IS
  'Optional Recipe notes. Stored independently from ingredients, instructions and source.';

CREATE TABLE public.meals_ideas (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  text text NOT NULL CONSTRAINT meals_ideas_text_nonblank CHECK (
    pg_catalog.btrim(text,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') <> ''
  ),
  checked boolean NOT NULL DEFAULT false,
  position integer NOT NULL CONSTRAINT meals_ideas_position_positive CHECK (position > 0),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.statement_timestamp(),
  CONSTRAINT meals_ideas_position_key UNIQUE (position) DEFERRABLE INITIALLY DEFERRED
);

CREATE FUNCTION public.meals_ideas_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'Idea identity cannot change.' USING ERRCODE='22023';
    END IF;
    NEW.created_at := OLD.created_at;
  ELSE
    NEW.created_at := pg_catalog.statement_timestamp();
  END IF;
  NEW.updated_at := pg_catalog.statement_timestamp();
  RETURN NEW;
END
$function$;
ALTER FUNCTION public.meals_ideas_before_write() OWNER TO postgres;
REVOKE ALL PRIVILEGES ON FUNCTION public.meals_ideas_before_write()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER meals_ideas_before_write
  BEFORE INSERT OR UPDATE ON public.meals_ideas
  FOR EACH ROW EXECUTE FUNCTION public.meals_ideas_before_write();

ALTER TABLE public.meals_ideas OWNER TO postgres;
ALTER TABLE public.meals_ideas ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.meals_ideas FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, DELETE ON TABLE public.meals_ideas TO authenticated;
GRANT UPDATE (text, checked) ON TABLE public.meals_ideas TO authenticated;

CREATE POLICY meals_ideas_owner_select ON public.meals_ideas
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = 'e72bccd9-ec2b-4822-bb5c-b7c1f39dcf60'::uuid);
CREATE POLICY meals_ideas_owner_insert ON public.meals_ideas
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = 'e72bccd9-ec2b-4822-bb5c-b7c1f39dcf60'::uuid);
CREATE POLICY meals_ideas_owner_update ON public.meals_ideas
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = 'e72bccd9-ec2b-4822-bb5c-b7c1f39dcf60'::uuid)
  WITH CHECK ((SELECT auth.uid()) = 'e72bccd9-ec2b-4822-bb5c-b7c1f39dcf60'::uuid);
CREATE POLICY meals_ideas_owner_delete ON public.meals_ideas
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = 'e72bccd9-ec2b-4822-bb5c-b7c1f39dcf60'::uuid);

CREATE FUNCTION public.meals_ideas_create(p_idea_id uuid, p_text text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_owner_id uuid := auth.uid();
  v_idea public.meals_ideas%ROWTYPE;
  v_position bigint;
BEGIN
  IF v_owner_id IS DISTINCT FROM 'e72bccd9-ec2b-4822-bb5c-b7c1f39dcf60'::uuid THEN
    RAISE EXCEPTION 'Ideas access denied.' USING ERRCODE='42501';
  END IF;
  IF p_idea_id IS NULL OR p_text IS NULL
     OR pg_catalog.btrim(p_text,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') = '' THEN
    RAISE EXCEPTION 'Idea identity and nonblank text are required.' USING ERRCODE='22023';
  END IF;

  LOCK TABLE public.meals_ideas IN SHARE ROW EXCLUSIVE MODE;
  SELECT * INTO v_idea FROM public.meals_ideas WHERE id=p_idea_id;
  IF FOUND THEN
    IF v_idea.text IS DISTINCT FROM p_text THEN
      RAISE EXCEPTION 'Idea identity already exists with different text.' USING ERRCODE='23505';
    END IF;
    RETURN pg_catalog.to_jsonb(v_idea);
  END IF;

  SELECT coalesce(max(position)::bigint,0)+1 INTO v_position FROM public.meals_ideas;
  IF v_position > 2147483647 THEN
    RAISE EXCEPTION 'Idea ordering capacity reached.' USING ERRCODE='22003';
  END IF;
  INSERT INTO public.meals_ideas(id,text,checked,position)
    VALUES (p_idea_id,p_text,false,v_position::integer)
    RETURNING * INTO v_idea;
  RETURN pg_catalog.to_jsonb(v_idea);
END
$function$;
ALTER FUNCTION public.meals_ideas_create(uuid,text) OWNER TO postgres;
REVOKE ALL PRIVILEGES ON FUNCTION public.meals_ideas_create(uuid,text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.meals_ideas_create(uuid,text) TO authenticated;

CREATE FUNCTION public.meals_ideas_move(p_idea_id uuid, p_direction integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_owner_id uuid := auth.uid();
  v_position integer;
  v_neighbor_id uuid;
  v_neighbor_position integer;
  v_moved boolean := false;
  v_items jsonb;
BEGIN
  IF v_owner_id IS DISTINCT FROM 'e72bccd9-ec2b-4822-bb5c-b7c1f39dcf60'::uuid THEN
    RAISE EXCEPTION 'Ideas access denied.' USING ERRCODE='42501';
  END IF;
  IF p_idea_id IS NULL OR p_direction IS NULL OR p_direction NOT IN (-1,1) THEN
    RAISE EXCEPTION 'Idea identity and move direction are invalid.' USING ERRCODE='22023';
  END IF;

  LOCK TABLE public.meals_ideas IN SHARE ROW EXCLUSIVE MODE;
  SELECT position INTO v_position FROM public.meals_ideas WHERE id=p_idea_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Idea is no longer available.' USING ERRCODE='P0002';
  END IF;

  IF p_direction=-1 THEN
    SELECT id,position INTO v_neighbor_id,v_neighbor_position
    FROM public.meals_ideas
    WHERE position < v_position
    ORDER BY position DESC,id
    LIMIT 1;
  ELSE
    SELECT id,position INTO v_neighbor_id,v_neighbor_position
    FROM public.meals_ideas
    WHERE position > v_position
    ORDER BY position,id
    LIMIT 1;
  END IF;

  IF FOUND THEN
    UPDATE public.meals_ideas
    SET position=CASE WHEN id=p_idea_id THEN v_neighbor_position ELSE v_position END
    WHERE id IN (p_idea_id,v_neighbor_id);
    v_moved := true;
  END IF;

  SELECT coalesce(
    jsonb_agg(jsonb_build_object('id',id,'position',position,'updated_at',updated_at) ORDER BY position,id),
    '[]'::jsonb
  ) INTO v_items FROM public.meals_ideas;
  RETURN jsonb_build_object('moved',v_moved,'items',v_items);
END
$function$;
ALTER FUNCTION public.meals_ideas_move(uuid,integer) OWNER TO postgres;
REVOKE ALL PRIVILEGES ON FUNCTION public.meals_ideas_move(uuid,integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.meals_ideas_move(uuid,integer) TO authenticated;

COMMENT ON FUNCTION public.meals_ideas_create(uuid,text) IS
  'Owner-only idempotent append for Meals Ideas. Serializes with moves and returns the persisted Idea.';
COMMENT ON FUNCTION public.meals_ideas_move(uuid,integer) IS
  'Owner-only adjacent manual move. Serializes Ideas writes and returns ordered IDs, positions and timestamps for reconciliation.';

DO $acl_assert$
BEGIN
  IF NOT has_table_privilege('authenticated','public.meals_ideas','SELECT')
     OR NOT has_table_privilege('authenticated','public.meals_ideas','DELETE')
     OR has_table_privilege('authenticated','public.meals_ideas','INSERT')
     OR has_table_privilege('authenticated','public.meals_ideas','UPDATE')
     OR NOT has_column_privilege('authenticated','public.meals_ideas','text','UPDATE')
     OR NOT has_column_privilege('authenticated','public.meals_ideas','checked','UPDATE')
     OR has_column_privilege('authenticated','public.meals_ideas','position','UPDATE')
     OR has_table_privilege('anon','public.meals_ideas','SELECT')
     OR has_table_privilege('anon','public.meals_ideas','INSERT')
     OR has_table_privilege('anon','public.meals_ideas','UPDATE')
     OR has_table_privilege('anon','public.meals_ideas','DELETE')
     OR has_table_privilege('service_role','public.meals_ideas','SELECT')
     OR has_table_privilege('service_role','public.meals_ideas','INSERT')
     OR has_table_privilege('service_role','public.meals_ideas','UPDATE')
     OR has_table_privilege('service_role','public.meals_ideas','DELETE')
     OR has_function_privilege('anon','public.meals_ideas_create(uuid,text)','EXECUTE')
     OR has_function_privilege('service_role','public.meals_ideas_create(uuid,text)','EXECUTE')
     OR has_function_privilege('anon','public.meals_ideas_move(uuid,integer)','EXECUTE')
     OR has_function_privilege('service_role','public.meals_ideas_move(uuid,integer)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.meals_ideas_create(uuid,text)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.meals_ideas_move(uuid,integer)','EXECUTE') THEN
    RAISE EXCEPTION 'Ideas effective privileges differ from the reviewed least-privilege model.';
  END IF;
END
$acl_assert$;

NOTIFY pgrst, 'reload schema';
COMMIT;
