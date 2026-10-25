BEGIN TRANSACTION READ ONLY;

select p.oid::regprocedure as routine, p.prosecdef as security_definer, p.proacl,
       pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f'
  and (p.proname like '%project%' or p.proname like '%external_id%');

COMMIT;
