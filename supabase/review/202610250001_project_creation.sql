-- PROPOSED ONLY: NOT EXECUTED against Supabase.
-- Kept outside migrations/ so normal migration deployment cannot apply it.
-- Review inspect_project_schema.sql first, including triggers, RLS and grants.
-- Saved live schema and data preflight passed. Reconfirm no drift before use.
-- Canonical reviewed proposal; the older proposals/ copy is superseded.
begin;
set local lock_timeout = '5s';

-- Prevent writes between inspecting current maxima and installing allocators.
lock table public.projects_home, public.projects_vehicle,
  public.projects_repeating, public.projects_misc in access exclusive mode;

do $$
declare
  kind text;
  prefix text;
  floor_value bigint;
  current_max bigint;
  invalid boolean;
  allocator regclass;
  constraint_exists boolean;
  last_issued bigint;
  allocator_called boolean;
begin
  for kind, prefix, floor_value in
    select * from (values
      ('home', 'PA', 209::bigint), ('vehicle', 'PB', 82::bigint),
      ('repeating', 'PC', 8::bigint), ('misc', 'PD', 4::bigint)
    ) as floors(kind, prefix, floor_value)
  loop
    -- Nulls remain unchanged; unexpected existing identities require review.
    execute format(
      'select exists(select 1 from public.%I where external_id is not null and external_id !~ $1)',
      'projects_' || kind)
      into invalid using '^' || prefix || '[0-9]{4,}$';
    if invalid then
      raise exception 'Unexpected external_id format in projects_%; no rows were changed', kind;
    end if;
    execute format('select max(substring(external_id from 3)::bigint) from public.%I',
      'projects_' || kind) into current_max;
    if current_max = 9223372036854775807 then
      raise exception 'External ID number exhausted in projects_%', kind;
    end if;
    allocator := to_regclass('public.projects_' || kind || '_external_id_seq');
    select exists (
      select 1 from pg_constraint
      where conrelid = ('public.projects_' || kind)::regclass
        and conname = 'projects_' || kind || '_external_id_unique'
    ) into constraint_exists;
    if allocator is null then
      if constraint_exists then
        raise exception 'Partial allocator state for projects_%; review before deployment', kind;
      end if;
      execute format('create sequence public.%I as bigint no cycle',
        'projects_' || kind || '_external_id_seq');
      perform setval(('public.projects_' || kind || '_external_id_seq')::regclass,
        greatest(floor_value, coalesce(current_max, 0)), true);
      -- Duplicates abort the whole transaction without changing project rows.
      execute format('alter table public.%I add constraint %I unique (external_id)',
        'projects_' || kind, 'projects_' || kind || '_external_id_unique');
    else
      -- Safe reapplication after functional rollback: never reseed an allocator.
      if not exists (
        select 1 from pg_sequence
        where seqrelid = allocator and seqtypid = 'bigint'::regtype
          and seqincrement = 1 and seqmin = 1 and seqmax = 9223372036854775807
          and seqcache = 1 and not seqcycle
      ) or not exists (
        select 1 from pg_constraint c join pg_index i on i.indexrelid = c.conindid
        where c.conrelid = ('public.projects_' || kind)::regclass
          and c.conname = 'projects_' || kind || '_external_id_unique'
          and c.contype = 'u' and c.convalidated and not c.condeferrable
          and c.conkey = array[(
            select attnum from pg_attribute
            where attrelid = c.conrelid and attname = 'external_id' and not attisdropped
          )]::smallint[]
          and i.indisvalid and i.indisready
      ) then
        raise exception 'Incompatible retained allocator or constraint for projects_%', kind;
      end if;
      execute format('select last_value, is_called from public.%I',
        'projects_' || kind || '_external_id_seq') into last_issued, allocator_called;
      if not allocator_called or last_issued < greatest(floor_value, coalesce(current_max, 0)) then
        raise exception 'Retained allocator for projects_% is behind current data; do not reset automatically', kind;
      end if;
      if last_issued = 9223372036854775807 then
        raise exception 'Retained allocator exhausted for projects_%', kind;
      end if;
    end if;
  end loop;
