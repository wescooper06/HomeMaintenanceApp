# Modern-only project deletion: deployed policy and operational runbook

The owner reports the canonical migration applied successfully and the workflow
live-validated. This audit did not connect to Supabase or repeat that validation.
Canonical SQL remains unchanged, including preparation-time comments.
See the [SQL index](README.md) for deployed-history provenance and retained tools.

This owner-approved narrowed policy supersedes the broader historical ownership
review. The fourteen historical ownership queries are not prerequisites.
No live SQL, deletion or Google API is executed by implementation/tests.
The creation allocator/RPC is unchanged.

## Exact scope and ownership predicates

- Master: persisted UUID plus exact home/vehicle/repeating/misc maps to
  projects_home/projects_vehicle/projects_repeating/projects_misc.
  Reject missing/invalid type, missing/nil UUID, not found/type mismatch, or
  UUID appearing more than once in projects_all. No title or prefix heuristics.
- Tasks: planner_tasks.project_id = UUID text, including deleted/history.
- Weekly: project_id = UUID, repeating-only parent_rep = UUID, or
  metadata_json.sourceTaskId / parent_rep equals an owned modern task UUID.
  Conflicting nonempty project/parent/source-task identities abort the whole
  operation; week-settings is always preserved (a matching conflict blocks).
- Parking: converted_to_type true, exact converted_to_id, and conversionType
  project/repeatable -> master; task-manager/ad-hoc -> owned task;
  weekly -> owned weekly row. Untyped/mismatched conversions are not owned by
  this rule and are preserved, not guessed.
- Embedded recurrence, queue, checklist, overrides, tombstones and local
  reminders disappear only with their owned modern row.
- No external-ID aliases are used for modern dependency matching.

Delete order: planner_parking_lot -> planner_weekly_tasks -> planner_tasks ->
exact raw master. Verify counts and read-only projects_all disappearance
before returning success. Any raised error rolls back all preceding deletions.

Excluded stores are never read or written by the RPC: projects, task_manager,
weekly_tasks, repeatable_masters, repeatable_overrides, project_registry,
parking_lot, curated_queue, staged_queue, planner_profiles. Historical and
non-default-profile records there neither block nor cascade. Preserve backups,
global settings, unrelated masters/rows and all sequences.

## Remote boundary

An owned modern task's metadata_json.reminder/reminderJson, or owned weekly
reminder_json/metadata_json.reminder/reminderJson, with active true and eventId,
event_id or Google provider aborts before any deletion. Error details report
table, row identity, path and notification state. Unrelated Calendar rows do
not match merely because of source or title. Explicitly inactive notifications
do not block under the owner's initial policy. No API, outbox or cancellation.

## Transaction, security and concurrency

[Canonical migration](202610250002_project_deletion.sql), owner-reported deployed:
SECURITY INVOKER, empty search_path, fixed table routing, schema-qualified SQL.
EXECUTE is granted to anon/authenticated, not PUBLIC. Existing table grants are
unchanged. The saved live catalogs verify no RLS/custom triggers/FKs on these
modern tables and read/write grants for browser roles. The RPC refuses deletion
if RLS is later enabled on any target table, even for an owner invoker.

All seven raw/modern tables are locked in a fixed order with SHARE ROW EXCLUSIVE
and a five-second timeout before collecting IDs. This blocks conflicting DML
during collection/deletion and serializes concurrent deletions; any lock/error
failure aborts. No sequence function, reset or allocator modification is used.
Creation consumes nextval as before; deleting a row cannot rewind that state.

Important limit: current independent Planner writers have no project FK.
Locks protect the deletion transaction, but cannot permanently prevent a stale
client from submitting a new reference after commit. This implementation does
not claim perpetual referential integrity or change unrelated Planner write
semantics. Refresh stale clients after deletion. A separate writer/FK design
would be needed to prevent all future orphan writes. Real multi-session behavior
requires native PostgreSQL; PGlite exercises transactional rollback but serializes
sessions. Unrelated project writes can wait on these deliberately broad locks.

## UI and application

