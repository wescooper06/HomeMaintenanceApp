# Architecture

Life Manager uses a single responsive React shell for web and Capacitor Android.
The [shared router](../src/router/LifeManagerRouter.jsx) renders Dashboard,
Workbench, Planner/Parking, Calendar, Daily Activities and Trips. CSS modules
scope screen styles; shared React navigation is the only active navigation.

Supabase is authoritative for projects, Planner, Trips and Activity Planner data.
Services translate existing PostgreSQL rows into React contracts and report
database/RLS failures explicitly. Reads do not seed, import or reconcile data.
Workbench creates projects through the database allocator RPC, edits existing
raw masters, and permanently deletes through the shared confirmation and atomic
modern-only cascade RPC. See [canonical SQL and policies](../supabase/review/README.md).
Planner user operations retain the current
queue/series/override/deletion contracts; these are not legacy migrations.

Planner's existing Move Task calendar and weekly drag-and-drop both use the
same movement operation. The calendar defaults to the task's current time slot
and also permits selecting Morning/Afternoon/Evening before choosing a date.
Moves preserve weekly record IDs, project/source links, checklist, completion
and reminder data; only date/slot and a repeating instance's override marker
change. The Supabase storage adapter updates the existing weekly row rather
than tombstoning and recreating it.

Weekly cards persist container-local, zero-based positions in
`planner_weekly_tasks.metadata_json.weeklyPosition`. Rendering sorts valid
non-negative safe-integer positions first, then uses ascending record ID to
break ties and order older/unpositioned rows. Reads do not backfill metadata.
Weekly drag targets accept before/after a card or the end of a container.
Reordering normalizes the destination's visible cards to consecutive positions,
preserving all other metadata and task fields. No-op drops do not save.
Cross-container moves (including Move Task) append unless a drag supplies an
explicit insertion target. Repeating occurrence identity and curated/checklist
ordering are independent of weekly positions.

## Planner persistence and Project checklist policy

Weekly snapshot saves are upserts of changed supplied records, not replacement
of the database collection. Missing rows (including other weeks, filtered or
stale client rows) are never deletion intent. Intentional removal supplies exact
weekly IDs in `deletedTaskIds`; the data-access boundary requires
`deletedWeeklyTaskIds` before transitioning an active row to either tombstone
flag. Recurrence exceptions retain their occurrence identity and suppression
tombstones. Project deletion remains the separate UUID/type-scoped cascade RPC.

Recurrence edits reconcile all loaded generated occurrences in the selected
scope, including future weeks not currently visible. A date still present in
the edited pattern continues the same row: only its bucket and recurrence
change, retaining its revision, checklist IDs/order/completion, task completion,
reminder data and unrelated state. Overridden or deleted occurrences are not
rewritten or revived. Generated dates no longer in the pattern are explicitly
tombstoned with their history retained; newly scheduled dates have new
deterministic date identities and start as normal new generated occurrences.
Historical checklists are not transferred between different date identities.

Repeatable-container placement resolves the exact series/occurrence date before
changing the master. Either deletion flag blocks placement with a
`previously-deleted` outcome; it never restores a tombstone. An active match
returns `already-scheduled`, `existing-bucket`, or `moved`, reporting its effective
location without changing the occurrence or master. Duplicate or conflicting
ownership fails closed. Only an unoccupied occurrence identity may be created.
Placement returns `{status, taskId, projectId, occurrenceDate, date, timeSlot}`;
`created` is reported only after the master and weekly saves complete and the
exact occurrence is active at the requested date/bucket. Persistence errors
reject through controller error reporting. These separate saves are not atomic:
partial persistence is reported explicitly, without automatic rollback or retry.
Concurrent placement of the same series in one controller is blocked while saving.
This corrective policy does not introduce a deleted-occurrence restoration action.

Weekly edits compare the loaded/submitted baseline with a fresh read, skip
unchanged rows, and condition existing-row updates on their exact `updated_at`
revision (including null). Conflicts surface an error and block further
controller edits until reload. Navigation checks the expected selected week.
This is per-row optimistic concurrency, not an atomic multi-row transaction:
an operation can partially persist before a later conflict. Distinct-ID
concurrent occurrence inserts still need a transactional assignment RPC and
database-enforced identity/uniqueness rules; clients must not assume the current
read-before-insert check is a cross-client lock.

Ordinary Project assignment means continuation: exactly one active unfinished
explicitly linked occurrence is moved, preserving its ID, checklist definition,
checked states, reminder and unrelated metadata. Only scheduling fields and
container ordering change. Multiple unfinished occurrences or conflicting
ownership produce a review error, never an arbitrary selection. Moving to a
different week does not imply fresh work.

The separate **Start fresh task** action requires an explicitly approved master
template. The versioned typed definition uses the existing JSONB column:
`planner_tasks.metadata_json.checklistTemplate = {version: 1, items: [{id, text}]}`.
Item IDs are unique nonempty strings, text is nonempty, array order is
authoritative, and items cannot contain completion state. Fresh occurrences
retain those stable definition IDs but initialize each `completed` to false.
Existing `planner_weekly_tasks.checklist_json` history is never rewritten.
The weekly-card **Use this checklist for future tasks** action explicitly
approves the visible definition on its uniquely resolved master. Later checklist
edits do not silently change the approved template; approve again deliberately.

No physical schema migration or automatic historical backfill is required for
this contract. Template approval is a separate user write, not a load-time
repair. With no unfinished occurrence and no approved template, historical or
tombstoned checklist evidence blocks assignment pending review; it is never
chosen by title or recency or automatically revived. Only a genuinely new
Project without matching checklist history may receive an initially empty
ordinary occurrence. Incident exports and recovery packages are local-only
evidence and are not application inputs or deployment artifacts.

Google Identity Services authorizes Calendar explicitly. Calendar event CRUD and
notification services call Calendar API directly. There is no Sheets/Apps Script
backend, global authentication/config loader or local Planner storage fallback.
The tested modern Planner JSON backup API retains conflict-checked, insert-only
restore (the API is not currently mounted as a browser backup panel);
historical formats are permanently unsupported.

Planner JSON covers modern Planner tasks, weekly/Parking state and week settings,
not master projects or a full database/Calendar backup. Disabling a deletion RPC
does not restore committed rows; destructive recovery requires Supabase backup/PITR
covering the relevant tables. No automatic historical restore or Google cleanup
is part of project deletion.

The [Trips package](../trips/README.md) supplies Vite and dependencies; application
source lives in `src`. Main production output is `dist/trips`; Capacitor copies
that output to Android. Build publishing also updates `www/trips`.
Historical reconciliation records in `spec` are documentation only and must not
be deployed or used as application inputs.