end;
$$;

create or replace function public.create_workbench_project(p_type text, p_project jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  prefix text;
  target_table text;
  allowed text[];
  columns_sql text;
  next_number text;
  payload jsonb;
  saved jsonb;
begin
  prefix := case p_type when 'home' then 'PA' when 'vehicle' then 'PB'
    when 'repeating' then 'PC' when 'misc' then 'PD' end;
  if prefix is null then
    raise exception 'Select a valid project type.' using errcode = '22023';
  end if;
  if p_project is null or jsonb_typeof(p_project) <> 'object' then
    raise exception 'Project must be an object.' using errcode = '22023';
  end if;
  allowed := array['title', 'category', 'state', 'priority', 'order', 'metadata']
    || case p_type
      when 'home' then array['property', 'area', 'resource_links', 'cost', 'date_completed']
      when 'vehicle' then array['vehicle', 'date_completed', 'hours', 'mileage', 'mechanic',
        'service_description', 'resource_links', 'maintenance_checks']
      when 'repeating' then array['property', 'recurrence']
      when 'misc' then array['resource_links']
    end;
  if exists (select 1 from jsonb_object_keys(p_project) as keys(key) where not key = any(allowed)) then
    raise exception 'Unsupported project field; IDs are allocated by the database.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_project->'title') is distinct from 'string'
      or btrim(p_project->>'title') = '' then
    raise exception 'Project title is required.' using errcode = '22023';
  end if;
  if p_project ? 'metadata' and jsonb_typeof(p_project->'metadata') <> 'object' then
    raise exception 'Project metadata must be an object.' using errcode = '22023';
  end if;
  if p_type = 'repeating' and (
    jsonb_typeof(p_project->'recurrence') is distinct from 'string'
    or btrim(p_project->>'recurrence') = ''
  ) then
    raise exception 'Recurrence is required for repeating projects.' using errcode = '22023';
  end if;
  -- projects_all casts every raw bigint order to integer.
  if p_project->>'order' is not null
      and (p_project->>'order')::numeric not between -2147483648 and 2147483647 then
    raise exception 'Project order must fit the projects_all integer range.' using errcode = '22003';
  end if;

  target_table := 'projects_' || p_type;
  next_number := nextval(('public.' || target_table || '_external_id_seq')::regclass)::text;
  payload := p_project || jsonb_build_object(
    'id', gen_random_uuid(),
    'external_id', prefix || lpad(next_number, greatest(4, length(next_number)), '0'),
    'title', btrim(p_project->>'title')
  );
  select string_agg(format('%I', key), ', ' order by key)
    into columns_sql from jsonb_object_keys(payload) as keys(key);

  -- Only supplied columns are inserted; omitted columns keep database defaults.
  execute format(
    'insert into public.%1$I (%2$s) select %2$s from jsonb_populate_record(null::public.%1$I, $1) returning to_jsonb(%1$I.*)',
    target_table, columns_sql)
    into saved using payload;
  return saved;
end;
$$;

-- Keep existing table grants and RLS unchanged. This RPC cannot bypass them.
revoke all on function public.create_workbench_project(text, jsonb) from public, anon, authenticated;
grant execute on function public.create_workbench_project(text, jsonb) to anon, authenticated;
revoke all on sequence public.projects_home_external_id_seq, public.projects_vehicle_external_id_seq,
  public.projects_repeating_external_id_seq, public.projects_misc_external_id_seq from public, anon, authenticated;
grant usage on sequence public.projects_home_external_id_seq, public.projects_vehicle_external_id_seq,
  public.projects_repeating_external_id_seq, public.projects_misc_external_id_seq to anon, authenticated;

notify pgrst, 'reload schema';
commit;
