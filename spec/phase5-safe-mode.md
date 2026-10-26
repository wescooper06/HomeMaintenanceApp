# Phase 5 Safe Mode: parity evidence and cutover preparation

Historical non-runtime record. Safe mode and legacy import were subsequently
retired. The temporary project export mentioned below has been removed; retained
summary/crosswalk evidence is documentation, never a runtime restore input.
See [current architecture](architecture.md).

## Current directive: live Supabase only; historical backup excluded

The owner withdrew legacy backup content from cutover entirely. Production
backup UI rejects historical envelopes before conversion or storage access.
Local web/mobile/Capacitor entry/assets now use the modern React shell; no
historical insert was attempted or retried. All legacy implementations remain
retained in safe mode. See the [modernized build report](phase6-modernized-build.md)
for current status; migration discussions below remain historical only.

## Cutover-readiness evaluation

**Subsequent Phase 6 result:** the owner-authorized non-conflicting-only merge
passed preview but the database rejected unchanged task ID `task-home-194` as
invalid UUID syntax on the first insert. Zero rows were inserted and before/after
Planner state/settings were unchanged. No substitutions, retries, entry/build
switches or retirements occurred. See the [execution report](phase6-cutover-execution.md).

The owner has accepted the reconciliation decisions as complete in safe mode.
The subsequent [readiness evaluation](phase5-cutover-readiness.md) assesses
execution, not renewed owner consent. Current verdict: **CUTOVER-READY for an
owner-authorized execution attempt, not verified database compatibility**.
Safe mode remains active; the [Phase 6 plan](phase6-cutover-plan.md) is prepared
but not executed.
Production import now consumes the exact saved crosswalk, retired-ID exclusions,
task/recurrence/queue/Parking adapters and import-only event-local date policy.
Master `107` is accepted without independent corroboration or generated identity.
Title/property/row identity fallbacks are disabled in modern and retained
Planner/Parking/Calendar/mobile consumers; Dashboard is unchanged.

`106` is preserved exactly and owner-authorized, with no correction, inference
or substitution. Legacy import passes this value unchanged without client syntax
rejection. Actual database errors propagate; owner authorization cannot change
UUID storage rules. The two named curated weekly rows are now authorized orphans,
retaining empty links without identity inference. Legacy preview skips project
target reads/checks; availability/constraint satisfaction is an owner assumption,
not verified evidence. Modern backup validation remains strict.

Final owner-exception validation: **190 tests passed, zero failures/skips**;
both production builds passed in memory, focused lint/syntax checks passed,
and 242 files stayed unchanged during validation. Offline preview proposes
79 inserts with zero application conflicts under matching fixture week
settings. No real import, deployment or database-compatibility certification
is claimed.

Parking notification/recurrence, Calendar lifecycle edge cases and Dashboard
semantics are frozen by owner instruction for post-cutover modernization; they
are no longer requests for pre-cutover behavior changes. No destructive operation,
protected retirement, static/mobile build switch or live write occurred.

Latest accounting: 73 weekly rows become 64 retained plus nine retired/excluded;
nine task-manager and six recurrence rows become 15 task rows, including sparse
master `107` under its explicit existing identity. See the readiness report for
current measured validation.

Prior resolution validation: **187 tests passed**, both production builds passed in
memory, focused lint/syntax/whitespace checks passed, and 242 files stayed
unchanged during final validation. No live service requests or writes occurred.

## Historical reconciliation/preparation notes (superseded above where noted)

The user subsequently approved SMS backend retirement, old mobile/static build
retirement and deployed Workbench edit-only behavior. The historical safe-mode
statuses below describe the original verification run, not a withdrawal of those
approvals. The supplied `supabase/projects__all_exports.csv` has now been checked
against the repository backup offline: see the
[reconciliation report](phase5-backup-reconciliation.md).
Initially it established 8 event references and 19 unresolved project/master
references. The subsequent owner crosswalk verifies 11 project mappings and
explicitly retires 4. The owner now explicitly accepts `101`, `102`, `106`, `107`
without corroboration for safe-mode reconciliation. Three valid UUIDs are
retained as plan-only targets; `106` remains syntactically malformed and is not
usable as a UUID. Nine dependent weekly rows are excluded from future import.
The owner decisions are saved verbatim in
[the identity map](phase5-project-identity-map.json).
Owner decisions are complete; executable readiness is separate. No protected cutover or legacy
deletion is authorized by a fabricated mapping; the data and local parity gates
remain unpassed.

