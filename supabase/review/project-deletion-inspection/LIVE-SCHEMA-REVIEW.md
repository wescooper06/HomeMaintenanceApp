# Live deletion schema review

**PASS for owner-run dependency inspection. READY FOR DEPENDENCY INSPECTION.**
**Not approval for deletion implementation or deployment.**
No SQL, RPC, deletion, Google API or live database connection was executed.

## Evidence read

Every file in [results/](results/) was read in full, including its README.
The thirteen numbered files contain CSV exports despite their `.sql` extension.
Do not execute them. There are no `.empty.txt` markers in this supplied set;
all thirteen results are nonempty.

| Supplied result | Parsed rows |
| --- | ---: |
| `01_relations_rls.acl.sql` | 66 |
| `02_columns.sql` | 721 |
| `03_constraints_foreign_keys.sql` | 173 |
| `04_indexes.sql` | 172 |
| `05_triggers.sql` | 136 |
| `06_rls_policies.sql` | 4 |
| `07_table_privileges.sql` | 1013 |
| `08_column_privileges.sql` | 7035 |
| `09_project_reference_columns.sql` | 234 |
| `10_project_reference_foreign_keys.sql` | 3 |
| `11_planner_functions.sql` | 4 |
| `12_project_delete_functions.sql` | 2 |
| `13_effective_role_privileges.sql` | 264 |

There are 24 public relations: 23 base tables and the `projects_all` view.
Other returned schemas are auth, extensions, realtime, storage and vault.
No public-endpoint cross-schema FK or matching non-public application function
was returned. Platform identities/data are not project cascade targets.
Catalog data does not establish row counts, ownership of particular JSON values,
or whether historical relations are empty/currently used.

## Relationship classifications

A = master identity; B = direct project-owned; C = indirect owned/traversal;
D = reference/ambiguous pending row evidence and policy review;
E = global/shared, preserve; F = external resource, separate cleanup.
B/C are semantic rules conditional on an explicit, unambiguous ownership link,
not blanket permission to remove every row in that relation.

