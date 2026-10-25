-- PROPOSED ONLY: NOT EXECUTED against Supabase.
-- Kept outside migrations/ so normal migration deployment cannot apply it.
-- Review inspect_project_schema.sql first, including triggers, RLS and grants.
begin;

-- Prevent writes between inspecting current maxima and installing allocators.
lock table public.projects_home, public.projects_vehicle,
  public.projects_repeating, public.projects_misc in access exclusive mode;

create sequence public.projects_home_external_id_seq as bigint no cycle;
create sequence public.projects_vehicle_external_id_seq as bigint no cycle;
create sequence public.projects_repeating_external_id_seq as bigint no cycle;
create sequence public.projects_misc_external_id_seq as bigint no cycle;

do $$
declare
  kind text;
  prefix text;
  floor_value bigint;
  current_max bigint;
  invalid boolean;
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
    perform setval(('public.projects_' || kind || '_external_id_seq')::regclass,
      greatest(floor_value, coalesce(current_max, 0)), true);
  end loop;
end;
$$;

-- Duplicate existing identities abort the transaction; nothing is renumbered.
alter table public.projects_home add constraint projects_home_external_id_unique unique (external_id);
alter table public.projects_vehicle add constraint projects_vehicle_external_id_unique unique (external_id);
alter table public.projects_repeating add constraint projects_repeating_external_id_unique unique (external_id);
alter table public.projects_misc add constraint projects_misc_external_id_unique unique (external_id);

create function public.create_workbench_project(p_type text, p_project jsonb)
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
