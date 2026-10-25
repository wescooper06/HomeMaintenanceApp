# Phase 3 migration plan and dependency map

Historical Phase 3 results are preserved below. See the
[Phase 4 report](phase4-migration.md) for the replacement backup/notification
flows, retired unused Sheets client, current test results and remaining gates.

## Approved scope

Migrate React consumers first. Preserve the protected web/mobile screens and keep
their legacy implementations until feature parity is verified. Reuse the current
Supabase schema and write restrictions; do not introduce hypothetical `projects`
or `planner` tables, change RLS, or enable raw project insertion/deletion.
Existing generated React output must not be overwritten.

## Module-by-module plan

All legacy paths below are relative to `www/legacy/`.

| Legacy module(s) | Modern replacement | Migration / removal gate |
| --- | --- | --- |
| `js/services/sheets.service.js` | `src/services/plannerDataAccess.js`, `activityDataAccess.js`, `tripsService.js`, `tripsWorkflowService.js`, `tripsTimelineService.js` | Use existing Supabase query/error/pagination helpers. React must not load the Sheets global. Retain the legacy service for protected web/mobile and Apps Script operations until those flows have parity. |
| `js/services/projects.service.js` | `plannerDataAccess.js`, `plannerSupabaseStorage.js`, `workbenchService.js`, `dashboardService.js` | Read `projects_all` and source tables `projects_home`, `projects_vehicle`, `projects_repeating`, `projects_misc`; preserve edit-only write restrictions. Raw project create/delete/move and old agents remain gated. |
| `js/services/planner-storage.service.js` | `plannerSupabaseStorage.js`, backed by `plannerDataAccess.js` | Move Calendar to the same `planner_tasks`, `planner_weekly_tasks`, and `planner_parking_lot` adapter as React Planner. No local-only fallback or writes to Sheets. Preserve stable event/day identifiers, notes and all-day metadata, deduplication, and error reporting. |
| `auth.js`, `js/app-config.js` | `src/services/googleAuth.js`, `appConfig.js`, Vite environment configuration, existing `supabaseClient.js` | Explicit module-scoped GIS client for direct Calendar API authorization, with the existing public OAuth client as default and `VITE_GOOGLE_CLIENT_ID` as override. Keep Supabase database session handling separate. Reuse valid existing Google token keys/scopes; require an explicit Connect action when authorization is needed. No legacy global/config loads. |
| `js/utils/uuid.js` | Native `crypto.randomUUID()` in existing data access helpers | No new UUID abstraction. Calendar event/day IDs remain deterministic because the existing weekly table uses them as identity. Retain the UUID global for protected web/mobile. |
| `js/migration/weekly-planner-migration.js`, `weekly-planner-restore.js` | Existing Supabase query services for ordinary persistence | Do not run legacy backup imports automatically. A modern manual import needs a separately verified mapping, dry-run/duplicate review, and the same write restrictions; retain protected/manual import workflows until this exists. |
| `components/nav/nav.js`, `nav.html`, `nav.css` | `src/components/layout/MainNavigation.jsx`, `MainNavigation.module.css`, `StandaloneNavigation.jsx` | Render standalone Activity Planner navigation in React; remove nav script injection and Vite legacy middleware. Keep static compatibility URLs and legacy implementation for protected web screens and immutable old builds. |
| `screens/calendar/calendar.js`, `calendar.css` | `src/services/calendarService.js`, `src/pages/Calendar/` components and `CalendarPage.module.css` | Use direct Calendar API + Supabase planner storage; test event CRUD/move contracts, all-day/multi-day additions, deduplication and failures. Retain web Calendar until the protected entry migrates. |
| `screens/dashboard/dashboard.js`, `dashboard.css` | `src/pages/Dashboard/`, `dashboardService.js` | Already React/Supabase with scoped styles; retain the web version for protected routing. |
| `screens/planner/planner.js`, `planner.css`, `CalendarWidget.js`, `PlannerMoveTaskModal.js` | `src/pages/Planner/`, `plannerService.js`, `plannerSupabaseStorage.js` | Already React/Supabase with scoped styles. Preserve recurrence, checklist, move, reminder, queue and exception contracts. Keep web implementation and its parity tests pending protected-screen migration. |
| `components/parking-lot/parking-lot.js`, `parking-lot.css`, `parking-lot.html` | React Planner parking components and Supabase parking adapter | Already replaced for React. Retain web conversion flows and legacy regression coverage until protected entry migration. |
| `screens/workbench/workbench.js`, `workbench.css` | `src/pages/Workbench/`, `workbenchService.js` | Already React/Supabase for authorized actions. Do not silently enable previously prohibited raw writes. |
| `workbench/agent-ui.js`, `workbench.css` | React Workbench editing/task workflows | Legacy agent actions need an explicit API/permission/UX parity review before removal; no agent code is loaded by React. |
| `screens/trips/trips.js`, `trips.css` | React Trips pages and Supabase services | React already owns Trips. Retain the protected iframe wrapper and generated output. |
| `styles/main.css` | `src/components/layout/mainApplication.css`, component CSS modules | Modern shell already owns its base styles. Do not import global legacy CSS into React. Retain protected web styling. |

## Execution order

1. Record pre-migration hashes of generated web/Android output.
2. Replace Calendar auth/config loading with a modern Google module. Keep Google
   Calendar OAuth separate from the existing Supabase database session. Add an
   explicit Connect control instead of opening authorization popups on mount.
3. Replace Calendar local/Sheets planner loading and writes with the existing
   Supabase storage. Report failures and never claim local-only writes succeeded.
4. Render standalone navigation with React and component-scoped styles; remove
   the old navigation middleware from both Vite configurations.
