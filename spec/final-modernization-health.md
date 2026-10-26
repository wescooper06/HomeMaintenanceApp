# FINAL MODERNIZATION HEALTH REPORT

Scope: safe local housekeeping of the current React + Supabase + Capacitor
application. No external API calls, live SQL, live writes, project tests against
Supabase, schema changes, allocator changes, Android regeneration, commits,
pushes, resets, checkouts, stashes or discarded worktree changes.

## 1. Overall status

**PASS WITH RECOMMENDATIONS.** Required lint, full tests and production builds
pass. Native PostgreSQL concurrency validation remains explicitly skipped.

Owner reports establish creation/deletion deployment and live validation.
This audit checks local code, saved schema evidence and isolated tests; it does
not independently certify current live schema, grants, backups or device state.

## 2. Runtime cleanup

Removed 17 proven-unreferenced source/demo files after checking imports, scripts,
tests and documentation. No active feature, route, Planner writer, project
lifecycle implementation or database policy was redesigned.

| Candidate | Classification / decision |
| --- | --- |
| `src/components/layout/AppLayout.jsx`, `NavBar.jsx` | A: removed unused layout and duplicate navigation |
| `src/pages/ActivityPlanner/ActivityPlannerPage.jsx`, `src/router/index.jsx` | A: removed unused re-export adapters; actual entry imports are unchanged |
| `src/pages/AnnualTimeLine.jsx`, `ChecklistsPage.jsx`, `ItineraryPage.jsx`, `Prioritization.jsx`, `ResourcesPage.jsx`, `TripsOverview.jsx` | A: removed six empty, unregistered placeholders |
| `src/pages/Trips/TripsPage.jsx` | A: removed unregistered placeholder; actual TripsHome remains |
| `src/pages/Trips/components/ExpandedTripModal.jsx` | A: removed obsolete unmounted editor; current modal/editor remains |
| `src/pages/Planner/components/PlannerBackupPanel.jsx` and its CSS module | A: removed unmounted backup UI and its exclusive stylesheet |
| `src/pages/Trips/assets/hero.png`, `react.svg`, `vite.svg` | A: removed unused demonstration assets |
| `src/services/plannerBackupService.js` | B: intentionally retained tested modern backup API; currently not mounted in browser UI, not a production restore guarantee |
| `StandaloneNavigation.jsx`, Activity HTML/React entry, Vite/Capacitor/lint/publishing configuration | C: active cross-entry/build consumers; retained |
| Shared Trips CSS selectors also used by current editors | C/B: retained rather than risking content layout changes |
| Prior-phase reports/crosswalk/original backup | D: historical non-runtime; retained with banners |

Import-graph verification from both modern React entries reaches 103 remaining
source files. The only unreachable JS/CSS module is the intentionally retained
backup API above, which has direct test consumers. Empty source directories,
including the already-empty Sheets service directory, were removed.

Other already-present worktree deletions were preserved, not restored or
re-attributed to this follow-up: seven empty `src/modals` placeholders
(Book/DefineTrip/Itinerary/Prepare/Research/Review/TravelMode), empty
`src/utils/dateUtils.js` and `tripUtils.js`, unused `src/styles/base.css`,
demo `trips/src/App.css`, and four unconsumed Activity re-export adapters under
`trips/src/features/activityPlanner` (ActivityRuleModal, DailyActivityPlanner,
WeeklyGrid and plannerUtils). Current canonical Activity implementations remain.
These fit A, safe dead scaffolding; the full test/build checks include this state.

## 3. Temporary modernization artifacts retired

99 Supabase artifacts were retired after source/test/script/documentation/SQL
reference checks. Permanent DDL evidence was extracted before deleting CSVs:

| Removed group | Files | Classification |
| --- | ---: | --- |
| Root Supabase inspection query and project export | 2 | E/F |
| Superseded creation proposal | 1 | G |
| Creation inspection query batch | 12 | E |
| Creation inspection results/README/empty markers | 16 | F/H |
| Deletion inspection queries/reviews and results | 30 | E/F/H |
| Deletion ownership-review batches/results | 15 | E/F/H |
| Split deletion deployment validations/README | 6 | E/H |
| Split deletion post-validations/README | 10 | E/H |
| Other obsolete review files, listed below | 7 | E/G/H |

The seven loose review files were `inspect_project_schema.sql`,
`PROJECT-CREATION-REVIEW.md`, `PROJECT-DELETION-REVIEW.md`,
`project_creation_data_preflight.sql`, `project_deletion_schema_inspection.sql`,
`project_deletion_dependency_query_generator.sql`, and
`repeating_project_smoke_validation.sql`.

