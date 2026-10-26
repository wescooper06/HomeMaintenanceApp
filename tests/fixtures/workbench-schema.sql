-- TEST FIXTURE ONLY. Derived from owner-supplied October 2026 schema exports.
-- This is not a deployment migration and contains no live project data.
create table public.projects_home ("id" uuid not null default gen_random_uuid() primary key,
"external_id" text not null,
"category" text,
"state" text,
"priority" text,
"order" bigint,
"metadata" jsonb,
"created_at" timestamp without time zone default now(),
"updated_at" timestamp without time zone default now(),
"property" text,
"area" text,
"title" text,
"resource_links" jsonb,
"cost" numeric,
"date_completed" date);
create table public.projects_vehicle ("id" uuid not null default gen_random_uuid() primary key,
"created_at" timestamp with time zone not null default now(),
"external_id" text,
"vehicle" text,
"state" text,
"category" text,
"date_completed" date,
"hours" numeric,
"mileage" numeric,
"mechanic" text,
"service_description" text,
"resource_links" jsonb,
"order" bigint,
"maintenance_checks" jsonb,
"updated_at" timestamp without time zone default now(),
"metadata" jsonb,
"title" text,
"priority" text);
create table public.projects_repeating ("id" uuid not null default gen_random_uuid() primary key,
"created_at" timestamp with time zone not null default now(),
"external_id" text,
"property" text,
"state" text,
"category" text,
"task_description" text,
"recurrence" text,
"priority" text,
"order" bigint,
"updated_at" timestamp without time zone default now(),
"title" text,
"metadata" jsonb);
create table public.projects_misc ("id" uuid not null default gen_random_uuid() primary key,
"created_at" timestamp with time zone not null default now(),
"external_id" text,
"category" text,
"title" text,
"priority" text,
"order" bigint,
"resource_links" jsonb,
"state" text,
"updated_at" timestamp without time zone default now(),
"metadata" jsonb);
create view public.projects_all as SELECT projects_home.id,
    projects_home.external_id,
    'home'::text AS project_type,
    projects_home.category,
    projects_home.title,
    projects_home.state,
    projects_home.priority,
    projects_home."order"::integer AS "order",
    NULL::text AS recurrence,
    projects_home.metadata
   FROM projects_home
UNION ALL
 SELECT projects_vehicle.id,
    projects_vehicle.external_id,
    'vehicle'::text AS project_type,
    projects_vehicle.category,
    projects_vehicle.title,
    projects_vehicle.state,
    projects_vehicle.priority,
    projects_vehicle."order"::integer AS "order",
    NULL::text AS recurrence,
    projects_vehicle.metadata
   FROM projects_vehicle
UNION ALL
 SELECT projects_repeating.id,
    projects_repeating.external_id,
    'repeating'::text AS project_type,
    projects_repeating.category,
    projects_repeating.title,
    projects_repeating.state,
    projects_repeating.priority,
    projects_repeating."order"::integer AS "order",
    projects_repeating.recurrence,
    projects_repeating.metadata
   FROM projects_repeating
UNION ALL
 SELECT projects_misc.id,
    projects_misc.external_id,
    'misc'::text AS project_type,
    projects_misc.category,
    projects_misc.title,
    projects_misc.state,
    projects_misc.priority,
    projects_misc."order"::integer AS "order",
    NULL::text AS recurrence,
    projects_misc.metadata
   FROM projects_misc;
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete, truncate, references, trigger
  on projects_home, projects_vehicle, projects_repeating, projects_misc, projects_all
  to anon, authenticated, service_role;

-- MODERN PLANNER FIXTURE
create table public.planner_tasks (
  "id" uuid not null default gen_random_uuid() primary key,
  "created_at" timestamp with time zone not null default now(),
  "project_id" text,
  "title" text,
  "source" text,
  "category" text,
  "state" text,
  "priority" bigint,
  "order" bigint,
  "recurrence" text,
  "start_date" timestamp without time zone,
  "updated_at" timestamp without time zone,
  "metadata_json" jsonb,
  "deleted" boolean,
  "project_registry_id" uuid
);
grant select, insert, update, delete on public.planner_tasks to anon, authenticated;
create table public.planner_weekly_tasks (
  "id" text not null primary key,
  "created_at" timestamp with time zone not null default now(),
  "task_type" text,
  "title" text,
  "source" text,
  "project_id" text,
  "parent_rep" text,
  "occurrence_date" date,
  "date" date,
  "time_slot" text,
  "bucket" text,
  "completed" boolean,
  "overridden" boolean,
  "deleted_instance" boolean,
  "checklist_json" jsonb,
  "reminder_json" jsonb,
  "metadata_json" jsonb,
  "updated_at" timestamp without time zone,
  "deleted" boolean,
  "checklist_open" boolean
);
grant select, insert, update, delete on public.planner_weekly_tasks to anon, authenticated;
create table public.planner_parking_lot (
  "id" text not null primary key,
  "created_at" timestamp with time zone not null default now(),
  "title" text,
  "notes" text,
  "tags" text,
  "priority" text,
  "color" text,
  "checklist_json" jsonb,
  "reminder_json" jsonb,
  "metadata_json" jsonb,
  "converted_to_type" boolean,
  "converted_to_id" text,
  "updated_at" timestamp without time zone default now(),
  "deleted" boolean
);
grant select, insert, update, delete on public.planner_parking_lot to anon, authenticated;
