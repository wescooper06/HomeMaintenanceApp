# Life Manager

React application for Dashboard, Workbench, Weekly Planner/Parking, Calendar,
Daily Activities and Trips. Supabase and the saved modern UI/configuration are
authoritative. Legacy modules, static screens, navigation, Apps Script sources,
backup converters and identity crosswalk execution have been retired.

## Configuration

Use `.env.local` in this package, following [.env.example](.env.example):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY` (browser publishable key, never service-role)
- `VITE_GOOGLE_CLIENT_ID` (Calendar OAuth web client)
- Optional `VITE_WEATHERAPI_KEY` (browser-visible)

Vite embeds these values at build time. Changing deployed configuration requires
a rebuild. No Apps Script URL, global `APP_CONFIG`, Sheets credentials or legacy
configuration loader is used. Old unscoped Google tokens are not read; connect
Calendar explicitly again. Missing configuration/provider errors are surfaced.

## Commands from repository root

```powershell
npm run dev
npm test
npm run lint
npm run lint:fix
npm run build
npm run mobile:sync
npm run android:debug
npm run android:release
```

`build` creates the main app in `dist\trips`, builds the optional standalone
Activity Planner in `www\activity-planner`, and publishes main assets to
`www\trips`, replacing only generated assets. `mobile:sync` also copies the
modern main app into Android with Capacitor. Sync/update hooks retain Java 17
in generated Gradle modules; the root Gradle compatibility override also remains.

## Linting

Install root tooling with `npm ci` and Vite dependencies with
`npm --prefix trips ci`. The root `eslint.config.mjs` is shared by both packages.
It checks modern React/JSX source, Node scripts, tests, Vite configuration and
the modern launcher; generated web/native bundles and historical assets are
excluded. React's automatic JSX runtime, Hooks, Fast Refresh, import resolution
and ordering, and basic JavaScript quality rules are enabled. Imports resolve
from both packages, including Supabase and Capacitor plugins.

ESLint 9 is used for compatibility with the stable React plugin's supported peer
range; the configuration uses the current flat-config API. React 18 and 19 are
supported; the React version is read from the installed Vite package rather than
guessed from the root. Runtime prop validation is not required.
No `tsconfig.json` or TypeScript source is present, so TypeScript-specific lint
tooling is not installed. Lint failures are reported directly; `lint:fix` applies
only ESLint's available automatic fixes and may leave errors to resolve manually.

Main routes are `#dashboard`, `#workbench`, `#planner`, `#calendar`, `#daily`,
`#trips`, with `#parking` opening embedded Planner/Parking. Trips retains its
modern BrowserRouter detail, prioritization and timeline paths. Old static screen
URLs and obsolete Daily aliases are retired, not redirected to old code.

Root repository, `www` and responsive mobile launch entries preserve query/hash
and open the same React shell. Native Android uses the modern build directly.

## Data boundaries

- Planner reads/writes `planner_tasks`, `planner_weekly_tasks`,
  `planner_parking_lot`; projects use `projects_all` and matching raw tables.
- Project permissions remain edit-only. New project, raw-project deletion and
  type moves remain prohibited, independently of the retired safe mode.
- Current queues, recurrence settings, exception/tombstone metadata, timestamps
  and Google notifications are modern functionality, not migration inputs.
- No weekly-ID decoding, title-based matching, crosswalk import, legacy date
  conversion, retry replay, local Planner persistence fallback or SMS backend.
- Only version 1 `homemaintenance-planner` JSON backups are supported.
  Other formats and mixed historical envelopes are permanently rejected.
  Modern restore remains insert-only; conflicts block and active notifications
  require review without automatically scheduling Calendar events.

## Release

Deploy only `dist\trips` contents, never the repository root or historical records.
Serve HTTPS, configure SPA index fallback for modern Trips deep links, and register
the actual host origin with Google OAuth. No schema migration, seed or data import
is part of deployment. See [Phase 7 release report](../spec/phase7-modernization.md)
for prepared artifacts, installation instructions and release limitations.
