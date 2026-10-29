-- REVIEW ONLY. Exact separate authorization is required; never run automatically.
-- Safe only before use, with these three tables empty and no incoming dependencies.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $gate$
DECLARE
  approved_for_reversal boolean := false;
BEGIN
  IF NOT approved_for_reversal OR current_user<>'postgres' THEN
    RAISE EXCEPTION 'Meals Recipe reversal disabled.';
  END IF;
END
$gate$;
LOCK TABLE public.meals_recipes, public.meals_recipe_categories, public.meals_recipe_cuisines
  IN ACCESS EXCLUSIVE MODE;
DO $empty$
BEGIN
  IF EXISTS (SELECT 1 FROM public.meals_recipes)
     OR EXISTS (SELECT 1 FROM public.meals_recipe_categories)
     OR EXISTS (SELECT 1 FROM public.meals_recipe_cuisines) THEN
    RAISE EXCEPTION 'Meals reversal blocked: data exists; preserve/export and review a new strategy.';
  END IF;
END
$empty$;
DROP TABLE public.meals_recipes RESTRICT;
DROP TABLE public.meals_recipe_categories RESTRICT;
DROP TABLE public.meals_recipe_cuisines RESTRICT;
DROP FUNCTION public.meals_recipe_before_write() RESTRICT;
COMMIT;