| Live relation / fields | Class | Interpretation |
| --- | --- | --- |
| `projects_home.id`, `projects_vehicle.id`, `projects_repeating.id`, `projects_misc.id`; each `external_id` | A | Authoritative master UUID/type and separate stable alias. Delete exactly the selected raw master last. Per-table uniqueness does not prove UUID uniqueness across tables. |
| `projects_all` | A (read projection) | UNION ALL of exactly the four public raw tables; no independent row, never a delete target. |
| Raw project `metadata`, `resource_links`, vehicle `maintenance_checks` | B when embedded in target master; D for references inside | Embedded state disappears with the master. A linked resource or another project's UUID inside JSON does not authorize deleting that resource/project. |
| `planner_tasks.project_id` + `source` | B | Explicit direct project link used by current adapter. UUID or legitimate external alias must be resolved with canonical type and ambiguity checks. Include `deleted`/completed/history rows. |
| `planner_tasks.project_registry_id` | D -> C only after registry ownership verification | Live nullable UUID field not handled by the current adapter; no FK. Do not assume a matching registry ID means exclusive ownership. |
| `planner_tasks.metadata_json.series` | B embedded / C lifecycle | Current recurrence master/override configuration; `queue`/`queueOrder` are current curated/staged membership. Remove with owned task, not all queues. |
| `planner_weekly_tasks.project_id`, `parent_rep`, `metadata_json.sourceTaskId` | B direct / C via task or recurrence master | Trace explicit project/master/task IDs; sourceTaskId can be a task ID. Include generated occurrences, overrides, completed rows, `deleted_instance`/`deleted` tombstones. Conflicting identities require review. |
| Weekly `checklist_json`, `reminder_json`, override metadata | B embedded; F for remote event | Local checklist/reminder/override data disappears with owning weekly row. No separate local recurrence/occurrence table is used by current adapter. |
| `planner_weekly_tasks.id = week-settings` | E | Shared week configuration; preserve even if nested data contains matching text. |
| `planner_parking_lot.converted_to_id`, `converted_to_type`, `metadata_json.conversionType` | B for verified project/repeatable conversion; C for verified task/weekly conversion; D if missing/conflicting | Explicit conversion target and type are required; include soft-deleted history. Mere notes/title/metadata mention is not ownership. |
| Parking `checklist_json`, `reminder_json`, metadata | B embedded / F if remote notification evidence | Follows the owned Parking row only; remote event ownership requires independent verification. |
| `project_registry.id`, `project_id`, `project_type`, `planner_task_id`, `metadata`, `recurrence_rule` | D, candidate B/C | Newly discovered actual table. UUID PK and project UUID/type fields; links task UUID in both directions with planner_tasks. No FKs, no current JS consumer or supplied function explains lifecycle/exclusivity. Inspect row evidence before including in cascade. Recurrence dates/rule fields are not proof of ownership by themselves. |
| `projects.(id, source)`, `metadata`, `resourceLinks` | D | Separate live text-ID table, not authoritative four-table master set and not in unified view. Could be historical copy/reference; do not delete it on coincidental ID match. |
| `task_manager.projectId`, `metadataJson`; own `id` | D -> B/C after characterization | Separate live historical table, not current planner_tasks adapter. Explicit links are candidates; verify aliases/source and active writer status. |
| `weekly_tasks.projectId`, `taskId`, `parentRepeatableId`, `metadataJson`, embedded checklist/reminder | D -> B/C; F for remote events | Separate live historical weekly table. Same-named fields need actual value and lifecycle review; generated IDs are not decoded as identity. |
| `repeatable_masters.projectId`, `taskId`, `id` | D -> B/C | Live historical recurrence master table; source/project/task identity may differ. Review every explicit link, including inactive rows. |
| `repeatable_overrides.projectId`, `id`, `active`, `removedFromPlanner`, `removedFromTaskManager` | D -> B/C | Live historical override/tombstone table. Unique projectId index; link meaning/alias must be verified before removal. |
| `curated_queue.(profileId, taskId)`, `item` | D -> C for verified owned queue item | Composite PK, no standalone id. JSON item taskId must equal column taskId by CHECK. Do not delete the whole shared profile queue. |
| `staged_queue.(profileId, id)`, `item` | D -> B/C | Staged JSON may link a project, master or task; unlinked ideas are not dependents. |
| `parking_lot.(profileId, id)`, `convertedTo`, `metadataJson`, checklist/reminder, `convertedFromParking` | D -> B/C, F for remote identity | Live older profile-scoped Parking table. Conversion/provenance is not automatically exclusive project ownership. Include archived/deleted owned records once characterized. |
| `planner_profiles.id`, `weekStartDate`, `legacyImport` | E | Shared profile/settings/import snapshot. Never cascade profile or mutate global historical backup merely because it includes UUID text. |
| `activity_rules`, `activity_types`, `activity_weekly_grid` | E / D only for unexpected row evidence | No explicit project identity column or project FK. Activity IDs/recurrence text are not project links. |
| `trips`, `trips_timeline`, `trips_workflow_metadata` | E / D only for unexpected row evidence | No explicit project identity link. trip_id is a trip identity, not project UUID. Generic JSON/notes candidates do not authorize removal. |
| Auth, Storage, Realtime, Vault, extension relations; downloaded backups | E | Not project-owned merely through matching text. Remote files/resources need separate explicit ownership characterization. |
| Google event IDs in reminder JSON / private plannerTaskId on Google | F | Remote notification resource; local DB deletion does not cancel it. Imported Google Calendar event identities are not master project identities. |

The broad locator may surface metadata/notes matches in any public table.
Such rows remain D/E until explicit field semantics prove B/C.

## Exact public foreign keys and constraints

Only these three public-endpoint FKs exist, including incoming references:

| FK | Referencing -> referenced column | Action |
| --- | --- | --- |
| `curated_queue_profileId_fkey` | `curated_queue."profileId"` -> `planner_profiles.id` | ON DELETE NO ACTION; ON UPDATE NO ACTION |
| `parking_lot_profileId_fkey` | `parking_lot."profileId"` -> `planner_profiles.id` | ON DELETE NO ACTION; ON UPDATE NO ACTION |
| `staged_queue_profileId_fkey` | `staged_queue."profileId"` -> `planner_profiles.id` | ON DELETE NO ACTION; ON UPDATE NO ACTION |

All validated, nondeferrable, not initially deferred. Attribute 1 -> attribute 1.
There is no ON DELETE CASCADE, SET NULL or explicit RESTRICT FK involving a
public relation. NO ACTION is not renamed RESTRICT; it is the actual behavior.
There is no FK for raw projects, registry/task links, weekly parents,
Parking conversion IDs or recurrence aliases. No DB cascade will perform the
owner-approved deletion automatically.

