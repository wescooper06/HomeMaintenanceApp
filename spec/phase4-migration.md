# Phase 4: protected-screen parity and retirement gates

## Approved behavior decisions

- Google Calendar notifications replace SMS intentionally. This does not migrate
  pending Apps Script triggers or deliver SMS.
- Keep current Supabase raw-project edit-only restrictions. Agent creation must
  fail explicitly; never simulate local project creation or broaden RLS.
- Local JSON export/import with React UI, validation and preview. Merge by stable
  ID, reject conflicting existing rows, never delete or overwrite existing data.
- Keep protected entry behavior until all parity gates pass. Do not remove a
  module merely because the modern React consumer has been replaced.
- No live database writes, schema deployments, scheduled jobs, or real Google
  Calendar writes are part of validation.

## Behavior inventory and migration plan

| Behavior / legacy consumer | React replacement | Parity / retirement gate |
| --- | --- | --- |
| Manual weekly backup restore (`js/migration/weekly-planner-restore.js`) and local migration (`weekly-planner-migration.js`) | Versioned Planner JSON export/import, legacy weekly JSON adapter, preview and explicit restore UI | Conflict-safe insert-only restores; no automatic import, SMS scheduling, credential import or unrelated localStorage import. Retain manual legacy entry until protected web migration. |
| Apps Script `sendReminder`, `resetReminder`, `deleteReminder` | Module-scoped Google Calendar reminder service with explicit authorization, stable event identity, persisted mapping and visible cross-service errors | Notifications rather than SMS is approved. Existing Apps Script triggers must be reviewed/cancelled outside the app before backend retirement. |
| Calendar event reminders | Direct Calendar API `reminders` updates from React event details | Preserve event data, control popup notification lead time, and report failures. |
| Planner Sheets/local snapshots, curated/staged/repeating state, parking and weekly records | Existing `plannerDataAccess.js`, `plannerSupabaseStorage.js`, plus guarded restore support | Preserve all stable IDs, tombstones, metadata, checklists, queue state and recurring exceptions; test no overwritten rows and no local success fallbacks. |
| Project create/delete/move and missing-ID restrictions | Explicit service policy shared by storage, Workbench forms and agent | Approved edit-only restriction; creation is intentionally blocked, not claimed as legacy create parity. Do not change deployed database policies. |
| Old agent parser/help/clear and create behavior | React `AgentCommandBar` + modern Workbench command service and explicit policy errors | Parser/help/clear maintained; no local fake-success fallback. Project creation remains blocked by approved policy. |
| Web router, screen templates, shared nav/styles, mobile shell and config/auth globals | Modern React pages, CSS modules, navigation, env configuration and auth exist | Protected entries remain unchanged. Legacy runtime cannot be deleted until an approved cutover and static/old-build consumers are retired. |
| Legacy Sheets project IDs and local backup keys | Explicit backup adapter with stable-ID mapping and rejection of ambiguous/unmapped references | No title guesses, no automatic project inserts and no import of retry queues or OAuth tokens. |

## Data and validation constraints

The backup UI covers Planner task-manager, weekly and parking data and week
settings. It is not a whole-database snapshot: projects, Trips, Daily Activities,
Google events and credentials are outside this backup's scope and are identified
as such in the UI/export. Restore must preserve stable task and parking IDs
through a dedicated insert-only save mode, not through ordinary editing APIs.
Existing rows with changed content block the restore. Settings cannot be changed
by merge restore. Existing matching rows are skipped. Concurrent insert races
must fail, never turn into overwrites.

Restore operations are serialized in the client but are not a database-wide
transaction. All input and known conflicts are checked before writing; an
unexpected server rejection must report partial progress explicitly and allow a
fresh preview/retry without deleting anything.

Google Calendar and Supabase do not share a transaction. Reminder identities
must be stable so retries can reconcile a remote update if persistence fails.
Failures must report that a Calendar update may have succeeded; they must never
claim that no reminder exists or that a local-only reminder was scheduled.

## Deliverables

- Modern Planner backup service, React preview/import/export UI and unit/fixture
  tests.
- Google Calendar notification service, Planner integration, Calendar reminder
  editing, and API/persistence failure tests.
- Explicit project/automation policy and regression tests for denied writes.
- Updated dependency map, measured verification results, unresolved parity gates,
  and a conditional Phase 5 deletion candidate list.

## Phase 5 deletion rules