### Prior safe-mode cutover preparation (historical)

All 19 numeric references have explicit owner decisions; lack of corroboration
for the allowlisted identities is no longer treated as missing owner consent.
Reports distinguish verified UUIDs from plan-only UUIDs and retain null
retirements. This does not certify target existence, change runtime import
behavior, create project rows or override UUID validation.

| Area | Next readiness evidence / implementation needed | Current status |
| --- | --- | --- |
| Identity/backup | Correct UUID syntax for `106`; implement/test explicit task/queue/recurrence adapters and retired-row exclusions; decide date-only conversion for two offset timestamps and missing curated links | Plan prepared, not import-ready |
| Planner/Parking | Preserve root recurrence fields through archival; reconcile active notification lifecycle before soft deletion; test failure recovery without live writes | Not cutover-ready |
| Calendar | Fixture proof for external deletion/account changes, preserve absolute-time reminder behavior, confirm notification UX | Not cutover-ready |
| Dashboard | Accept or implement old nested-day/current-week/all-day/tombstone display semantics | Not cutover-ready |
| Workbench | Deployed edit-only acceptance is recorded; retain ID/source and conversion-policy regressions through shared entry migration | Policy accepted; shared cutover pending |
| Trips/navigation/mobile | Verify production bases, routes, static/mobile replacement and rollback under offline fixtures before replacing entry points | Retirement approved; implementation cutover pending |

The report explicitly sets `cutoverReady: false` and
`destructiveOperationsAllowed: false`. Future planning may use owner-authorized
uncorroborated identities, but import must explicitly validate target constraints
or surface rejection without project creation or local success fallbacks.
All protected entries, static/mobile builds and legacy modules remain retained.

Current policy validation: **171 tests passed, 0 failures, 0 skipped** across
14 test files, including 16 reconciliation fixtures. Both production builds
pass in memory. Integrity checks covered 107 input/protected/backend/generated
files with no changes or removals during validation. No live writes occurred.
The original safe-mode results below remain historical.

## Status and safety boundary

Phase 5 is **preparation only**, not a completed Modernized Build or deployment.
No protected entry was switched, no legacy implementation was deleted, and no
backend, manual migration workflow, static compatibility URL or old build was
retired. All 29 isolated implementations remain legacy-active.

This report supersedes any interpretation of passing Phase 4 tests as approval
to remove protected consumers. See the
then-current legacy dependency map (subsequently retired) and
[Phase 4 implementation report](phase4-migration.md).

## External gates recorded from the user

| Gate | Confirmed status | Evidence needed to unblock |
| --- | --- | --- |
| Apps Script SMS triggers | **Unknown / not reviewed** | Authorized owner reviews and cancels/reconciles all pending triggers outside the app; records disposition and confirms no remaining protected callers |
| Legacy backups and project-ID mappings | **Not yet inventoried** across actual users/devices | Collect authorized local backup inventory, validate every shape/key, reconcile project/recurrence IDs against an approved Supabase identity export, review ambiguous/unmapped records |
| Old mobile/static builds and compatibility URLs | **Unknown / still supported** | Inventory installed Android/mobile/static versions, entry URLs, cached assets and rollback consumers; approve their retirement and modern deployment |
| Workbench edit-only policy acceptance | **Not yet verified in deployed UI** | Owner accepts denied create/delete/type-move behavior, permitted edits, agent messages and conversion restrictions in deployed modern UI |

Local repository inspection partially advances the backup inventory; it does
not resolve the external gate or imply all user backups have been collected.
No OAuth token, project record, backup record or identifier value is included in
this report. Inspection and tests did not contact Supabase, Sheets, Apps Script
or Google Calendar.

## Protected consumer and screen cutover matrix

