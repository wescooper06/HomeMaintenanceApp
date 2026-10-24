# Life Manager (React + Vite)

## Shared Trips source

Trips pages, components, and assets now live in `../src/pages/Trips/`.
The Trips Supabase service is `../src/services/tripsService.js`, and its shared
utilities live in `../src/utils/`. The existing `trips/` package still supplies
the app entry point, dependencies, and Vite configuration. Run `npm run dev`
or `npm run build` here as before; its entry imports the relocated source.
Vite resolves React and Trips UI dependencies from this package for those files.

## Planner in the Vite application

The shared application router is
[`LifeManagerRouter`](../src/router/LifeManagerRouter.jsx), mounted by the
existing Vite entry. It replaces the routing previously defined in
`trips/src/App.jsx`. The old generic router entry now re-exports this router
instead of creating a second router configuration.

The main navigation uses `/#planner`, `/#workbench`, `/#dashboard`, `/#calendar`,
`/#daily`, and `/#trips`. Daily Activities mounts the existing activity planner
and its Google connection flow, not the placeholder page. Old `#activities`,
`/daily-activities`, and `/activity-planner` links remain aliases.
Path aliases such as `/planner` still support existing React navigation.
The Trips feature retains its name and paths, without a Google connection gate:
`/`, `/index.html`, `/prioritize`, `/timeline`, `/new`, and `/:tripId`.
An explicit `#trips` always opens the Trips home feature.

Life Manager is the document and navigation identity. The router now lives in
the shared `src/router/` folder, not the Trips package. The `trips/` package,
environment location, build output, and `/trips/` hosting prefix remain for
compatibility; `/trips/#planner` and the other hashes work under that prefix.

Planner uses the existing `../src/pages/Planner/PlannerPage.jsx` and its section
components, not a second copy of the legacy DOM scripts. Navigation, document
padding, colors, typography, and Material Icons retain the legacy shell.
Trips' global typography is scoped to Trips so it cannot change Planner cards
or body-mounted dialogs. The original `www/` HTML, CSS, and JavaScript remain
unchanged reference sources; retained adapters are bundled by Vite.

`npm run build` now writes to `../dist/trips/`, never into the reference
`www/` tree. The relative asset base supports root and `/trips/` hosting.
For production, configure the host's SPA fallback for deep links.

## Shared Activity Planner source

The standalone Activity Planner entry remains in `../src/activity-planner/`.
Its page and components now live in `../src/pages/ActivityPlanner/`, its Sheets
hook and regeneration helper are combined in
`../src/services/activityPlannerService.js`, and its utilities live in
`../src/utils/plannerUtils.js`. Run `npm run dev:activity-planner` or
`npm run build:activity-planner` here as before.

## Planner and Workbench Supabase storage

Install root dependencies with `npm install` at the repository root. Copy
`.env.example` to `.env.local` in this directory and supply your Supabase URL
and browser publishable key. Never use a service-role key in the browser.
The client is initialized lazily; missing configuration and database/RLS errors
are reported through the existing service/controller error handling.

Planner and Workbench use `../src/services/plannerDataAccess.js` through
`plannerSupabaseStorage.js`. Existing imported records are read directly:

- `loadPlannerState()` reads `planner_tasks`, `planner_weekly_tasks`, and
  `planner_parking_lot`, mapping their snake_case columns to the React contracts.
- `savePlannerState()` is the sole Planner write entry point. As explicitly
  authorized, it can insert new Planner rows for user actions and update existing
  rows. Removal uses the existing deletion flags, not physical row deletion.
- `loadProjects()` displays rows from `projects_all`, hydrating raw fields from
  `projects_home`, `projects_vehicle`, `projects_repeating`, and `projects_misc`.
- `saveProject()` only updates an existing raw row by UUID and project type;
  the view reflects those edits automatically. New project creation, moving a
  project between types, and deleting raw project rows are explicitly rejected
  because they have not been authorized. This includes Parking Lot conversions
  that would require a new project; conversions to Planner tasks are supported.

No importer, database migration, re-seeding, or Planner local-storage fallback
is involved. Existing UUIDs and `external_id` values are never interchanged.
`project_id` identifies the raw project's UUID, and `parent_rep` identifies a
repeating project's UUID. The unused legacy linking column is never queried for
identity or written.

Confirmed metadata contracts:

- The existing `planner_weekly_tasks` row with `id = "week-settings"` owns
  `metadata_json.weekStartDate`. It is excluded from scheduled task cards.
  Missing settings are an explicit error, not an automatically inserted row.
- `planner_tasks.metadata_json.queue` is `curated` or `staged`, with ordering
  in `queueOrder`. Removing membership sets these two keys to null.
- Series settings live in `planner_tasks.metadata_json.series`, retaining
  `recurrence`, `interval`, and `weekdays`. Existing single-day editor selections
  write the selected weekday. Weekly multi-day rules are expanded in React.
  Existing anchor/bucket settings and edits stay within this same series object.
- Weekly exception edits retain `metadata_json.override`, including `date` and
  `completed`, alongside the existing exception/deletion columns.
- Parking conversion category lives in `metadata_json.conversionType`; the
  existing `converted_to_type` column remains boolean, and `converted_to_id`
  remains the linked ID. Missing categories on converted records raise an error.

Loading displays the imported weekly rows without writing a generated projection.
Explicit week navigation/scheduling/series actions continue to use React's
generation and lifecycle logic, with saves serialized in the active adapter.
Staged entries are consumed through the existing React action and acknowledged
only after destination writes succeed. JSON metadata is preserved on edits.
Multi-row saves are not transactions; errors are explicit and retryable.
Concurrent edits in separate clients remain last-writer-wins.

No legacy `www/` files or historical migrations are changed. Daily Activities
retains its independent Google integration. Trips uses Supabase exclusively for
trip, workflow, and timeline data. Reminder delivery is also
unchanged and requires its existing runtime configuration.

Validation:

```sh
node --test tests/planner-supabase.test.cjs tests/planner-react.test.cjs tests/planner-parking.test.cjs tests/planner-vite.test.cjs
```

Run this at the repository root. Tests do not contact the live database.

## Trips Supabase storage

Trips uses the same lazily configured Supabase client as Planner. The only Trips
tables are `trips`, `trips_workflow_metadata`, and `trips_timeline`.
No schema changes, Sheets import, or data migration runs automatically.
See [the migration checklist](./SUPABASE-MIGRATION.md) for service APIs, schema
conventions, validation, and partial-failure recovery.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
