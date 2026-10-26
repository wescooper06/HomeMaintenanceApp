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