| Screen / consumer | Current protected implementation | Modern target | Evidence / remaining gate | Cutover status |
| --- | --- | --- | --- | --- |
| Dashboard | `www/js/router.js` loads `www/screens/dashboard/dashboard.html` and isolated Dashboard JS/CSS; old local weekly `days` layout | `src/pages/Dashboard/`, `dashboardService.js` | Fixture ordering/count/preview comparison passes for equivalent rows. Legacy nested-day vs modern dated-row semantics and tombstone/all-day display differences require acceptance; project/state migration and shared entry/static gate remain | **Blocked; not switched** |
| Planner | Protected router loads isolated Planner, CalendarWidget, move dialog and storage services; mobile has its own Planner implementation | `src/pages/Planner/`, `plannerService.js`, Supabase adapters | Existing recurrence, weekly moves, exceptions, queue/checklist and backup tests pass. Real backup dates/IDs/other local keys remain unresolved; SMS/account/external-event lifecycle and mobile UX need verification | **Blocked; not switched** |
| Calendar | Isolated web Calendar; mobile directly uses Calendar API and PlannerStorage | `src/pages/Calendar/`, `calendarService.js`, `calendarReminderService.js` | Fixture CRUD, all-day/multi-day mapping, ownership, retry, cancellation and failure tests pass. External notification delivery, account switches, externally deleted owned events and pending SMS remain gates | **Blocked; not switched** |
| Workbench | Isolated Workbench/agent plus mobile Workbench and Sheets projects | `src/pages/Workbench/`, `workbenchService.js`, `projectPolicy.js` | Form/agent/storage denial, existing raw-table edits, source-aware filtering/grouping and metadata preservation covered. Deployed policy acceptance and ID reconciliation still required | **Blocked; not switched** |
| Trips | Protected router retains `www/screens/trips/trips.html` iframe pointing to `/trips/index.html`; isolated JS initializes wrapper | React Trips routes/services, without protected iframe | Existing Trips Supabase fixture suite covers data/workflow/timeline. Static deployment base URLs, old packaged assets, iframe replacement and installed clients still need acceptance | **Blocked; wrapper retained** |
| Parking | Nested protected Planner component and mobile flows, not an independent top-level protected route | React Planner Parking components and modern conversion functions | Exact payload/metadata and actual-storage conversion restrictions covered. Active-reminder archival and root-level recurrence round-trip need further work/acceptance; project-create conversions intentionally denied | **Blocked; not switched** |

Old mobile screen names are `workbench`, `planner`, `calendar`. Dashboard and
Trips are protected web routes, not additional mobile screen names. Parking is
embedded in Planner. Do not treat modern hash-route existence as proof that an
old mobile/static client has migrated.

### Shared consumer chain

1. `www/index.html` still loads isolated auth/config, weekly migration/restore
   helpers and `www/js/router.js`.
2. The protected router still fetches screen HTML and isolated JS/CSS and mounts
   isolated shared navigation; changing one screen cannot retire shared modules.
3. `www/mobile/index.html` still loads isolated config/UUID, both manual helpers,
   Sheets/projects/PlannerStorage, isolated Calendar and `mobile.js`.
4. `www/components/nav/nav.js` and `nav.css` remain compatibility loaders for
   older generated clients. Modern standalone navigation intentionally links
   back to protected static entries outside development.
5. Android/`dist`/existing static React output is retained, not rebuilt/synced.
   Source-only build success does not verify deployed UI or installed consumers.

## Repository backup inventory (read-only)

One backup-named JSON file was found in this workspace:
the backup originally stored under `www`, now retained only as
[historical evidence](historical/localStorage_backup_2026-08-13.json).
Only aggregate structure/counts were inspected; the file was not changed or
imported. Files elsewhere, browser storage and installed devices were not read.