Existing persisted editors show a red Delete Project button; create/draft editors
do not. Confirmation names title/UUID and warns about permanent modern dependent
deletion. Cancel is local; a synchronous ref guard prevents double-submit.
Persisted Workbench cards with a valid non-nil UUID and canonical source also
show a red Delete Project action immediately after Add to Task Manager. It stops
click propagation and opens the same ProjectEditor confirmation directly, not
the edit form. Cancel closes that card-initiated confirmation without a write.
Both entry points share the existing Workbench deletion callback and RPC path.
Only one deletion RPC is sent, never browser raw-table DELETE or automatic retry.
Errors keep the editor open. Identity/count validation is required for success.
The Workbench-only policy operation is separate from the still-unauthorized
Parking project/repeatable conversion deletion path.
After acknowledged deletion, invalidate caches, close editor and force refresh
Workbench. If refresh fails after commit, explicitly report committed deletion
and request reload rather than retrying deletion.

## Historical deployment order / future separately approved redeployment

Canonical migration SHA-256:
`FE7129F45EE99D9EE649C8E0D0D5332FB789E88FF703A9E455B227CBEA35745F`

Disable script SHA-256:
`DEC01D53ED848B601A4196B53F35D9B78B8A5D213165A98E27F5095F6260BCC4`

Local validation: `npm run lint` passed; `npm test` passed 165 tests with zero
failures and one native-PostgreSQL test skipped (no configured local server).
`npm run build` passed, with Vite's large-chunk warning. Disposable PGlite tests
cover every project type, invoker permissions, child-failure transaction rollback,
remote blockers, excluded-store preservation, sequence preservation, identity and
summary validation, trigger-observed child-first/master-last order, all four
allocator states, and read-only deployment/preview/post-validation SQL. UI tests cover
confirmation/cancellation, duplicate submission, failures, and post-success refresh.
These are not live tests or a native multi-session concurrency test.

1. Review the narrow policy, SQL, local test results and concurrency limitation.
   Ensure complete backup/PITR for raw masters and modern Planner data.
2. In Supabase SQL Editor as postgres, run only
   [202610250002_project_deletion.sql](202610250002_project_deletion.sql).
   Do not run older proposals, creation migration or historical cleanup.
3. Successful SQL Editor execution must finish without errors and commit the
   CREATE FUNCTION, REVOKE and GRANT. The editor may display "Success. No rows
   returned." This alone is not sufficient: run the entire read-only
   [deployment validation](project_deletion_deployment_validation.sql) next
   as postgres, without invoking the deletion RPC. Require the results below.
   No new broad schema inspection is needed for supplied modern columns;
   unexpected live schema changes require re-review.
4. Deploy the application patch only after RPC deployment: npm run lint,
   npm test, npm run build, then publish modern build via normal hosting flow.
   Run the commands sequentially from the repository root. The build generates
   the modern web output in `www/trips` and the Activity bundle in
   `www/activity-planner`. Publish through the existing hosting process,
   preserving the other web entry points; do not upload only `dist/trips`.
   There is no repository-defined web deployment command or CI workflow, so no
   provider-specific publish command is assumed here. This does not require
   an Android/mobile rebuild.
   Existing deployments stay unchanged until the owner performs that deployment.
5. Perform exactly the single test below if separately authorized.

### Read-only deployment validation: expected results

| Section | Expected result |
| --- | --- |
| rpc | One row: function_count=1; returns_jsonb, security_invoker, empty_search_path, anon_execute and authenticated_execute=true; public_execute=false |
| modern_table | Seven rows, exactly the four raw masters and three modern Planner tables; rls_disabled, anon_select_delete and authenticated_select_delete=true in each |
| modern_table_count | 7 |
| view | One row: read_only_projection=true |
| allocator_snapshot | Four rows, one for each PA/PB/PC/PD allocator; increment_by=1, cycle=false; save last_value without advancing a sequence |

If the deployment validation fails, stop before deploying/enabling the UI.
Verify the migration file's SHA-256 against the final delivery before copying its
entire contents into one SQL Editor query; do not execute fragments or older files.
Catalog validation does not prove a byte-for-byte function body match, so retain
the exact deployed SQL and its hash as the deployment record.

