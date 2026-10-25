BEGIN TRANSACTION READ ONLY;

SELECT n.nspname AS schema_name, c.relname AS relation_name,
       i.indexrelid::regclass AS index_name, i.indisvalid, i.indisready,
       i.indisunique, i.indisprimary, i.indkey AS indexed_attribute_numbers,
       pg_get_indexdef(i.indexrelid) AS definition,
       pg_get_expr(i.indpred, i.indrelid) AS predicate
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_index i ON i.indrelid = c.oid
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%'
ORDER BY n.nspname, c.relname, i.indexrelid::regclass::text;

COMMIT;