Also retired: generated `spec/phase5-backup-reconciliation.json` (F) and
`tests/workbench-project-deletion-inspection.test.cjs` (H; two assertions only
protected the retired catalog/generator queries). Explicitly verified empty
investigation directories were removed non-recursively.

Combined read-only operational validations remain. The creation validation's
one-time title-filtered Recycle smoke query was removed; its catalog checks remain.
The repeating integration test now checks its own exact UUID, not a title.
Session-only logs/patches stay outside the repository.

## 4. Canonical database history retained

See the [per-file classification and policies](../supabase/review/README.md).
Both owner-deployed canonical migrations remain byte-for-byte unchanged:

- `202610250001_project_creation.sql`:
  `2D97F813ACA5776323F83DB967341FDEFAB23311A77BFD549F91C2D38A58427C`.
- `202610250002_project_deletion.sql`:
  `FE7129F45EE99D9EE649C8E0D0D5332FB789E88FF703A9E455B227CBEA35745F`.

Also retained: the Planner state migration, creation rollback/deletion disable
tools, creation preflight/validation, combined deletion deployment validation,
preview and post-validation, and the permanent deletion policy/runbook.
These files are database history/tools, not a complete fresh-database baseline.
Old preparation-time comments in immutable migrations are not current deployment
status. Never rerun SQL merely to tidy the repository.

## 5. Intentional historical archives

The original historical localStorage backup and owner-authored Phase 5 identity
crosswalk remain non-runtime evidence, not restore inputs. Phase 3-6 reports and
Sheets/state/UI design notes are clearly labeled historical/superseded.
The Phase 5 reconciliation Markdown retains input hashes and aggregate findings;
its generated row-level output is no longer required.
See [archive limitations](historical/README.md). Archived personal application
data must not be published as a web asset.

## 6. Dependency hygiene

Removed four unused direct Trips devDependencies: `@eslint/js`,
`eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, and `globals`.
Trips' ESLint config re-exports the root config, whose own dependencies resolve
these imports; the Trips ESLint executable itself remains active and retained.
Root lint dependencies, PGlite tests, Supabase, Capacitor, React/router, DnD,
Lucide and Vite/plugin dependencies have current consumers and remain.

Refreshed the Trips lock offline with scripts/audit/network disabled: 47
unneeded lock entries removed, no retained package version changed. Both root
and Trips manifest dependency maps match their lock root entries. Existing
pre-audit removal of the two React type-only direct dependencies was preserved.
Installed node_modules contains extraneous type/old lint packages and associated
transitives from prior installs and the lock-only removal; these are ignored
local state, not declared production dependencies. No broad prune or major
upgrade was performed. A future normal clean dependency installation can remove
them; mandatory lint/tests/build passed with the updated manifests/lock.

## 7. Security/configuration findings

No secret values were printed. Current tracked/nonignored untracked text and
generated bundles were pattern-scanned, plus ignored local environment files
and the historical versions of the root/Trips environment paths.

| Path/category | Removal required? |
| --- | --- |
| `trips/.env.example`: placeholder configuration | No |
| Ignored `.env.local`, `trips/.env.local`: public Supabase anon JWT | No; keep local files ignored |
| Generated `www` bundles: public Supabase anon JWT | No; public browser configuration, not a privileged credential |
| Historical tracked `trips/.env`: retired Apps Script endpoint | Not in current tree; intentionally historical Git record, do not restore |

No service-role JWT, `sb_secret` key, private key, OAuth access/refresh token,
OAuth client secret, GitHub credential or Google API key was detected by these
scans. This is not a certification of every historical blob or active endpoint.
No endpoint was contacted. No history rewrite/rotation was attempted.

Root ignore rules now cover `.env` and `.env.*` recursively while allowing
`.env.example`; ignored local runtime settings were preserved.
Browser publishable/anon keys rely on database grants/RLS for access control.
Saved schema has broad raw-table grants/RLS off: invoker RPCs do not by themselves
create user isolation or prevent bypass through separately permitted raw writes.
Revisit access control deliberately before expanding trust/users.

## 8. Legacy references

No active Sheets/Apps Script project persistence, legacy loaders/navigation,
historical backup import, localStorage Planner persistence, title-based project
resolution or compatibility middleware was identified. Negative regression tests
and archived documents deliberately mention retired formats.
Google OAuth token handling and Trips UI preferences in browser storage are
active, separate concerns, not legacy Planner persistence.
Planner title equality checks compare already-identified items, not project lookup.

## 9. Routes and navigation

| Modern destination | Current entry |
| --- | --- |
| Planner | `/`, `/index.html`, `/#planner`, `/planner`; `parking` alias |
| Dashboard | `/#dashboard`, `/dashboard` |
| Workbench | `/#workbench`, `/workbench` |
| Create Project | `/projects/new` |
| Calendar | `/#calendar`, `/calendar` |
| Daily Activities | `/#daily`, `/daily`; Activity Planner also has its own Vite HTML entry |
| Trips landing | `/#trips`; `/trips` hosted entry/direct route |
| Prioritize Trips | `/prioritize`, including optional `tripId` query |
| Timeline | `/timeline` |
| New Trip | `/new` |
| Trip details/Workflow | `/:tripId`; Workflow is a detail/editor section, NOT a standalone `/workflow` route |

