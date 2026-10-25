BEGIN TRANSACTION READ ONLY;

SELECT r.id, r.external_id, r.title, r.recurrence, r.created_at,
       a.project_type, a.external_id = r.external_id AS external_identity_matches,
       a.recurrence = r.recurrence AS recurrence_matches
FROM public.projects_repeating r
JOIN public.projects_all a ON a.id = r.id AND a.project_type = 'repeating'
WHERE r.title = 'Recycle'
ORDER BY r.created_at DESC, r.id;

COMMIT;