All reported public constraints are validated. Master tables each have UUID PK
and the deployed external_id unique constraint. Registry only has its UUID PK;
historical projects has composite `(id, source)` PK; repeatable_overrides has
PK id plus UNIQUE projectId. Remaining Planner tables have their reported PKs,
and old queue/Parking/profile tables retain JSON-shape/week-setting CHECKs.

## Index review

All public indexes in the export are valid and ready.

| Relation/field | Coverage |
| --- | --- |
| Four raw master UUIDs/external IDs | PK UUID + unique external_id btrees on every table |
| `planner_tasks` | PK id only; no project_id/project_registry_id or series/queue JSON index |
| `planner_weekly_tasks` | PK id only; no project_id/parent_rep/sourceTaskId JSON index |
| `planner_parking_lot` | PK id only; no converted_to_id/conversion metadata index |
| `project_registry` | PK id; btrees on project_id, planner_task_id, next_scheduled_at; no composite project_id/type uniqueness |
| `projects` | PK (id, source) |
| `task_manager`, `weekly_tasks`, `repeatable_masters` | PK id only; no project/parent/task link index |
| `repeatable_overrides` | PK id and unique projectId |
| `curated_queue` | PK (profileId, taskId), order index (profileId, position, taskId); not a standalone taskId index across profiles |
| `staged_queue` | PK (profileId, id), order index (profileId, position, id); no JSON link index |
| `parking_lot` | PK (profileId,id), order and (profileId,deleted) indexes; no convertedTo JSON link index |
| `planner_profiles` | PK id |

Missing dependency indexes affect scan/lock duration and timeout design; they
do not establish missing records or prevent read-only inspection. No indexes
or schema were changed.

## Triggers and database functions

The public trigger export contains exactly 12 internal FK triggers for the
three profile FKs. No user-defined public trigger, project cleanup trigger or
registry synchronization trigger was returned. The NO ACTION parent-delete
triggers enforce shared profile integrity; child checks are INSERT/UPDATE.
Platform-schema FK triggers do not provide an application-project cascade.

Four public functions were returned, all postgres-owned SECURITY INVOKER,
volatile, executable by postgres/service_role/anon/authenticated:

- `create_workbench_project(text,jsonb)`: inserts only the selected raw master;
  allocates UUID/external ID. It does not maintain project_registry or cascade.
- `enqueue_planner_staged_task(text,text,jsonb)`: locks a shared profile and
  inserts staged JSON under that profile; potential concurrent dependency writer.
- `import_planner_legacy_state(text,jsonb)`: locks profile, checks empty old
  storage, inserts old Parking/queues and saves global legacyImport snapshot.
- `replace_planner_curated_queue(text,jsonb)`: locks profile, deletes the entire
  chosen profile queue, replaces it. It is NOT a project-deletion helper.

The two entries in result 12 are the creation RPC (dynamic EXECUTE text matches
the broad inspection filter) and queue replacement. They do not demonstrate an
existing project-delete function. No delete_workbench_project was returned.
The creation function has empty search_path; the three old functions use public.
Do not invoke any of these for diagnosis.

## RLS and effective access

Result 13 reports schema usage, SELECT/DELETE/INSERT/UPDATE true for all four
roles on all 24 public relations. These are privileges, not row visibility or
view updatability. In particular the UNION ALL view is not a delete target.
Table ACLs grant broad privileges to anon/authenticated/service_role; postgres
has grant options. Column exports include SELECT/INSERT/UPDATE/REFERENCES;
there is no separate column-level DELETE privilege. No public column ACL
override changes the table-grant findings.

RLS is disabled on all public relations except:

- planner_profiles: ALL policy for anon/authenticated, id = default;
- parking_lot, curated_queue, staged_queue: ALL policies for anon/authenticated,
  profileId = default, both USING and WITH CHECK.

Force RLS is false throughout. anon/authenticated do not bypass RLS;
postgres/service_role do. The supplied postgres role is not superuser but does
have BYPASSRLS. Use postgres for the locator so it sees every profile.

**SECURITY INVOKER conclusion:** sufficient visibility/privileges are shown
for the four raw masters and modern core Planner tables. A global complete
cascade covering older profile-scoped dependencies is NOT proven safe for
anon/authenticated: non-default profiles are hidden. No rows were inspected
yet to show whether those profiles have dependencies. A default-only approved
scope plus evidence of all ownership in that scope could support an invoker
design; do not assume it now. No SECURITY DEFINER change is proposed.
No FKs coordinate modern writers; safe future deletion also needs concurrency
protection across verified dependent tables. Holding a master lock alone
cannot prevent a waiting independent writer from adding a dangling reference
after deletion; post-lock existence validation/writer coordination needs design.

