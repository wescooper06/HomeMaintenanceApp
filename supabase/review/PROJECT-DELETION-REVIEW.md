# Workbench project deletion: characterization and inspection gate

The subsequently supplied live catalog results are now reviewed in
[LIVE-SCHEMA-REVIEW.md](project-deletion-inspection/LIVE-SCHEMA-REVIEW.md).
That review supersedes the missing-catalog findings below: dependency inspection
is ready as postgres, while deletion implementation/deployment remains gated.

**BLOCKED pending live dependency/schema review. No deletion SQL/RPC has been
implemented or executed. No live connection, write, or deletion was performed.**
The owner approved permanent cascading removal of genuinely project-owned
records, including inactive/history rows. That policy does not establish
ownership of arbitrary references or authorize deploying a new RPC.

## Historical findings

At `f416bec^`, historical `www/screens/workbench/workbench.js` rendered a red
Delete action on project cards. It used `window.confirm`, naming the project,
disabled the clicked button, called the Sheets delete service and refreshed.
The service posted `deleteProject`, with ID/source/tab/row/title hints,
then verified disappearance and could retry up to three times.

Historical `google-apps-script/Code.gs`, `deleteProjectByIdentity`, physically
deleted one sheet row. It tried row hints and multiple project tabs and had
title-assisted identity checks. Its request branch returned immediately after
that operation. It did not remove/detach Planner tasks, weekly entries, Parking
conversions, recurring instances, reminders or recurrence masters. It did not
block on dependencies or soft-delete/archive the project. The separate
ProjectsService delete helper only removed an item from its unified memory list.
None of these identity heuristics or transport retries is appropriate to restore.

## Code-confirmed modern references (not yet a complete live inventory)

| Storage | Explicit references and owned data | Evidence |
| --- | --- | --- |
| Four raw project tables | `id` UUID, `external_id`; `metadata` may contain additional imported identity evidence | [data access](../../src/services/plannerDataAccess.js) |
| `projects_all` | Read view over four raw tables; never a delete target | [saved live view fixture](../../tests/fixtures/workbench-live-schema.cjs) |
| `planner_tasks` | `project_id`, `source`; `metadata_json.series` recurrence master/override configuration; `metadata_json.queue` and `queueOrder` implement curated/staged queues; `deleted` history remains a dependency candidate | [data access](../../src/services/plannerDataAccess.js), [storage](../../src/services/plannerSupabaseStorage.js) |
| `planner_weekly_tasks` | `project_id`, `parent_rep`, `metadata_json.sourceTaskId` (may point to a task rather than a project); generated occurrences, overrides, deleted-instance tombstones; embedded `checklist_json`, `reminder_json` | Same adapters and [Planner lifecycle](../../src/services/plannerService.js) |
| `planner_parking_lot` | `converted_to_id` plus `converted_to_type` and `metadata_json.conversionType`; conversions may target `project`, `repeatable`, a task, or a weekly row; embedded checklist/reminder/metadata | Same adapters |
| Explicit external-ID aliases | Planner resolves `externalId`/`external_id` and project links via explicit UUID or external ID; ambiguous matches are errors | [Planner identity resolution](../../src/services/plannerService.js) |
| Older Planner migration tables | `parking_lot."convertedTo"`, `curated_queue.item`, `staged_queue.item`, `planner_profiles."legacyImport"` exist in saved DDL; current adapter does not use them. Live presence/ownership must be established. Global profile/import/backup data is NOT automatically project-owned | [earlier migration](../migrations/202610230001_planner_remaining_state.sql) |
| Calendar imports | Weekly rows with `source = google-calendar` use Google event IDs, not automatically project UUIDs. Unrelated Calendar rows/events must survive | [Calendar service](../../src/services/calendarService.js) |
| Owned remote notifications | Google event `extendedProperties.private.plannerTaskId` points to a Planner task; local weekly `reminder_json` retains event ID/provider/active state | [reminder service](../../src/services/calendarReminderService.js) |
| Modern backups | Exported task/project/parent/conversion identities; project rows themselves are not backed up here. Files/global import snapshots are not cascade targets | [backup service](../../src/services/plannerBackupService.js) |

No explicit project link was found in the inspected Trips/Activity adapters;
this does not prove there are no such links in the live database. Inspect all
application tables, including unexpected/custom schemas and JSON data.
Merely containing an identical string is not proof of ownership.

## Security and atomicity

The saved project inspection showed RLS disabled, broad raw-table grants and
no incoming project FKs or non-internal triggers at inspection time. It did
not supply full Planner-table columns, FK actions, triggers, policies, grants
or visibility. Those must be inspected now. A SECURITY INVOKER RPC cannot
safely conclude "no dependencies" if RLS hides some dependencies. Do not switch
to SECURITY DEFINER merely to bypass that uncertainty.

