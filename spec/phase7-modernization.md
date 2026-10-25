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
  - Removed create/delete agent and UI paths; editing existing projects remains.
  - Removed legacy/Sheets naming assumptions.
  - Restored project creation through the modern `/projects/new` route and
    `ProjectEditor` create mode, using a direct Supabase insert into the selected
    project-type table. Delete and Parking project/repeatable conversions remain
    unauthorized.
- Configuration/auth:
  - Removed committed `trips/.env`.
  - `src/services/googleAuth.js` uses modern local token keys only.
  - No fallback default OAuth client ID in code; use environment configuration.

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
