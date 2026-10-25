schema_name,signature,owner,security_definer,proacl,proconfig,definition
public,"create_workbench_project(text,jsonb)",postgres,false,"{postgres=X/postgres,service_role=X/postgres,anon=X/postgres,authenticated=X/postgres}","[""search_path=\""\""""]","CREATE OR REPLACE FUNCTION public.create_workbench_project(p_type text, p_project jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$
"
public,"replace_planner_curated_queue(text,jsonb)",postgres,false,"{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}","[""search_path=public""]","CREATE OR REPLACE FUNCTION public.replace_planner_curated_queue(p_profile_id text, p_items jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  perform 1 from public.planner_profiles where id = p_profile_id for update;
  if not found then raise exception 'Planner profile not found'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Curated queue must be an array';
  end if;
  delete from public.curated_queue where ""profileId"" = p_profile_id;
  insert into public.curated_queue (""profileId"", ""taskId"", position, item)
    select p_profile_id, value->>'taskId', ordinality, value
    from jsonb_array_elements(p_items) with ordinality;
end;
$function$
"