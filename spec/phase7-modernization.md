# Phase 7 modernization report

## Outcome

Phase 7 modernization is complete in this workspace. The application now runs
only on modern React + Supabase + Google Calendar execution paths, with legacy
Planner/Calendar/Parking/Reminder/backup/queue/Apps Script compatibility logic
retired from runtime.

## Retired legacy runtime surfaces

- Removed legacy service/runtime modules and adapters:
  - `src/services/plannerLegacyBackup.js`
  - `src/services/googleSheetsClient.js`
  - `scripts/reconcile-legacy-backup.cjs`
  - `scripts/sync-auth.js`
  - `auth.js`
- Removed legacy static screens, loaders, and compatibility files from `www`:
  - `www/legacy/**` removed
  - `www/screens/**` removed
  - `www/components/**` removed
  - `www/js/router.js` removed
  - `www/js/migration/**` removed
  - legacy mobile HTML/CSS/JS files removed from `www/mobile/**` (entry retained)
- Removed Apps Script backend source:
  - `google-apps-script/**` removed
- Archived historical backup artifact out of runtime path:
  - moved to `spec/historical/localStorage_backup_2026-08-13.json`

## Modern behavior finalization

- Root navigation now defaults to the existing modern Planner route for `/`
  and `/index.html`. Static web/mobile launchers preserve explicit hashes but
  no longer inject a Dashboard hash, so the React route resolver owns the default.
  Explicit Trips navigation and its nested routes remain unchanged.
- Removed the redundant visible Life Manager navigation link; the application
  shell, title, Planner link and other module navigation remain intact.
- Trips subpage returns use the semantic `TRIPS_HOME_ROUTE` (`/#trips`), matching
  shared Trips navigation instead of depending on the Planner root default.
  Timeline, Prioritize, Trip Details/Workflow and New Trip Cancel share this
  destination; BrowserRouter retains its hosting/Capacitor basename handling.
- Shared navigation presentation is isolated in `MainNavigation.module.css`.
  It explicitly uses the existing main-shell Segoe UI typography and fixed
  pixel equivalents of its 16px-root dimensions, rather than inheriting Trips'
  18px root, 145% line-height, letter-spacing or theme variables. Trips content
  styles remain unchanged; only its navigation has a shared 16px inset frame.
  Trips/Prioritize/Timeline already use MainNavigation from the router, not a
  duplicate page navigation. Standalone Activity retains its ordinary-anchor
  adapter because it links to a separate shell, but shares the same CSS/frame.
- Capacitor uses the same modern build/default. Run `npm run mobile:sync`
  before the next Android APK rebuild/install to copy the updated web bundle;
  no native assets need regeneration for this source change.
- Planner backup:
  - `src/services/plannerBackupService.js` now permanently rejects legacy/hm_ envelopes.
  - Only versioned modern `homemaintenance-planner` backups are accepted.
  - No legacy preserve-existing mode, no identity crosswalk import path.
- Identity resolution:
  - No weekly ID decoding fallback for source identity.
  - Explicit source identity stored in weekly metadata (`sourceTaskId`) for deterministic updates.
- Calendar:
  - Removed PATCH→PUT fallback chain in `src/services/calendarService.js`.
  - Removed token-expiration retry/sign-in fallback behavior from data mutations.
  - API failures remain explicit.
- Workbench:
  - Removed legacy/Sheets naming assumptions and obsolete mutation paths.
  - Restored project creation through `/projects/new` and `ProjectEditor`.
    The owner reports `create_workbench_project` deployed and working.
  - Permanent deletion now uses one shared editor/card confirmation and the
    owner-deployed `delete_workbench_project` modern-only cascade.
    Parking project/repeatable conversion removal remains unauthorized.
  - PostgreSQL generates a UUID primary key and a separate PA/PB/PC/PD external
    ID. The temporary UUID-as-external-ID workaround is removed. See the
    [canonical SQL index](../supabase/review/README.md).
  - Project Type, not Recurrence, selects the destination table. The explicit
    repeating checkbox selects `repeating`; its separate recurrence dropdown
    selects the rule. Schema evidence is distilled into permanent regression
    fixtures, not a runtime schema fallback.
- Configuration/auth:
  - Removed committed `trips/.env`.
  - `src/services/googleAuth.js` uses modern local token keys only.
  - No fallback default OAuth client ID in code; use environment configuration.

### Workbench external-ID follow-up review

The historical project export (retired during final housekeeping) contained 301
rows with no blank or duplicate external IDs:

| Type | Rows | Observed format | Exported range |
| --- | ---: | --- | --- |
| home | 209 | `PA####` | `PA0001` through `PA0209`, no gaps |
| vehicle | 82 | `PB####` | `PB0001` through `PB0082`, no gaps |
| repeating | 6 | `PC####` | `PC0001` through `PC0008`, missing `PC0005` and `PC0006` |
| misc | 4 | `PD####` | `PD0001` through `PD0004`, no gaps |

Recycle is exported as `PC0003`. The owner subsequently approved ordinary
creation only: use type-specific sequences above floors 209/82/8/4, never fill
visible gaps, and do not retain `PC0003` for Recycle. Higher current maxima raise
those floors. Unknown previously issued/deleted higher numbers are an accepted
initialization limitation. The [canonical RPC](../supabase/review/202610250001_project_creation.sql)
implements this policy; the owner subsequently reported it deployed.

Runtime external-ID consumers:

- [Data access](../src/services/plannerDataAccess.js) reads `external_id`,
  exposes `externalId`, retains the server-generated value on creation, and preserves existing IDs
  during updates.
- [Planner service](../src/services/plannerService.js) carries `externalId` in
  project views and accepts either ID alias for explicit project matching,
  task-to-project resolution, master-title editing, and Parking in-place
  editing. Ambiguous matches are rejected. None parses a PA/PB/PC/PD prefix.
- Workbench display, search, ordering, and new task links use project UUIDs,
  not external-ID prefixes. Modern backup reference checks use project UUIDs;
  project rows are not part of the Planner backup.
- Historical reconciliation documents and the
  [owner identity crosswalk](phase5-project-identity-map.json) use external IDs
  as corroborating identity evidence. Some owner-authorized, uncorroborated
  crosswalk entries use numeric strings; they are not an allocation rule.

Previously owner-supplied DDL recovered from session history declares home
`external_id text not null` and vehicle/repeating/misc `external_id text null`.
It declares primary keys on UUID `id`, but no external-ID unique/check
constraints, allocator, or external-ID foreign keys. The `projects_all` view
uses `UNION ALL` and does not enforce uniqueness. Standalone indexes, triggers,
policies, grants, and later live changes cannot be excluded by that saved DDL.
The screenshot reports a home-table NOT NULL failure, consistent with the
saved home definition; it does not prove repeating-table schema drift.

For any future separately approved allocation/schema change, obtain fresh evidence:

- Current read-only schema output for all four raw tables: every column with
  type/nullability/default/generation, constraints, standalone indexes,
  triggers and their function definitions, RLS flags/policies, and role grants;
  also the current `projects_all` view definition.
- Any conflicting existing allocator sequence/counter/RPC and its
  transaction/locking behavior. The proposed allocator must not compete with a
  pre-existing mechanism. Client-side `max + 1` is not race-safe.

No live database schema or data was changed by this audit. The owner-reported
deployment is recorded separately from historical preparation evidence.

## Navigation and build

- Root/web/mobile entries route to modern shell:
  - `index.html`
  - `www/index.html`
  - `www/mobile/index.html`
  - launcher script: `www/js/modern-entry.js`
- Updated route aliases and removed dormant legacy aliases:
  - `src/router/lifeManagerRoutes.js`
- Publishing/build pipeline finalized:
  - `scripts/publish-modern.cjs`
  - `npm run build` publishes modern output to `dist/trips` and `www/trips`
- Android Java 17 hardening for generated Capacitor Gradle files:
  - `scripts/android-java17.cjs`
  - package hooks: `capacitor:sync:after`, `capacitor:update:after`

## Verification

- Tests: **112 passed, 0 failed** (`npm test`)
- Root flat-config linting is restored via `npm run lint`. The workspace run
  passes with zero errors and zero warnings after import-order normalization,
  shadowed-variable renaming, and unused test-binding cleanup. The Vite package
  lint command also passes. No generated/native bundles or historical assets
  were modified by this lint-repair pass.
- Build and publish: passed (`npm run build`); prior mobile sync remains verified.
- Android packaging:
  - `assembleDebug`: passed
  - `assembleRelease`: passed
  - APK outputs:
    - `android/app/build/outputs/apk/debug/app-debug.apk`
    - `android/app/build/outputs/apk/release/app-release-unsigned.apk`
- Generated Android Gradle files confirmed Java 17 compatibility after sync/update.

## Deployment and installation readiness

- Remote deployment: ready from `dist/trips` artifacts plus your host/runtime secrets.
- APK installation: package build is ready, but device install was not executed in this session.
  `adb devices -l` returned no connected devices at validation time.
- Release signing/distribution remains your environment-specific final step.

## Safety and migration boundaries preserved

- No legacy merge/reconciliation path was reintroduced.
- No title-based identity fallback restored.
- No historical backup content was imported during this phase.
- Workbench project creation verification used test fixtures only; no live
  Supabase writes were performed.