Paths within the hosted `/trips` deployment use the existing router basename.
Deep-link refresh still requires the existing static-host SPA fallback.
No route or hosting semantics changed in housekeeping.

Timeline, Prioritize, TripDetails/Workflow and NewTrip Cancel explicitly use
`TRIPS_HOME_ROUTE = "/#trips"`, not root/default/history. Planner remains root.
Life Manager is absent as a navigation item, not removed as the app shell/title.
The main router shares `MainNavigation` and its CSS; standalone Activity needs
ordinary anchors across HTML entries but reuses the same route data/styles.
Trips, Prioritize and Timeline do not own duplicate navigation presentation.
Card delete stops propagation/default before opening the shared confirmation.
No separate mobile routing default or legacy navigation was restored.

## 10. Project lifecycle

Creation remains Workbench -> service/storage -> `create_workbench_project` ->
database UUID and PA/PB/PC/PD external ID -> exact raw type table -> `projects_all`.
Approved initial allocator floors remain home 209, vehicle 82, repeating 8,
misc 4, using higher existing maxima at initialization. Numbers have minimum
four-digit padding and can grow. RPC allocation never gap-fills or rewinds.
No browser UUID-as-external-ID workaround, max+1 or title fallback remains.
The explicit repeating checkbox selects type; recurrence selects its rule.

Editor and persisted-card delete share confirmation, UUID/canonical type/title,
Cancel-without-write, a ref-based double-submit guard and one service/RPC path.
Owned active remote notifications and ownership conflicts block deletion.
Parking -> weekly -> tasks -> exact raw master is atomic and master-last.
The UI removes/closes only after confirmed RPC success and then refreshes;
failures stay visible, including explicit committed-but-refresh-failed reporting.
No raw browser project delete or view mutation was introduced. Historical/global
rows and all allocator sequences remain outside the cascade.

## 11. Planner referential-integrity debt

Existing Planner writes and restore validate/resolve identities in application
code, but do not provide a database guarantee after concurrent project deletion.
Deletion locks protect its transaction; a stale writer can write after it commits.
No schema or writer redesign was made.

Future database validation should cover `planner_tasks.project_id`,
`planner_weekly_tasks.project_id`, repeating master/task/weekly parent identities,
and typed Parking conversion targets. A foreign key cannot simply target the
polymorphic `projects_all` UNION view. Define an approved canonical identity
model or database-side validation, including notification/week-settings and
concurrent write semantics, before choosing constraints. Add independent
multi-session tests; PGlite serializes these local operations.

## 12. Backup/recovery

Supabase is authoritative. The retained modern JSON backup API covers Planner tasks, weekly,
Parking and week settings, not project masters/Trips/activities/Google/credentials.
Restore is conflict-checked and insert-only, not a whole-database transaction.
Historical localStorage/Sheets formats are rejected; active imported weekly/
Parking reminders are held for review rather than scheduling remote work.
Disabling an RPC or rolling back an open transaction does not recover an already
committed deletion. Recovery requires appropriate Supabase backup/PITR covering
masters and dependents. No backup configuration or actual restore was tested.

## 13. Test/tooling cleanup

Bulky CSV inspection fixtures were replaced by
[compact test-only DDL](../tests/fixtures/workbench-schema.sql), preserving all four
raw project definitions, `projects_all`, three modern Planner definitions and
grants. Normalized DDL was compared for equivalence before removing source CSVs.
This fixture contains no live rows and is not a deployment baseline.

The fixture loader, schema-review, cascade, editor and opt-in native PostgreSQL
tests now consume permanent fixture/current operational evidence rather than
deleted investigation files. Duplicate data-only preflight execution was removed.
Current routing, navigation styles, semantic Back to Trips, allocator/type,
repeating creation, shared/card confirmation, atomic cascade, remote blocker,
rollback, sequence, backup and Planner integration regressions remain.

