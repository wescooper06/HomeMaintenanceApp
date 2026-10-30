-- READ ONLY. Run in a fresh query after confirmed ROLLBACK, as postgres.
-- Fresh-install gate: do not run fixtures after owner Shopping use begins.
SELECT jsonb_build_object(
  'executor',current_user,
  'verification_items',(SELECT count(*) FROM public.meals_shopping_items
    WHERE id IN ('b46b15b8-3343-4f76-a800-000000000002','b46b15b8-3343-4f76-a800-000000000004')
      OR starts_with(text,'__shopping_wave1_verify_b46b15b8__')),
  'verification_categories',(SELECT count(*) FROM public.meals_shopping_categories
    WHERE id IN ('b46b15b8-3343-4f76-a800-000000000001','b46b15b8-3343-4f76-a800-000000000003')
      OR starts_with(name,'__shopping_wave1_verify_b46b15b8__')),
  'items',(SELECT count(*) FROM public.meals_shopping_items),
  'custom',(SELECT count(*) FROM public.meals_shopping_categories WHERE predefined_order IS NULL),
  'predefined',(SELECT count(*) FROM public.meals_shopping_categories WHERE predefined_order IS NOT NULL),
  'pass',current_user='postgres'
    AND NOT EXISTS(SELECT 1 FROM public.meals_shopping_items)
    AND NOT EXISTS(SELECT 1 FROM public.meals_shopping_categories WHERE predefined_order IS NULL)
    AND NOT EXISTS(SELECT 1 FROM public.meals_shopping_categories
      WHERE id IN ('b46b15b8-3343-4f76-a800-000000000001','b46b15b8-3343-4f76-a800-000000000003')
        OR starts_with(name,'__shopping_wave1_verify_b46b15b8__'))
    AND (SELECT count(*) FROM public.meals_shopping_categories WHERE predefined_order IS NOT NULL)=28
) AS cleanup;
