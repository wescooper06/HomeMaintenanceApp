BEGIN TRANSACTION READ ONLY;

SELECT n.nspname AS schema_name, c.relname AS relation_name,
       a.attname AS column_name, a.attnum AS position,
       format_type(a.atttypid, a.atttypmod) AS data_type,
       a.attnotnull AS not_null, pg_get_expr(d.adbin, d.adrelid) AS column_default,
       a.attidentity AS identity_kind, a.attgenerated AS generated_kind, a.attacl
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%'
  AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
ORDER BY n.nspname, c.relname, a.attnum;

COMMIT;