Multiple browser DELETE requests cannot meet rollback requirements. After
inspection, use a fixed-route `delete_workbench_project(p_id uuid, p_type text)`
RPC with explicit allowlists, exact UUID/type validation, missing/mismatched
identity errors, a bounded lock timeout, verified deletion counts and master
deletion last. Locking the master row alone is insufficient: current Planner
writers have no proven project FK and may insert concurrent dependencies.
The reviewed design must serialize dependency writes/deletes (for example,
appropriate table locks covering every writable dependent table), account for
RLS, triggers and FK cascades, and reject conflicting ownership rather than
delete unrelated rows. No allocator operation is needed or permitted.

Tentative order, subject to actual constraints: owned Parking/conversion rows
and any children of weekly/tasks; weekly generated/overridden/history rows;
task/series/queue rows; any other verified dependent rows; exact master last.
Embedded checklist/reminder/queue JSON disappears with its owning row, not
through global JSON cleanup. Incoming FKs may require another order.

### External Calendar boundary still needs an explicit design decision

PostgreSQL cannot atomically delete a Google Calendar event and roll it back.
Existing Planner lifecycle code requires cancellation of active notifications
before removing their local records. Deleting a local row alone can leave an
orphaned scheduled notification. Options requiring owner review:

1. A durable, idempotent notification-cleanup outbox, written in the same DB
   transaction, with separately authorized Google cleanup and explicit
   pending/failed status. Database deletion is atomic; remote cleanup is
   eventually consistent, not atomically committed with PostgreSQL.
2. Owner-confirmed notification cancellation before master deletion, clearly
   acknowledging that cancellation cannot be rolled back if DB deletion fails.

Neither option is implemented or silently assumed. Do not delete unrelated
imported Calendar events. The owner cascade policy is accepted; this boundary
is about external side effects and honest atomicity, not blocking on history.

## Read-only next steps

1. Run [schema inspection](project_deletion_schema_inspection.sql) in Supabase
   SQL Editor as the owner; export the single result as CSV. It reports all
   non-system relations, columns/defaults, constraints/FKs, indexes, triggers,
   policies, ACLs and effective role privileges. It returns function/trigger
   definitions as text only. Review custom non-public tables too.
2. In [dependency query generator](project_deletion_dependency_query_generator.sql),
   replace only the nil UUID and `home` with a specific persisted UUID and
   canonical type. Run it, then copy the returned `inspection_sql` cell into a
   new tab, review and run that read-only script. Export its result.
3. Expect exactly one matching master. Zero or multiple matches invalidates
   the diagnosis. The script includes inactive/soft-deleted rows and follows
   candidate row IDs transitively through exact JSON/string scalar matches
   across public base tables. It reports relation, row ID, candidate field and
   matched identity; **these are discovery candidates, not a deletion list**.
   A self-ID match, global snapshot, another project, or unrelated metadata
   string is not ownership. Encoded IDs, JSON keys, non-public tables, computed
   references and external services require additional targeted inspection.
   No title, prefix, category or recurrence-text ownership heuristic is used.
4. Review the actual columns/constraints and candidate references; produce a
   field-specific dependency query and final deletion plan from that evidence.
   Inspect any remaining ambiguous external-ID aliases with explicit type and
   ownership checks. Do not run a candidate-discovery query as a cascade.
5. Return those results and select the Calendar cleanup semantics above.

Both files use READ ONLY transactions. The generator emits SELECT-only SQL;
it does not execute generated SQL. They are outside the migration directory
and have no application/build execution hook.

## Deferred implementation, validation, rollback and one live smoke test

The red existing-project-only confirmation UI, service path, unapplied RPC,
rollback and targeted post-delete validation SQL must follow schema review;
they are intentionally not fabricated before it. Existing deletion remains
unauthorized in [projectPolicy](../../src/services/projectPolicy.js).
No application code changed in this characterization step.

Then add local UI/data-access/transaction tests for all owner-requested cases,
including race protection, rollback on dependent-delete failure, historical
ownership, visibility, RLS, sequence preservation and next-ID non-reuse.
Rollback of an unapplied/deployed delete RPC means removing execution access
and the function, not recreating deleted data. A committed physical cascade
has no automatic undo: project plus dependent records require an owner-held
complete database backup/PITR, not only the Planner export.

After explicit deployment authorization and complete local validation, choose
one newly owner-designated disposable project (NOT Home Recycle or Repeating
Project Test). Inventory and back up its exact UUID/type/external ID and
verified dependents, record sequence states and unrelated control rows, and
resolve notification ownership. Open its editor, cancel once and verify zero
writes, then confirm Delete Project exactly once. Capture the committed RPC
summary. Read-only validation must show absence in the exact raw table/view
and every reviewed dependent predicate, unchanged unrelated controls, and
unchanged sequence states. Verify Workbench refreshed. Do not retry on timeout;
inspect the transaction outcome first. **This is a gated future test plan,
not permission to test now.** Final field-specific SQL and deploy instructions
will be supplied only after live schema review and implementation.