## Historical one-project smoke-test procedure

This procedure documents the completed rollout, not permission to repeat a live
test. The old disposable identity may no longer exist. Any future destructive
test needs fresh explicit authorization and a freshly verified disposable target.

Use ONLY the already-designated Home disposable UUID
`3ad885b1-d2dc-43e2-931c-2d802ced63f8`, external ID PA0211, after verifying its
identity has not changed. Do not touch Home Recycle or Repeating Project Test.

1. In [preview](project_deletion_preview.sql), replace only the first UUID
   placeholder in settings with `3ad885b1-d2dc-43e2-931c-2d802ced63f8` and keep
   project_type=`home`. Leave the nil-UUID safety comparison unchanged.
   Run it read-only as postgres. Save the full master and modern dependent IDs,
   row snapshots/counts, four allocator states, and unrelated control snapshots.
   Require matching_type_masters=1 and all_uuid_masters=1, with master.id exactly
   the disposable UUID, master.project_type=home and master.external_id=PA0211.
   The expected_counts row supplies exact expected RPC counts; do not assume the
   earlier zero-dependency inspection is still current.
   Require zero ownership_conflict and zero active_remote_blocker rows.
   Save each control_snapshot.detail object as an array for post-validation;
   require at least one unrelated control row. No artificial live dependencies.
2. Open its Workbench editor. Click Delete Project, inspect title/UUID/warning,
   then Cancel. Verify the button is red. Network must show zero delete RPCs.
   Rerun the read-only preview and compare master/dependent/control snapshots
   and allocator state to prove Cancel made no change.
3. Reopen confirmation and confirm exactly once. Capture one
   delete_workbench_project request and its committed deletion summary.
   Require deleted=true, the exact UUID, project_type=home, table=projects_home,
   external_id=PA0211, counts.projects_home=1, and each modern table count equal
   to the saved expected_counts. Do not click again or issue a manual RPC.
   On timeout/uncertain response, inspect read-only first; never retry blindly.
4. Run [post-validation](project_deletion_post_validation.sql), filling UUID,
   type, saved external ID, all saved dependent ID arrays (empty if truly none),
   preview_identities_copied=true, and expected_controls with the saved JSON
   array of control_snapshot.detail objects. Preserve valid SQL escaping for
   apostrophes in JSON strings (double them).
   Require validation.inputs_ready=true and every remaining count=0:
   raw_uuid_remaining, view_uuid_remaining, view_external_id_remaining,
   tasks_remaining, weekly_remaining and parking_remaining.
   Require control_validation.controls_supplied equal the saved nonzero count
   and all_unchanged=true. Compare allocator snapshots: deletion must not change them;
   concurrent unrelated creates can advance counters, never rewind them.
5. Compare unrelated control snapshots, including protected projects, unchanged;
   verify Workbench refreshed and deleted editor is closed. Refresh Workbench
   again and require the project remains absent. Stop after one
   deletion; no second live create is needed to test external-ID reuse.

The post query cannot discover deleted task IDs after the fact; retain preview.
Excluded historical copies can remain by explicit owner policy.
No sequence was reset or reseeded; the unchanged/nondecreasing Home sequence
retains its high-water mark beyond PA0211. Absence of PA0211 from the view is not
alone proof of non-reuse: compare the saved allocator state as well. Local tests
verify the next creation receives a strictly later number; do not create another
live project to test this.

On **any** failure or unexpected output: stop, do not retry deletion, preserve
SQL outputs/RPC response/network/error evidence, and do not manually delete
remaining rows. Investigate read-only. Disable the workflow if necessary.

## Disable and rollback

[Disable script](project_deletion_disable.sql), **NOT EXECUTED**, revokes browser
function access and drops only the new RPC. It leaves project data, raw grants,
unique constraints and sequences unchanged. Disable/redeploy UI as needed.
It does not restore deleted rows. A committed physical cascade requires the
complete backup/PITR for recovery; Planner export alone omits master projects.