| Key | Observed shape / count | Modern import coverage / unresolved work |
| --- | --- | --- |
| `hm_weekly_planner` | JSON string containing `{ tasks, weekStartDate }`; **73** rows | Shape recognized, but current file is rejected for invalid weekly dates; repair needs explicit review, not automatic coercion |
| `hm_task_manager_tasks` | JSON-string array; **9** records with stable `taskId`, project/source/state/priority/order fields | Not imported from legacy envelope; needs deliberate task/queue metadata mapping |
| `hm_repeatable_tasks` | JSON-string array; **9** overrides, **2** missing `id`/`taskId` | Modern legacy-envelope importer does not migrate this key; project-based recurrence identity needs reconciliation |
| `hm_sheet_write_retry_queue` | JSON-string empty array | No replay; nonempty queues elsewhere require reconciliation to avoid duplicate writes |

Weekly structural findings:

- Stable weekly IDs are present and unique in this file; task-manager IDs are
  also present and unique.
- **2** non-deleted weekly rows have invalid dates; **2** nonempty occurrence
  dates are invalid. No dates were inferred, normalized or repaired.
- **6** weekly rows are deletion-instance tombstones; **33** carry metadata;
  **2** carry nonempty checklists; **1** has an active reminder.
- There are **27 distinct non-UUID project/parent references** across the three
  record groups. Non-UUID does not prove an invalid legacy identifier; it proves
  no UUID mapping can be assumed. No Supabase lookup was performed.
- Two repeatable records lack an explicit ID. They must not be merged as a
  supposed duplicate merely because both IDs are absent.
- Recorded weekly slots are morning/afternoon/evening.

Code also references `hm_parking_lot`, `hm_planner_curated_tasks` and
`hm_weekly_planner_queue`, absent from this backup. Absence in one file does
not establish absence on other devices. Legacy Dashboard reads a separate
`{ weekStart, days }` layout; modern import rejects days-only layouts.

### Project-ID reconciliation procedure (not executed)

Legacy project normalization keeps a source-tab ID when supplied, otherwise
generates a source/title/index ID; sheet row metadata also influences identity.
Modern project hydration exposes `projects_all.id`, `project_type`, and
`external_id` with existing source-table data.

Obtain an owner-authorized local identity export, then reconcile each legacy
reference using source/type plus external ID and verified row provenance.
Require a unique match and an explicit decision for missing/ambiguous mappings;
titles/indexes alone are not authoritative. Include weekly `projectId`,
`parentRepeatableId`, task-manager project links, repeatable overrides and
Parking conversion targets. Preserve stable task/instance IDs, override dates,
checklists and tombstones; never insert projects or widen RLS to make an import
appear successful. Preview with fixtures before an authorized real import.

## Behavior mapping and explicitly unpassed parity

- **Weekly/recurrence:** modern Supabase metadata carries overrides, weekday/
  interval rules, exception identity and deletion markers. Existing legacy-vs-
  React transition tests remain. Backup compatibility does not imply that
  separate legacy repeatable/task/queue keys have been migrated.
- **Parking conversions:** actual edit-only storage rejects project/repeatable
  creation before mutations. Task-manager conversion uses database IDs, not
  parking IDs. Weekly-to-Parking archival preserves checklist/reminder JSON,
  nested metadata and conversion target, and soft-deletes the weekly row.
- **Known lifecycle gap:** Parking archival can preserve an active reminder and
  soft-delete its weekly row without cancelling its Google notification. The
  Planner controller's removal guard does not cover this separate service path.
  A passing characterization test records the gap; it does **not** approve it.
  Define/test cancellation or explicit archival policy before Parking cutover.
- **Known metadata boundary:** weekly-to-Parking conversion copies `source.metadata`,
  not every root weekly recurrence field. A fixture proves nested recurrence
  identity survives only when present in metadata. Full root-field round-trip
  parity is not claimed.
- **Dashboard:** ordinary current-week rows preserve day/bucket ordering,
  counts and first-five preview. Legacy counts nested tombstones; modern hides
  `deletedInstance` and ignores all-day slots. The differing old/new storage
  layouts and current-week behavior need explicit UX acceptance, not a hidden
  compatibility rewrite.
- **Backup:** supported array/object JSON-string variants preserve identity,
  spelling alias, checklists and metadata. Missing IDs/invalid dates/unmapped
  references reject without writes. Modern conflict-safe insert-only merge is
  intentionally different from legacy upsert/generated-ID behavior.
