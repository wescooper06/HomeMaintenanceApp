-- PREPARED ONLY. Reversal requires separate authorization; never auto-run.
-- Empty-data reversal only: export/retention decision required if Shopping was used.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $gate$
DECLARE approved_for_reversal boolean := false;
BEGIN
  IF NOT approved_for_reversal OR current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Shopping reversal disabled: separate authorization required.';
  END IF;
END
$gate$;
LOCK TABLE public.meals_shopping_categories,public.meals_shopping_items IN ACCESS EXCLUSIVE MODE;
DO $data$
BEGIN
  IF EXISTS(SELECT 1 FROM public.meals_shopping_items)
    OR EXISTS(SELECT 1 FROM public.meals_shopping_categories WHERE predefined_order IS NULL) THEN
    RAISE EXCEPTION 'Shopping data exists: stop and obtain an explicit retention/reversal decision.';
  END IF;
END
$data$;
DROP TABLE public.meals_shopping_items;
DROP TABLE public.meals_shopping_categories;
DROP FUNCTION public.meals_shopping_before_write();
COMMIT;
