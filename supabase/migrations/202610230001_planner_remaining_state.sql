begin;

-- Shared single-user identity, explicitly selected for this deployment.
create table public.planner_profiles (
  id text primary key,
  "weekStartDate" text not null default '',
  "legacyImport" jsonb,
  check ("weekStartDate" = '' or "weekStartDate" ~ '^\d{4}-\d{2}-\d{2}$')
);
insert into public.planner_profiles (id) values ('default');

create table public.parking_lot (
  "profileId" text not null references public.planner_profiles(id),
  id text not null,
  position bigint generated always as identity,
  title text not null default 'Untitled Idea',
  notes text not null default '',
  "createdAt" text not null default '',
  "updatedAt" text not null default '',
  source text not null default 'parking-lot',
  tags text not null default '',
  priority text not null default 'low',
  "convertedTo" jsonb,
  color text not null default '',
  "checklistJson" jsonb not null default '[]',
  "reminderJson" jsonb not null default '{}',
  "metadataJson" jsonb not null default '{}',
  deleted boolean not null default false,
  archived boolean not null default false,
  "convertedFromParking" text not null default '',
  primary key ("profileId", id),
  check (jsonb_typeof("checklistJson") = 'array'),
  check (jsonb_typeof("reminderJson") = 'object'),
  check (jsonb_typeof("metadataJson") = 'object'),
  check ("convertedTo" is null or jsonb_typeof("convertedTo") = 'object')
);
create index parking_lot_order_idx on public.parking_lot ("profileId", position, id);
create index parking_lot_visible_idx on public.parking_lot ("profileId", deleted);

-- Array position is separate from the legacy item's "order" field.
-- JSONB retains staged entries' optional fields without changing their shapes.
create table public.curated_queue (
  "profileId" text not null references public.planner_profiles(id),
  "taskId" text not null,
  position bigint not null,
  item jsonb not null,
  primary key ("profileId", "taskId"),
  check (jsonb_typeof(item) = 'object'),
  check (item->>'taskId' = "taskId")
);
create index curated_queue_order_idx on public.curated_queue ("profileId", position, "taskId");

create table public.staged_queue (
  "profileId" text not null references public.planner_profiles(id),
  id text not null,
  position bigint not null,
  item jsonb not null check (jsonb_typeof(item) = 'object'),
  primary key ("profileId", id)
);
create index staged_queue_order_idx on public.staged_queue ("profileId", position, id);

-- Links into the existing five tables remain polymorphic/optional. In particular,
-- project IDs are source-scoped, and staged/parking entries can be unlinked ideas.
-- A projectId-only FK would reject valid legacy records or cascade away snapshots.

alter table public.planner_profiles enable row level security;
alter table public.parking_lot enable row level security;
alter table public.curated_queue enable row level security;
alter table public.staged_queue enable row level security;

-- This is intentionally a shared profile, NOT authenticated per-user isolation.
-- Both roles can access it using the browser key, like the existing Planner store.
create policy planner_shared_profile on public.planner_profiles
  for all to anon, authenticated using (id = 'default') with check (id = 'default');
create policy planner_shared_parking on public.parking_lot
  for all to anon, authenticated using ("profileId" = 'default') with check ("profileId" = 'default');
create policy planner_shared_curated on public.curated_queue
  for all to anon, authenticated using ("profileId" = 'default') with check ("profileId" = 'default');
create policy planner_shared_staged on public.staged_queue
  for all to anon, authenticated using ("profileId" = 'default') with check ("profileId" = 'default');

grant select, update on public.planner_profiles to anon, authenticated;
grant select, insert, update, delete on public.parking_lot, public.curated_queue, public.staged_queue to anon, authenticated;
grant usage, select on sequence public.parking_lot_position_seq to anon, authenticated;