- **Reminders:** fixture ownership/retry/mapping/cancel coverage is not proof of
  pending-SMS disposition, notification delivery or cross-account lifecycle.
- **Agent/projects:** create/delete/type-move remain explicitly denied; no fake
  local success. Existing editing behavior and denied conversion UX still need
  deployed acceptance.

## Conditional readiness and screen-by-screen cutover plan

No module is unconditionally cutover-ready. The following replacements are
**implementation/test-prepared**, subject to all associated local and external
gates:

| Prepared replacement | Candidate legacy group | Next cutover steps after gates pass |
| --- | --- | --- |
| Modern navigation, auth/config and scoped styles | auth/config, nav trio, main CSS, UUID | Verify production base/deep links and token/session behavior; inventory old loader callers; deploy approved entry then remove loaders only after last consumer |
| Dashboard React summary | Dashboard JS/CSS | Accept data-layout/count differences, verify reconciled data and deployed summary, then update protected route |
| Supabase Workbench and policy | Workbench/agent JS/CSS and project services | Accept deployed restrictions and conversions; verify data IDs and mobile behavior; switch route then retire last shared caller |
| React Trips/data/workflow/timeline | Trips wrapper JS/CSS and iframe template | Verify deployed routes/deep links and replacement build URLs; switch route, verify installed/static clients, then retire wrapper |
| Planner/Calendar/Parking React services | Planner/Calendar/parking implementations and storage | Resolve backup/reference/lifecycle gaps, review SMS, verify responsive protected flows with isolated fixtures, deploy and approve per-screen cutover |
| Modern versioned Planner JSON UI | Weekly migration/restore and task-manager helper | Complete cross-device inventory, date repair decisions, mappings and missing-key migrations; approve manual-flow replacement before helper retirement |

For each eventual screen: verify fixtures and accepted behavior differences;
prepare production entry/route/assets and rollback path; obtain deployment
approval; switch only that screen; verify no legacy requests for its new runtime
without live mutations; retain shared implementations until every consumer is
gone. Full retirement must then pass modern plus retained legacy regression
coverage before the final Modernized Build report.

## Verification and deliverables

New `tests/phase5-safe-mode.test.cjs` adds nine offline tests: Dashboard equivalent
ordering/count/preview and known differences, read-failure propagation, legacy
JSON shape matrix and restore comparison, rejection without writes, read-only
repository-backup incompatibility, Workbench filtering/grouping/policy, and
retained protected/mobile/Trips/nav consumers.

Three added `tests/planner-supabase.test.cjs` fixtures verify actual denied
Parking project conversions, weekly metadata archival, and the explicit active-
reminder archival gap. Existing Calendar lifecycle, recurrence, conversion,
navigation and Trips suites remain part of the full run.

All fixtures inject local storage/API doubles; new VM fixtures prohibit network
access. The repository backup is read structurally, never submitted to a service.
No browser CRUD, live writes, schema deployments, remote cancellation or trigger
review was performed.

Final measured results:

- **155 tests passed, 0 failures, 0 skipped** across all 13 repository test files,
  including the 12 new Phase 5 parity/characterization fixtures.
- Both main React and standalone Activity Planner production builds passed
  **in memory**, with legacy-global/endpoint exclusion checks. Existing
  activity/trips fixtures also remain green.
- SHA-256 integrity check across **105 files** covering protected web/mobile
  code, isolated implementations (excluding this documentation's dependency map),
  the original backup, Apps Script backend and existing generated assets:
  **0 changed/removed, 0 added**. Build tests separately verify no `www` writes.
- Production-source code, imports and navigation are unchanged in safe mode.
  Only test coverage and reports/dependency documentation were added/updated.
- Protected runtime still intentionally requests legacy assets. Modern build
  isolation passes; a claim of zero legacy requests across protected clients
  would be false until the gated cutover occurs.
- No live database/Calendar writes were made. Browser/deployed UI acceptance,
  installed-client checks and trigger review remain unperformed external gates.

Retired legacy modules: **0**. Protected cutovers: **0**.