## 14. Validation

| Command | Result |
| --- | --- |
| `npm run lint` | PASS; no ESLint errors/warnings |
| `npm test` | PASS; 175 tests: 174 passed, 0 failed, 1 skipped |
| `npm run build` | PASS; main and standalone Activity builds, modern static publish |

The skipped test requires `WORKBENCH_TEST_PG_BIN`: real PostgreSQL deployment,
multi-session allocation, cancellation, rollback and reapplication. PGlite
regressions ran; they do not replace real multi-session PostgreSQL validation.
Expected injected error-path logs appear in tests; none represent a failed test
or a live Calendar/Supabase request.
Vite still warns about the main minified chunk exceeding 500 kB
(approximately 1,194 kB, 323 kB gzip); no warning threshold was suppressed.
PowerShell formats that stderr warning as a NativeCommandError record, but the
build exit code is zero and both outputs/publishing completed successfully.
Canonical migration/disable hashes match prior approved evidence.
`git diff --check` reports no whitespace errors; Git emits informational
CRLF-to-LF normalization notices for touched files.

## 15. Mobile readiness

Run `npm run mobile:sync` before the next Android APK rebuild/install so the
accumulated routing/navigation/source changes reach Capacitor's copied web assets.
This audit did not sync, regenerate assets or rebuild Android.

## 16. Repository checkpoint

The worktree was already dirty from approved navigation/default/Trips-return
changes and generated publishing output. Those changes were preserved.
Final `git status` inventory (entire accumulated worktree, not just this follow-up):

| Group | Modified tracked | Deleted tracked | Untracked |
| --- | ---: | ---: | ---: |
| Config/Trips tooling | 3 | 5 | 0 |
| Documentation | 15 | 1 | 2 |
| `src` | 9 | 27 | 0 |
| Supabase review/history | 2 | 99 | 1 |
| Tests/fixture | 9 | 1 | 1 |
| `www` static output/launcher | 3 | 14 | 14 |
| **Total** | **41** | **147** | **18** |

Modified source files: MainNavigation JSX/CSS, StandaloneNavigation,
LifeManagerRouter/lifeManagerRoutes, and Trips NewTrip/PrioritizeTrips/
TimelineView/TripDetails. These include earlier approved changes, not new route
semantics from housekeeping.
Modified config: `.gitignore`, `trips/package.json` and its lock.
Modified tests: navigation, phase6-live-cutover, phase7-modernization,
planner-vite, workbench-live-schema fixture loader, project deletion/editor/
PostgreSQL/schema-review suites.
Modified documentation: architecture, integration-notes, Phase 3/4, three Phase 5
reports, three Phase 6 reports, Phase 7, sheets-schema, state-flows, ui-screens,
workbench-project-creation. Supabase modifications are the deletion runbook and
creation operational validation.
The four non-generated untracked deliverables are this report,
`spec/historical/README.md`, `supabase/review/README.md`, and the permanent SQL
test fixture. The other 14 untracked paths are hashed published bundles.
Tracked `www` changes include both HTML entry files and the modern launcher;
14 obsolete hashed bundles are replaced by the 14 new published bundles.
All 77 retained spec/Supabase Markdown relative links resolve.

Review source/tests/docs/fixture and intentional removals as one scoped checkpoint.
Separately review generated `www` hashed bundles/deletions/HTML against the
repository's publishing policy; build output is not a new source implementation.
Do not accidentally stage `.env*`, local credentials, node_modules/dist caches,
native copied assets, session logs/patches or personal exports. Keep the approved
canonical SQL untouched. No blanket `git add .`, destructive cleanup or Git
history operation was performed or recommended.

## 17. Prioritized next work (not changes in this audit)

1. Before multi-user/broader exposure: review database grants/RLS and browser
   raw-write access against the intended trust model.
2. Database-side Planner reference validation with concurrent-delete/write tests.
3. Verify backup/PITR coverage and rehearse recovery outside production.
4. Run the opt-in native PostgreSQL allocator/concurrency suite in disposable CI;
   preserve grants/RLS and rollback checks.
5. Capture an approved complete schema baseline/live-drift verification for future
   changes; current historical migrations/test fixture are not that baseline.
6. Address production chunk size by measured lazy-loading if worthwhile.
7. Review historical Git endpoint exposure and archived personal-data retention
   separately; no history rewrite is authorized by housekeeping.

## 18. New feature development

**Ready for new feature development**, after reviewing and taking the scoped
checkpoint above. No local functional blocker remains in the tested scope.
Live hardening/backup recommendations must not be mistaken for permission to
modify the deployed schema or test destructive actions.