create function public.replace_planner_curated_queue(p_profile_id text, p_items jsonb)
returns void language plpgsql security invoker set search_path = public
as $$
begin
  perform 1 from public.planner_profiles where id = p_profile_id for update;
  if not found then raise exception 'Planner profile not found'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Curated queue must be an array';
  end if;
  delete from public.curated_queue where "profileId" = p_profile_id;
  insert into public.curated_queue ("profileId", "taskId", position, item)
    select p_profile_id, value->>'taskId', ordinality, value
    from jsonb_array_elements(p_items) with ordinality;
end;
$$;

create function public.enqueue_planner_staged_task(p_profile_id text, p_id text, p_item jsonb)
returns void language plpgsql security invoker set search_path = public
as $$
begin
  perform 1 from public.planner_profiles where id = p_profile_id for update;
  if not found then raise exception 'Planner profile not found'; end if;
  insert into public.staged_queue ("profileId", id, position, item)
    select p_profile_id, p_id, coalesce(max(position), 0) + 1, p_item
    from public.staged_queue where "profileId" = p_profile_id;
end;
$$;

-- Storage-only transaction: no recurrence, generation, or lifecycle logic in SQL.
create function public.import_planner_legacy_state(p_profile_id text, p_snapshot jsonb)
returns void language plpgsql security invoker set search_path = public
as $$
declare
  profile public.planner_profiles;
  entry jsonb;
begin
  select * into profile from public.planner_profiles where id = p_profile_id for update;
  if not found then raise exception 'Planner profile not found'; end if;
  if profile."legacyImport" is not null then raise exception 'Legacy import already exists; verify the saved snapshot instead'; end if;
  if profile."weekStartDate" <> ''
    or exists (select 1 from public.parking_lot where "profileId" = p_profile_id)
    or exists (select 1 from public.curated_queue where "profileId" = p_profile_id)
    or exists (select 1 from public.staged_queue where "profileId" = p_profile_id) then
    raise exception 'Import requires an empty destination; existing Supabase state was not overwritten';
  end if;
  if jsonb_typeof(p_snapshot->'parkingLot') is distinct from 'array'
    or jsonb_typeof(p_snapshot->'curatedTasks') is distinct from 'array'
    or jsonb_typeof(p_snapshot->'stagedTasks') is distinct from 'array' then
    raise exception 'Invalid legacy import snapshot';
  end if;
  for entry in select value from jsonb_array_elements(p_snapshot->'parkingLot') loop
    insert into public.parking_lot (
      "profileId", id, title, notes, "createdAt", "updatedAt", source, tags, priority,
      "convertedTo", color, "checklistJson", "reminderJson", "metadataJson",
      deleted, archived, "convertedFromParking"
    )
    select p_profile_id, r.id, r.title, r.notes, r."createdAt", r."updatedAt", r.source, r.tags, r.priority,
      r."convertedTo", r.color, r."checklistJson", r."reminderJson", r."metadataJson",
      r.deleted, r.archived, r."convertedFromParking"
    from jsonb_populate_record(null::public.parking_lot, entry) r;
  end loop;
  perform public.replace_planner_curated_queue(p_profile_id, p_snapshot->'curatedTasks');
  insert into public.staged_queue ("profileId", id, position, item)
    select p_profile_id, gen_random_uuid()::text, ordinality, value
    from jsonb_array_elements(p_snapshot->'stagedTasks') with ordinality;
  update public.planner_profiles set
    "weekStartDate" = p_snapshot->>'weekStartDate',
    "legacyImport" = jsonb_build_object('verified', false, 'snapshot', p_snapshot, 'importedAt', now())
    where id = p_profile_id;
end;
$$;

revoke all on function public.replace_planner_curated_queue(text, jsonb) from public;
revoke all on function public.enqueue_planner_staged_task(text, text, jsonb) from public;
revoke all on function public.import_planner_legacy_state(text, jsonb) from public;
grant execute on function public.replace_planner_curated_queue(text, jsonb),
  public.enqueue_planner_staged_task(text, text, jsonb),
  public.import_planner_legacy_state(text, jsonb) to anon, authenticated;

commit;
