BEGIN TRANSACTION READ ONLY;

with raw_projects as (
  select 'home'::text as kind, 'PA'::text as prefix, 209::bigint as floor_value, external_id, "order" from public.projects_home
  union all
  select 'vehicle', 'PB', 82, external_id, "order" from public.projects_vehicle
  union all
  select 'repeating', 'PC', 8, external_id, "order" from public.projects_repeating
  union all
  select 'misc', 'PD', 4, external_id, "order" from public.projects_misc
), floors(kind, prefix, floor_value) as (
  values ('home', 'PA', 209::bigint), ('vehicle', 'PB', 82::bigint),
         ('repeating', 'PC', 8::bigint), ('misc', 'PD', 4::bigint)
), duplicate_ids as (
  select kind, external_id from raw_projects
  where external_id is not null group by kind, external_id having count(*) > 1
), stats as (
  select f.kind, f.prefix, f.floor_value,
         count(r.kind) as row_count,
         count(*) filter (where r.kind is not null and r.external_id is null) as null_external_ids,
         count(*) filter (where r.external_id is not null
           and r.external_id !~ ('^' || f.prefix || '[0-9]{4,}$')) as format_blockers,
         count(*) filter (where r."order" not between -2147483648 and 2147483647) as view_order_blockers,
         max(case when r.external_id ~ ('^' || f.prefix || '[0-9]{4,}$')
           then substring(r.external_id from 3)::numeric end) as current_max
  from floors f left join raw_projects r on r.kind = f.kind
  group by f.kind, f.prefix, f.floor_value
)
select s.*,
       (select count(*) from duplicate_ids d where d.kind = s.kind) as duplicate_id_blockers,
       case when current_max >= 9223372036854775807 then 1 else 0 end as bigint_exhaustion_blockers,
       greatest(floor_value::numeric, coalesce(current_max, 0)) + 1 as proposed_next_number
from stats s order by kind;

COMMIT;
