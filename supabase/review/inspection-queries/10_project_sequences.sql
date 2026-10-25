BEGIN TRANSACTION READ ONLY;

select schemaname, sequencename, start_value, min_value, max_value, increment_by,
       cycle, cache_size, last_value
from pg_sequences where schemaname = 'public' and sequencename like '%project%';

COMMIT;