5. Replace React migration assertions with modern auth/storage/navigation tests;
   retain explicitly legacy-only protected-screen parity coverage.
6. Run focused tests and in-memory production builds, verify generated hashes,
   and update the retained-module map. Delete a legacy implementation only once
   its protected-screen and immutable-build consumers are gone.

## Protected paths and parity gates

`www/index.html`, `www/js/router.js`, screen templates, the old mobile entry,
static compatibility URLs, existing web builds, `dist/`, and Android packaged
assets are retained. Phase 3's approved first pass does not redirect protected
entries, rewrite their behavior, execute live data migrations, or remove their
backends.

The retained implementations are intentional, not modern React dependencies.
Legacy-only tests may continue reading them to verify the protected screens.
Do not delete regression or parity assertions just to make dependency scans pass.

## Verification and completion

### Replaced React dependencies and updated imports

| Consumer | Old dependency | Current dependency |
| --- | --- | --- |
| `calendarService.js` | Six lazy imports of legacy config/auth/UUID/Sheets/PlannerStorage; global `window.Auth`, global `window.PlannerStorage`, local-storage fallback | Direct imports from `googleAuth.js` and `plannerSupabaseStorage.js`; direct Google Calendar API and persisted Supabase Planner state |
| `googleSheetsClient.js` (unused compatibility API helper) | Side-effect import of root `auth.js` and global config/Auth | Explicit `googleAuth.js` import; no global Auth/config initialization |
| `plannerService.js` | `window.APP_CONFIG` for weather/reminders | `appConfig.js`, sourced from Vite environment variables |
| `src/activity-planner/main.jsx` | Nav scripts/CSS injected from standalone HTML | `StandaloneNavigation.jsx` with `MainNavigation.module.css` |
| `MainNavigation.jsx` | Its own route array | Shared `navigationRoutes.js` route definitions |
| Both Vite configurations | `sharedNavPlugin()` | React plugin only; obsolete `trips/shared-nav-plugin.js` removed |

Supabase projects, Workbench, Dashboard, Trips, parking, and most Planner
functionality already had modern replacements; these were reused rather than
wrapped in duplicate modules.

### Current dependency map

```text
React Calendar -> calendarService -> googleAuth -> Google Calendar API
                                -> plannerSupabaseStorage -> plannerDataAccess -> Supabase
React Planner  -> plannerService -> plannerSupabaseStorage -> Supabase
                                -> appConfig -> optional weather/reminder endpoints
Standalone Activity Planner -> StandaloneNavigation -> shared navigation routes + CSS module
Main shell -> MainNavigation -> shared navigation routes + CSS module
Protected web/mobile + immutable old builds -> www/legacy/ (29 retained modules)
```

No source module in either React build loads a file from `www/legacy/`.
Generated old builds are intentionally unchanged and may still contain their
previous embedded legacy adapters; deploy a newly built/synced version separately.
Static old-build navigation compatibility files remain.

### Remaining modules and backend work

All **29** legacy implementations listed in the module matrix remain
**legacy-active / protected-only**, including helpers used transitively by those
protected screens. No file in `www/legacy/` is safe to delete in this approved
React-first pass. Legacy-only Sheets, screen, and parity tests remain deliberately
attached to them; modern Calendar/auth tests do not load legacy implementations.

React reminder delivery still requires the existing Apps Script-compatible
endpoint. Removing a config-global dependency does not replace the SMS backend.
Backend replacement, manual backup-import tooling, raw project write permissions,
old agent behavior, protected entry switching, and old-build retirement are the
remaining parity gates before deleting implementations.

### Configuration

See `trips/.env.example`:

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`: existing database client.
- `VITE_GOOGLE_CLIENT_ID`: optional override of the existing public OAuth client;
  the web origin must be registered with Google. Calendar access is granted by
  the explicit **Connect Google Calendar** control, not by popups on page load.
- `VITE_WEATHERAPI_KEY`: optional weather configuration.
- `VITE_REMINDER_API_URL`, `VITE_REMINDER_PHONE_NUMBER`,
  `VITE_REMINDER_SMS_GATEWAY`: optional retained reminder workflow configuration.

All Vite variables are browser-visible; never place privileged server keys in
them. No local environment file, live database schema, RLS policy, or user data
was changed.

### Validation

The migration tests cover Calendar event CRUD authorization, multi-day/all-day
Supabase additions, stable identifiers, duplicate prevention, tombstone revival,
rejected saves without local fallback, visible Planner errors, OAuth scope/expiry
handling, explicit consent, concurrent authorization, sign-out, navigation paths,
and both in-memory production builds. Existing protected-screen/Planner parity
tests remain in place.

Final verification:

- **90 Node tests passed**, including the main shell and standalone Activity
  Planner production builds, both with `write: false`.
- ESLint passed for all changed React components and service modules.
- All **54** pre-existing generated web/Android files matched their original
  SHA-256 hashes.
- Browser smoke checks mounted all six modern routes and standalone navigation,
  with no legacy asset requests or uncaught JavaScript errors.
- The unauthenticated Calendar displays an explicit Connect action rather than
  opening a popup automatically. Real Google consent/Calendar writes were not
  verified.
- The attempted mocked browser CRUD check was not a valid isolated test: network
  interception failed, creating the test-only weekly row
  `google-phase3-ui-2026-10-24` in Supabase. That exact row was identity-checked,
  removed, and its absence verified. No existing user row was edited or removed.
  Calendar/Supabase persistence validation relies on the passing deterministic
  Node fixtures, not this browser attempt.
- Temporary browser test servers were stopped. No generated output was synced,
  and all protected web/mobile implementation files were retained.
