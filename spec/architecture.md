# Architecture

Life Manager uses a single responsive React shell for web and Capacitor Android.
The [shared router](../src/router/LifeManagerRouter.jsx) renders Dashboard,
Workbench, Planner/Parking, Calendar, Daily Activities and Trips. CSS modules
scope screen styles; shared React navigation is the only active navigation.

Supabase is authoritative for projects, Planner, Trips and Activity Planner data.
Services translate existing PostgreSQL rows into React contracts and report
database/RLS failures explicitly. Reads do not seed, import or reconcile data.
Projects remain edit-only. Planner user operations retain the current
queue/series/override/deletion contracts; these are not legacy migrations.

Google Identity Services authorizes Calendar explicitly. Calendar event CRUD and
notification services call Calendar API directly. There is no Sheets/Apps Script
backend, global authentication/config loader or local Planner storage fallback.
Modern Planner JSON backups retain conflict-checked, insert-only restore;
historical formats are permanently unsupported.

The [Trips package](../trips/README.md) supplies Vite and dependencies; application
source lives in `src`. Main production output is `dist/trips`; Capacitor copies
that output to Android. Build publishing also updates `www/trips`.
Historical reconciliation records in `spec` are documentation only and must not
be deployed or used as application inputs.
