BEGIN TRANSACTION READ ONLY;

WITH targets AS (
  SELECT 'projects_all'::text AS target_table, a.id::text AS target_id,
         ref.identity, a.project_type AS source, to_jsonb(a) AS identity_context
  FROM public.projects_all a
  CROSS JOIN LATERAL (VALUES (a.id::text), (nullif(a.external_id, ''))) ref(identity)
  UNION ALL
  SELECT 'planner_tasks', t.id::text, t.id::text, t.source, to_jsonb(t) FROM public.planner_tasks t
  UNION ALL
  SELECT 'task_manager', t.id, t.id, t.source, to_jsonb(t) FROM public.task_manager t
  UNION ALL
  SELECT 'planner_weekly_tasks', w.id, w.id, w.source, to_jsonb(w) FROM public.planner_weekly_tasks w
  UNION ALL
  SELECT 'weekly_tasks', w.id, w.id, w.source, to_jsonb(w) FROM public.weekly_tasks w
  UNION ALL
  SELECT 'repeatable_masters', m.id, m.id, m.source, to_jsonb(m) FROM public.repeatable_masters m
)
SELECT count(*) OVER () AS total_table_rows,
       p."profileId", p.id, p.source, p.deleted, p.archived,
       p."convertedTo", p."convertedFromParking", p."metadataJson",
       p."reminderJson", p."checklistJson",
       p."convertedTo"->>'type' AS conversion_type,
       p."convertedTo"->>'id' AS converted_identity,
       links.candidates AS explicit_target_candidates
FROM public.parking_lot p
LEFT JOIN LATERAL (
  SELECT jsonb_agg(to_jsonb(t)) AS candidates FROM targets t
  WHERE t.identity = nullif(p."convertedTo"->>'id', '')
) links ON true
ORDER BY p."profileId", p.id
LIMIT 100;

COMMIT;