No protected screen/module is eligible solely because its React counterpart
exists. Require passing behavior coverage, approved entry cutover, deployed
modern assets, review of old mobile/static build URLs, and disposition of pending
Apps Script triggers before deleting the isolated implementations.

## Implemented replacements and imports

| Consumer | Replacement / changed import |
| --- | --- |
| React Planner page (historical) | At that time mounted `PlannerBackupPanel.jsx`; that unused panel was retired during final housekeeping. Current backup service/controller behavior remains. |
| Planner backup service | Imports `plannerSupabaseStorage.js`; export/preview read Supabase; restore uses a separate insert-only data-access path |
| Planner controller | Imports `calendarReminders` from `calendarReminderService.js`; old Apps Script fetch/config/phone/gateway handling removed |
| React reminder dialog | Explicit Connect Google Calendar action, notification controls, SMS-retirement warning and imported-reminder review notice |
| Calendar controller | Imports the same notification service; updates only an ordinary event's `reminders`, with visible success/error status |
| Calendar details dialog | Adds event-start / 10 / 30 / 60 minute popup settings and explicit notification disable |
| Workbench forms/agent and Planner storage | Import `projectPolicy.js`; no local fallback or new raw-project privileges |
| Modern config | `appConfig.js` retains weather configuration only; obsolete `VITE_REMINDER_*` entries removed from `trips/.env.example` |

The unused `src/services/googleSheetsClient.js` had no importers and was
deleted. All 29 files isolated under `www/legacy/` remain: their protected
consumers are still active. No protected screen or generated asset was deleted.
The then-retained inventory and dependency map were in
`www/legacy/README.md` (subsequently retired; not a current runtime path).

## Backup behavior and boundaries

- Export includes active task-manager and parking records, weekly rows including
  deletion/instance tombstones, and `weekStartDate`. Other week-settings metadata
  remains untouched in Supabase. Deleted task-manager/parking rows, projects,
  Trips, Daily Activities, Calendar events and OAuth credentials are outside the
  export's scope. This is a Planner backup, not whole-database disaster recovery.
- Native version-1 JSON and `hm_weekly_planner` arrays / `{ tasks, weekStartDate }`
  JSON are supported. The legacy `occurenceDate` spelling, notes, checklists and
  extra weekly metadata are retained. Unrelated localStorage keys are not read
  or imported. Nested legacy `days` structures and other legacy task/parking/
  queue keys require a separately verified mapping; unsupported formats fail.
- Preview validates stable IDs, dates, booleans, numeric values, JSON fields,
  duplicates, project/recurrence references and parking conversion targets.
  Existing identical records are skipped; changed content or a different
  week-start setting blocks restore. Unknown legacy project IDs require
  explicit mapping, not title guesses or new projects.
- Restore rechecks current data, preflights every group, uses inserts only and
  rejects concurrent ID collisions. JSON property ordering is not a conflict;
  arbitrary nested metadata remains significant. Parking creation timestamps
  are preserved when present. There is no database-wide transaction: a server
  rejection after earlier inserts reports partial progress and requires a fresh
  preview. Actual inserted/skipped counts come from the write result.
- The controller drains pending edits, excludes overlapping mutations/reminder
  operations, and reloads the merged state before releasing the backup lock.
  Reload failure keeps editing blocked and exposes a retry action, preventing
  stale snapshots from tombstoning newly restored rows.
- Newly imported active reminders become inactive `needsReview` records with
  their original settings preserved under `imported`. Restore neither schedules
  new notifications nor cancels existing Google/SMS jobs. Identical existing
  reminders remain unchanged; repeating the same restore is idempotent.

## Notifications and restriction behavior

Planner notifications use an owned one-minute transparent Google Calendar event
at the requested future notification time. A native SHA-256-derived event ID
allows reset/retry to reuse one event; private task identity is checked before
changing it. Concurrent create conflicts reconcile the same owned event.
Service-owned notification events are excluded from React Calendar's ordinary
event list to avoid re-importing notification infrastructure as Planner tasks.

Cancellation disables notifications and retains the event for safe reuse.
Supabase stores the full provider/event/time mapping. Remote-write/database
failures and lost responses explicitly report uncertainty and permit stable-ID
retries. Planner task removal and series operations that discard scheduled
instances require active notifications to be cancelled first. Moving a task does
not silently reschedule an absolute-time notification: use reset explicitly.

