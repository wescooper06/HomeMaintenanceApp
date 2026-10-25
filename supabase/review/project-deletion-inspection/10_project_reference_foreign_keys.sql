BEGIN TRANSACTION READ ONLY;

SELECT ns.nspname AS schema_name, src.relname AS relation_name, con.conname,
       target_ns.nspname AS referenced_schema, target.relname AS referenced_relation,
       con.conkey AS referencing_attribute_numbers,
       con.confkey AS referenced_attribute_numbers,
       CASE con.confdeltype WHEN 'a' THEN 'no action' WHEN 'r' THEN 'restrict'
         WHEN 'c' THEN 'cascade' WHEN 'n' THEN 'set null'
         WHEN 'd' THEN 'set default' END AS on_delete_behavior,
       con.condeferrable, con.condeferred, con.convalidated,
       pg_get_constraintdef(con.oid, true) AS definition
FROM pg_constraint con
JOIN pg_class src ON src.oid = con.conrelid
JOIN pg_namespace ns ON ns.oid = src.relnamespace
JOIN pg_class target ON target.oid = con.confrelid
JOIN pg_namespace target_ns ON target_ns.oid = target.relnamespace
WHERE con.contype = 'f'
  AND (ns.nspname = 'public' OR target_ns.nspname = 'public')
ORDER BY ns.nspname, src.relname, con.conname;

COMMIT;