## Proposed graph and deletion order (conditional, not executable)

Master UUID/type/verified alias -> direct Planner task/master rows -> generated
weekly/overrides/tombstones -> converted Parking rows and queue references.
Registry/task IDs form a potential bidirectional link, not an enforced FK.
Older recurrence/task/weekly/queue/Parking records add candidate edges requiring
row-value review. Profiles/settings/backups and unrelated resources are excluded.

There is no FK-mandated order among project-owned candidates because no such
FKs exist. A concrete child-first proposal, once every D edge is resolved:

1. Snapshot explicit identities and verified dependency sets in the transaction;
   serialize/revalidate writers; exclude shared settings and conflicting owners.
2. Remove verified owned items in curated_queue/staged_queue and old/modern
   Parking conversions pointing to owned project, task or weekly IDs.
3. Remove verified old and modern weekly occurrences/overrides/tombstones,
   including embedded local checklist/reminder state.
4. Remove verified old repeatable_overrides/repeatable_masters and task_manager
   rows, then modern planner_tasks (series and current queue state embedded).
5. Remove verified exclusively owned project_registry entries and any approved
   historical projects mirror rows. Registry/task circular references impose
   no SQL constraint order, but both sets must be collected before either goes.
6. Remove exactly one raw master by UUID/type last. View changes automatically.

This is an ordered design proposal, NOT a final authorized predicate list.
Actual identity conflicts may change graph membership; no title/category/
recurrence-string ownership heuristic is permitted. Inactive/history records
with proven ownership belong in the same sets. Sequences and external-ID
allocation history are never cascade targets.

## Survive / remove / unresolved

Remove: target master and all B/C records after their identity predicates are
verified, regardless of completed/archived/soft-deleted/generated status.
Remove embedded local owned checklist/reminder/series/queue state with those rows.

Preserve: all other masters, unrelated tasks/weekly/Parking/queue entries,
week-settings, all profiles, legacyImport/global backup/configuration,
Activity/Trips/Calendar records without project ownership, and all allocators.

Still unresolved: registry relationship exclusivity/conflicting linked tasks;
historical projects mirror role; old Planner and recurrence tables' ID aliases
and current writers; typed conversion/provenance vs exclusive ownership;
non-default profile dependencies and intended deletion-role scope; aliases
that match more than one master; inconsistent source/type/parent links.
The dependency scan supplies evidence before asking for row-specific decisions.

## Calendar boundary (no design selected)

Local reminder JSON is B/C when its owner is, but remote Google event resources
are F. Local removal can leave the Google notification event behind. Inspect
provider/eventId/active state on every candidate owning row, including historical
reminderJson. Google-side private plannerTaskId ownership is code-confirmed but
not inspected via API. Historical events can still exist after a local active
flag changes; do not infer their absence. Unrelated imported Calendar events
must survive. No Google call/cancellation or eventual-consistency choice is made.

## Generator readiness and next step

The [generator](../project_deletion_dependency_query_generator.sql) was incomplete
for registry-only outward task links and no-id composite queue rows. It now:

- scans every public base table (the 23 live tables, not the view);
- follows exact matches, row IDs, and explicit candidate registry/task/parent/
  conversion/queue identity fields in both directions needed for discovery;
- includes composite candidate keys, source/type/conversion context,
  history flags, current/historical reminders, series and queue state;
- reports execution identity/BYPASSRLS plus profile-scope row counts.

It remains an overinclusive candidate locator, not an ownership classifier.
Outward traversal can reach another owner; global snapshot matches must survive.
No result authorizes deletion. JSON keys, encoded IDs or text-encoded JSON are
not decoded; field-specific follow-up handles those if candidate evidence
requires it. This schema has native JSONB for the known structured paths.
Run as postgres; do not treat a browser-role scan as complete.

Only static checks were performed on the updated generator; it and its
generated SQL were NOT executed during this review.

Follow [README instructions](README.md#dependency-generator-only-after-schema-review):
replace only first settings UUID and canonical type using an already-persisted
owner-designated disposable project (not either protected project). Run the
generator, review/copy its one inspection_sql cell into a new tab, run that
read-only script as postgres, export all result sections. Require one exact
master and valid_for_review true. Return candidate_reference, profile_scope
and inspection_context results before implementing deletion.