Google Calendar client notification permissions/settings still control actual
popup delivery. Scheduling is not an SMS or email delivery guarantee. Existing
Apps Script SMS jobs are not cancelled by these controls. Switching Google
accounts and externally deleting owned events require reconciliation before
claiming reminder lifecycle parity.

The modern agent retains parser/help/clear behavior and routes creation requests
through an explicit denial. Existing raw project edits remain supported;
creation/deletion/type moves remain blocked. This is the approved restriction,
not a claim of unrestricted legacy-agent creation parity. No Supabase schema or
RLS policy was deployed.

## Verification

- All 12 repository test files passed: **143 tests, 0 failures, 0 skipped**.
- Both React production entries build successfully **in memory**, with no
  generated output writes. Build assertions cover the new backup/notification
  features and exclude legacy globals, Sheets and Apps Script reminder endpoints.
- Focused ESLint passed for all 13 changed/new Phase 4 React/service source files.
- SHA-256 comparison confirmed **54 existing generated files unchanged** across
  `www/activity-planner/`, `www/trips/`, `dist/`, and Android packaged public
  assets: no added, removed or modified output files.
- Protected-route dependency tests verify existing entry/router references,
  retained screen templates, isolated implementations and static nav loaders.
  Legacy Planner transition and move tests remain intentionally retained.
- New/extended coverage: `tests/calendar-reminders.test.cjs` (stable IDs,
  schedule/reset/cancel, authorization/ownership failures, partial writes,
  lost responses, create races and direct event reminder edits);
  `tests/planner-supabase.test.cjs` (backup validation/conflicts/metadata,
  insert-only collision/preflight/partial progress, controller locks/reloads,
  persisted notification mappings, cancellation-before-removal, Calendar
  notification actions and edit-only form/agent/storage policy);
  `tests/planner-react.test.cjs` (modern reminder failure injection);
  `tests/legacy-isolation.test.cjs` and `tests/planner-vite.test.cjs`
  (modern dependency/config/output boundaries).
- Validation used local fixtures only: **no live Supabase/Google Calendar writes,
  scheduled jobs, schema deployments or browser CRUD**. Live Google popup
  delivery and every historical backup shape are not claimed as verified.

## Remaining legacy behaviors and Phase 5 candidates

**Protected-screen parity is not yet complete; no isolated implementation is
safe to delete now.** Modern implementations are ready for the following gated
cutover, not an automatic replacement of the protected shell:

| Conditional deletion group (paths relative to `www/legacy/`) | Required before deletion |
| --- | --- |
| `js/migration/weekly-planner-migration.js`, `weekly-planner-restore.js` | Inventory real legacy backup shapes/keys, map legacy project IDs, verify their supported data coverage, approve protected manual-flow cutover |
| `js/services/sheets.service.js`, `projects.service.js`, `planner-storage.service.js`, `js/utils/uuid.js` | Migrate protected web/mobile consumers and their local/Sheets state; no remaining static/old-build global callers |
| `auth.js`, `js/app-config.js` | Protected entry auth/config cutover; retain modern explicit authorization and separate database session behavior |
| `screens/planner/*`, `components/parking-lot/*` | Protected Planner/parking cutover, recurrence/conversion/backup coverage, reconcile existing SMS triggers and external Calendar lifecycle cases |
| `screens/calendar/*` | Protected Calendar/mobile cutover and approved notification lifecycle/delivery validation |
| `screens/dashboard/*`, `screens/workbench/*`, `workbench/*` | Protected entry cutover; approved edit-only project and agent behavior accepted in deployed UI |
| `components/nav/*`, `styles/main.css`, `screens/trips/*` | Retire protected router/static compatibility URLs and old build/iframe consumers; deploy modern navigation/styles/routes |

Outside the isolation folder, `www/mobile/`, the old task-manager migration
helper and static nav compatibility loaders remain conditional candidates only.
The Apps Script reminder backend is a separate retirement candidate **after**
all pending SMS triggers and remaining protected callers are reconciled.
Backup JSON is user data, not a deletion candidate.

`www/index.html`, `www/js/router.js`, protected screen templates and existing
React/Android output are preserved. A later deployment/cutover must be explicitly
verified before deleting their legacy implementations.
# Historical archive notice

This Phase 4 document is non-runtime migration history. It is not permission to
execute old commands or restore historical data. See [current architecture](architecture.md)
and the [canonical SQL index](../supabase/review/README.md).
