BEGIN TRANSACTION READ ONLY;

select table_name, ordinal_position, column_name, data_type, udt_name,
       is_nullable, column_default, is_identity, identity_generation,
       is_generated, generation_expression
from information_schema.columns
where table_schema = 'public' and table_name in
  ('projects_home', 'projects_vehicle', 'projects_repeating', 'projects_misc', 'projects_all')
order by table_name, ordinal_position;

COMMIT;
