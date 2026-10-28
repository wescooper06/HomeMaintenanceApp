# Single-owner Auth/RLS cutover (REVIEW ONLY)

No SQL in this package has been run against production. The application changes
are local, uncommitted and undeployed. Emergency containment A2 remains unexecuted.
These scripts are deliberately outside automatic migrations.

## Identity and application behavior

1. In Supabase Dashboard > Authentication > Users, create or identify the normal
   human email/password account. Set its password through the normal Auth
   workflow, confirm its email, and copy its **User UID**. Do not use the broker
   identity, an email address, a project UUID, a publishable key or a service key.
2. Record that immutable UUID in the private cutover record. Set the same value
   in `VITE_OWNER_AUTH_USER_ID` for **both** Vite entry builds and in the reviewed
   SQL execution copy's `owner_uuid`. Recreating the account creates a different
   UUID and requires a separately reviewed authorization change.
3. Keep `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` unchanged. The owner
   UUID is public configuration, not a secret or the database security boundary.
   Never put an admin key, database password or service-role key in the browser.
4. Both main and standalone Activity Planner mount their private route trees
   only after `getSession` plus server-validated `getUser(access_token)` confirm
   the configured owner and an unexpired session. Missing configuration, network
   failures, another user, invalid/expired sessions and logout close the gate.
   Email/password fields use browser password-manager autocomplete; submitted
   passwords are cleared from React state and never logged or retained by this
   code. There is no public signup/account-management UI.
   The production UUID is configured in `trips/.env.production` as
   `e72bccd9-ec2b-4822-bb5c-b7c1f39dcf60`, shared by both Vite configurations.
   This file contains only public owner configuration. It is ignored by the
   existing environment-file rule: an eventual source commit must explicitly
   force-add only this exact nonsecret file, never local environment files.
5. Supabase's existing SDK session persistence and auto-refresh remain enabled.
   Auth notifications revalidate outside the SDK notification lock. Notifications
   close/unmount private UI before validation; a token refresh can therefore
   remount the app and discard unsaved UI state. Persisted Planner records are
   not reset. Desktop, mobile and standalone entries share the same gate
   implementation; sessions are shared only where SDK storage/origin permits.
6. Sign-out immediately unmounts the app and requests SDK local-session sign-out.
   It does not erase Supabase data or disconnect Google Calendar. Already-issued
   access JWTs can remain valid until expiry: logout is not immediate revocation
   of a stolen JWT or cancellation of already-issued requests. Use appropriate
   Auth JWT lifetimes and the Dashboard session controls for incident response.
7. Google Calendar's OAuth state, consent, tokens and disconnect behavior are
   unchanged. Supabase login does not perform Google Calendar authorization.

The shared browser can no longer be trusted as the authorization boundary.
The RLS predicate below is the actual owner boundary, including callers that
bypass the UI. It grants the one owner access to the existing shared dataset;
it does not claim that existing rows contain per-user ownership columns.

## Exact grants and policy matrix

All entries below have **no PUBLIC/anon table privileges** after cutover.
S/I/U/D mean SELECT/INSERT/UPDATE/DELETE. Authenticated receives no TRUNCATE,
TRIGGER, REFERENCES or MAINTAIN. Policies are operation-specific, TO authenticated,
and compare `(SELECT auth.uid())` to the immutable owner UUID:
S/D use USING; I uses WITH CHECK; U uses both USING and WITH CHECK.

| Relation | Authenticated operations | RLS / policies |
|---|---|---|
| planner_tasks | S I U D | Enabled; owner S/I/U/D |
| planner_weekly_tasks | S I U D | Enabled; owner S/I/U/D |
| planner_parking_lot | S I U D | Enabled; owner S/I/U/D |
| projects_home | S I U D | Enabled; owner S/I/U/D |
| projects_vehicle | S I U D | Enabled; owner S/I/U/D |
| projects_repeating | S I U D | Enabled; owner S/I/U/D |
| projects_misc | S I U D | Enabled; owner S/I/U/D |
| activity_types | S | Enabled; owner S only |
| activity_rules | S I U D | Enabled; owner S/I/U/D |
| activity_weekly_grid | S I D | Enabled; owner S/I/D |
| trips | S I U D | Enabled; owner S/I/U/D |
| trips_workflow_metadata | S I U D | Enabled; owner S/I/U/D |
| trips_timeline | S I U | Enabled; owner S/I/U |
| projects_all | S | Ordinary UNION view; security_invoker=true; base-table RLS |
| project_registry | None | Enabled; no policies |
| projects | None | Enabled; no policies |
| repeatable_masters | None | Enabled; no policies |
| repeatable_overrides | None | Enabled; no policies |
| task_manager | None | Enabled; no policies |
| weekly_tasks | None | Enabled; no policies |
| curated_queue | None | Enabled; old shared-default policies removed; no replacement |
| parking_lot | None | Enabled; old shared-default policies removed; no replacement |
| planner_profiles | None | Enabled; old shared-default policies removed; no replacement |
| staged_queue | None | Enabled; old shared-default policies removed; no replacement |

The final ten tables are not referenced by the current deployed React data-access
flows. Historical import/queue SQL is not proof of current runtime dependency.
`parking_lot` is not modern `planner_parking_lot`. Legacy objects/data are retained,
not deleted or migrated. An older client deliberately loses their use.

Planner's normal row deletion is soft; DELETE grants are still necessary for
the invoker project-deletion RPC. Raw project INSERT/DELETE grants likewise
support invoker RPCs, while browser edit/read paths need UPDATE/SELECT.
RLS restricts direct requests too; grants cannot enforce "RPC only" for invoker
functions. Activities' grid regeneration is separate DELETE and INSERT requests,
not an atomic transaction; a failure between them can leave an empty grid and
must remain visible as an application error. Trips' insert/upsert-then-read,
metadata CRUD and timeline update/insert paths determine its grant matrix.

Each of the four existing project external-ID sequences gives authenticated
USAGE only. PUBLIC and anon get none. The invoker creation RPC checks owner
identity before allocating IDs. Wrong authenticated users still share the
authenticated sequence grant (RLS does not apply to sequences), but cannot
use the exposed creation RPC to allocate or create records. No sequence reset.

No table ownership, schema placement or application rows change. Existing FORCE RLS flags are retained,
not newly forced. postgres access and existing service_role privileges are
preserved; service_role's existing BYPASSRLS remains an administrative exception,
never a browser mechanism.

### Future-object default privileges (revised review-only scope)

**Package A:** For creator `postgres` only, revoke ALL default privileges from
PUBLIC, anon and authenticated on TABLES, FUNCTIONS and SEQUENCES at BOTH the
global layer and `IN SCHEMA public` (six scoped revocations).
Do not revoke from service_role, creators or other administrative roles.
Future application objects require explicit grants/RLS before browser access.

PostgreSQL schema defaults are additive: `IN SCHEMA public REVOKE` cannot cancel
global grants or the built-in global PUBLIC EXECUTE default for functions.
Consequently global revocation is necessary and explicitly also affects FUTURE
objects created by postgres in other schemas. Existing objects are not
changed by ALTER DEFAULT PRIVILEGES. This is not a blanket change to every
database role's defaults.

**Package B, open residual:** The accepted production v2 authority export proves
postgres can alter its own six scopes but not the six `supabase_admin` scopes.
This split intentionally does not alter managed defaults or require that authority.
Do not grant memberships, elevate postgres, or change the managed role.
Supabase platform support must remediate those defaults separately.

At transaction start all six managed layers must exactly match the accepted v2
evidence: no stored global rows (including implicit global PUBLIC function
EXECUTE), plus the three captured public-schema ACLs granting postgres, anon,
authenticated and service_role. ACL ordering is ignored; grantor, grant option,
grantee, privileges and stored-global-row presence are not. Any difference aborts.
The same managed catalog rows are compared before/after; any change aborts.
The transaction reports `RESIDUAL_MANAGED_DEFAULT_EXPOSURE` and verification
returns six managed rows under that label, plus six exact-evidence match results.
Only the six postgres rows must report `browser_defaults_empty=true`.

Rollback captures only the six changed postgres layers, including implicit
global built-in ACLs when rows are absent; it resets/replays only browser/PUBLIC
defaults. Owner/service defaults and all managed defaults are untouched.
The earlier 567-record and v2 630-record artifacts remain unchanged evidence.
Before this split cutover, save a fresh read-only capture as
`Owner-Auth-Rollback-Capture-v3.csv`, assemble
`Owner-Auth-Rollback-DISABLED-v3.sql` and hash into `Owner-Auth-SHA256-v3.txt`.
Expected unchanged-catalog total: **599** records (567 + one scope-count record
+ six resets + 25 default replay grants). Counts depend on live evidence.
Do not reuse v2 rollback: it attempts changes the executor cannot authorize.

Existing reviewed objects are secured independently of these future defaults.
Managed-created NEW public tables/sequences may still inherit broad anon and
authenticated grants; managed-created functions may inherit EXECUTE, including
global PUBLIC EXECUTE. Default privileges do not override existing-object
revocations, and by themselves do not bypass enabled RLS. Until platform support
resolves B, create application objects only through reviewed postgres-owned
DDL with explicit RLS/grants. Do not claim complete future-object hardening.

### RPCs

| Exact signature | PUBLIC | anon | authenticated | service_role |
|---|---|---|---|---|
| public.create_workbench_project(text,jsonb) | None | None | EXECUTE | Existing ACL preserved |
| public.delete_workbench_project(uuid,text) | None | None | EXECUTE | Existing ACL preserved |
| public.replace_planner_curated_queue(text,jsonb) | None | None | None | Existing ACL preserved |
| public.enqueue_planner_staged_task(text,text,jsonb) | None | None | None | Existing ACL preserved |
| public.import_planner_legacy_state(text,jsonb) | None | None | None | Existing ACL preserved |

All five must resolve through `to_regprocedure` and remain SECURITY INVOKER.
The creation RPC receives an owner check before allocation. The deletion RPC's
old "reject any RLS" guard is replaced by an owner check before locking; all existing locking,
UUID/type matching, dependency validation, notification blockers, deletion
counts and atomicity are retained. The check explicitly preserves postgres and
service_role administration. Both changed definitions are captured for rollback.
The scripts stop if expected source guard/body anchors differ (CRLF and LF are
normalized only for comparison/replacement). Do not loosen a failed check.

`projects_all` remains read-only. Setting security_invoker=true ensures the
view owner's privileges cannot expose base rows to another authenticated user.
Underlying project SELECT grants and RLS are both required. Do not replace it
with a definer view/function to bypass a permissions error.

## Files and execution gates

- [Preflight](owner-auth-preflight.sql): exact owner identity metadata, role
  paths, the 24 relations/four sequences and future-object default ACL evidence.
- [Rollback capture](owner-auth-rollback-capture.sql): **read-only** generator
  of the exact pre-cutover browser grants, old policies, RLS/FORCE flags, function
  definitions, sequence grants, view option restoration statements and the six
  changed postgres future-object default layers.
- [Cutover](owner-auth-cutover.sql): single transaction, disabled by default;
  no application-row writes. It requires postgres, a confirmed unbanned normal
  Auth identity, expected object ownership/types/functions, no browser membership
  paths, and no unexpected browser/PUBLIC column ACLs.
- [Verification](owner-auth-verification.sql): catalog-only post-change results.
- [Separate broker cleanup](owner-auth-broker-cleanup.sql): independently gated;
  must not be pasted into the owner cutover transaction.

Capture **24 relations, five functions, four sequences and six postgres default scopes**, all returned rows,
before any cutover change. Export rollback output with ordinal ordering, assemble
`rollback_sql` values into a single script, hash and preserve both CSV and SQL
outside the application tree. Review counts and original ACL grantors (expected
postgres), policy definitions and function bodies against captured evidence.
Any missing object/row, changed grants, unexpected browser columns/memberships, unexplained
function/view definition or failed gate is NO-GO, not permission to improvise.
The acknowledged 26 `planner_curated_api` SELECT column grants (7 Planner master,
16 weekly, 3 Home project columns) remain unchanged, are not relied upon, and
are reserved for separate broker cleanup. Synthetic SQL tests preserve them
through both cutover and rollback.

The generated rollback is itself disabled. Test/review it before authorization.
It restores pre-cutover grants/policies, including insecure anonymous access,
not application rows. It is not the preferred response to an app-only bug.
Prefer keeping the database closed and fixing the app, or the separately accepted
containment A2. Application rollback alone leaves the old anonymous app unable
to access the secured database. Never restore anonymous access automatically.

## Separate abandoned-broker retirement

Before normal owner-login acceptance, separately authorize disabling the
Dashboard **Custom Access Token Hook** so it cannot reject/rewrite normal human
tokens. Confirm a fresh owner session has the normal authenticated role without
the broker hook. This dashboard setting is not a transactional SQL setting.

Then use the separate review package to capture the hook definition/ACL, role
membership and role dependencies. B1 removes authenticator membership and drops
the unused hook with RESTRICT, only after dashboard disablement. B2 attempts
role removal only after individually reviewing/revoking residual dependencies;
dependency errors mean STOP, never DROP OWNED/CASCADE. No broad privilege
revocation across other roles/schemas is authorized by this package.

Separately identify the dedicated broker Auth account (not the human owner),
preserve its metadata if needed, end its sessions and disable/delete it through
Dashboard account administration. Do not directly DELETE auth.users or put
Admin API credentials in the client. Identity deletion is not automatically
reversible. If B1 needs reversal, replay the captured function/ACL and original
membership before separately considering dashboard hook reactivation; do not
reintroduce the hook into the owner-login rollout.

## Short production cutover (requires separate owner authorization)

1. Create/identify and confirm the normal human Auth identity; record UUID.
2. Separately disable the abandoned token hook; prove normal email/password
   login and normal authenticated role. Do not delete the human identity.
3. Run/review preflight and complete rollback capture. Preserve private exports
   as `Owner-Auth-Preflight.csv`, `Owner-Auth-Rollback-Capture.csv` and assembled
   `Owner-Auth-Rollback.sql` outside the repo. Review all current function bodies
   and `projects_all` definition, not just historical migrations. Include the
   split v3 default-scope capture and accepted postgres authority result. No application
   data needs to be retrieved for this review.
4. Configure the exact UUID in both builds. Locally build/test the authorized
   release, then separately commit/deploy login support through the normal
   Pages process. Refresh both entry URLs and Android package where applicable.
   Verify unauthenticated screens make no application-table requests.
   **The database remains exposed until step 5**; deploy-to-migration delay
   must be kept short. New UI alone is not containment.
5. Close old tabs/devices and pause writes. In an explicitly approved SQL copy,
   set `approved_for_execution=true` and exact `owner_uuid`. Execute the single
   cutover transaction as postgres. Require COMMIT, not a partial/error result.
6. Run catalog verification. anon privileges: none; unnecessary authenticated
   privileges: none; active policies: exact owner UUID/operations only; ten
   inactive tables: no policies or browser grants; view: invoker; authenticated
   EXECUTE: only two live RPCs. Compare service-role ACLs before/after unchanged.
   Check four sequence ACLs too. Confirm five functions remain invoker.
   Require six postgres layers hardened, six managed layers explicitly reported
   as residual exposure and six managed evidence-match results true. Do not
   require managed browser defaults to be empty or represent that they are fixed.
7. Fresh owner login; smoke-test Planner hydration, checklists, move/reorder,
   week navigation/rollover, explicit removal/restoration, recurrence and Parking;
   create/edit/delete one disposable project of each type (confirm modern
   dependency counts and preserve real projects); Activities rule edit and grid
   regenerate; Trips add/edit/delete, workflow metadata and timeline update.
   Verify Google Calendar connect/reminders independently.
8. Log out and reload both entry points; no private route mounts/application
   requests. Using an unauthenticated synthetic request, confirm direct data/RPC
   denial. If a separate test account is authorized, prove wrong-user SELECT
   returns no owner rows and mutations fail/affect zero rows. Do not create
   unrequested production test data/accounts without separate approval.
9. Run Supabase Security Advisor again; save results and production smoke
   receipts. Keep corrected containment A2 unexecuted as emergency fallback.
   Finish separately authorized broker role/identity retirement.

Expected write-pause/user-visible interruption is approximately **2-5 minutes**
for transaction, fresh login and initial checks after Pages is ready; full
smoke-testing may take **10-20 minutes**. Pages propagation, forgotten credentials,
hook problems or catalog drift can extend this; no zero-downtime guarantee.
Old cached clients lose data access at DB cutover and must refresh/login.

## Local validation boundaries and release readiness

The tests use only synthetic sessions and local PGlite PostgreSQL roles/RLS.
Project/Planner DDL and project RPCs use repository fixtures/review SQL.
Activities/Trips fixture columns exercise the access contracts, not an asserted
complete live DDL export. Production catalog exports are evidence, not proof
that future live schema/config matches. No live Auth service, network token
exchange, production RLS, Pages deployment or Android device was exercised.
Existing Planner, Activities, Trips and Google regression suites remain required
alongside the new auth and SQL integration tests.

### Completed local validation

- New focused suites: **19 passed, zero failed**. They exercise session gates,
  expiry, server identity validation, password login, logout/refresh races,
  StrictMode cleanup, rendered child mounting and browser-native timer receivers;
  SQL tests cover anon/wrong-user denial, owner operations, four-type project
  create/delete with modern dependency cascades, read-only activity types, grid
  regeneration, Trips, legacy denial, service-role ACL preservation, disabled
  execution gates, unknown-owner rejection, future tables/functions/sequences
  created by postgres (closed) versus managed-created objects (residual exposure),
  six managed drift rejection cases, exact postgres default restoration and
  preservation of all 26 acknowledged broker column grants.
- Full `npm test`: **292 tests; 291 passed, zero failed, one skipped** (the
  existing optional native PostgreSQL test). Planner rollover/recurrence,
  Projects, Activities, Trips and Google auth/reminder regressions passed.
- After the split revision, the focused 19 tests and full 292-test suite were
  rerun with those same passing totals. All six managed-scope drift cases reject
  before mutation. Verification reports six hardened postgres scopes and six
  unchanged residual managed scopes with six evidence matches. Rollback restores
  all changed defaults without any managed-default command. No application
  rebuild or browser test was rerun for this SQL-only revision.
- `npm run lint`: passed with no warnings. `git diff --check`: passed.
- Production release preparation ran `npm run build` using the confirmed public
  owner UUID and existing URL/publishable-key configuration. This generated local
  Pages assets only; no Pages deployment occurred. Main `www/trips` exactly
  matches all 17 `dist/trips` files. An independent standalone build to
  `dist/activity-planner` exactly matches all three `www/activity-planner` files.
  Vite reported its large-chunk warnings; no build errors.
- Real Chromium/SDK smoke of these production artifacts with every external
  request intercepted (synthetic Auth/REST fixtures; no production requests):
  no main-app data request before login; owner login initialized private data;
  logout returned to the login screen; standalone unauthenticated/wrong-user
  access made no data requests; a 390px mobile standalone owner login initialized
  Activities; logout/reload remained at login for both entries. The Planner
  fixture supplied week-settings and pagination, reached the rendered grid and
  completed its initialization reads. Wrong-user sessions never mounted either
  private UI or requested any application data.
  External Google/font/weather requests were intentionally blocked for this isolated
  check; real Google authorization was not exercised. A browser-native timer
  receiver issue found by this smoke was fixed and regression-tested.
- The temporary local preview server was stopped. No production call, SQL
  execution, credential change, deployment, commit, push or staging occurred.

### Proposed release boundaries

The source commit is limited to the Auth boundary/controller, both entry wrappers,
the public production owner config/example, two test suites, architecture and
the five owner-auth SQL/runbook artifacts (including revised preflight/default
capture/verification). The separately reviewed broker-cleanup SQL stays outside
the application release, as does the unrelated untracked Downloads directory.
The Pages commit includes only the coordinated `www/trips` and
`www/activity-planner` generated deltas (new chunks, replaced HTML and removed
superseded chunks). No generated configuration or database script is executable
through Pages deployment.

Proposed messages:
- `feat(auth): gate applications behind single-owner Supabase login`
- `build(pages): publish owner-auth application assets`

Only a later separately authorized push/fast-forward of the release onto main
and successful GitHub Pages deployment from main/(root) makes the login UI live.
A local build, source commit, dev push, or source-only commit does not update
the served generated app. Verify both live entry URLs after Pages completion;
cached tabs may still need a forced refresh. Until the coordinated DB transaction
commits, the old browser-role database exposure still exists.

The owner UUID, disabled hook, existing-object preflight, v2 capture and six
postgres authority scopes have been accepted. The owner explicitly accepted the
split managed-default residual. Application release validation remains accepted;
no rebuild/browser rerun is needed for this SQL-only revision.
Source/Pages commits may proceed on separate authorization.
**NOT READY for production execution** until fresh split v3 rollback capture is
assembled/hash-verified, split SQL review and login UI deployment are complete,
and production execution is separately authorized. Managed-role authority is no
longer a blocker for A; Package B remains open and tracked for platform support.

## Package B: Supabase Support request (not submitted)

Subject: Managed supabase_admin default privileges expose future public objects

Our project is home-maintenance-app. Read-only catalog checks show that SQL Editor
executes as postgres (not superuser) and cannot alter defaults for supabase_admin.
Please provide a supported platform-admin remediation for the six managed default
scopes: TABLES, FUNCTIONS and SEQUENCES, each GLOBAL and IN SCHEMA public.

The three stored public-schema default ACLs grant anon and authenticated all
table privileges (including TRUNCATE, REFERENCES, TRIGGER, MAINTAIN), function
EXECUTE and sequence SELECT/UPDATE/USAGE. Global default ACL rows are absent;
the built-in global function default therefore also grants PUBLIC EXECUTE.
Schema-only REVOKE cannot cancel that global function default.

We request removal of PUBLIC/anon/authenticated automatic grants in those six
supabase_admin scopes, preserving service_role and required owner/administrative
defaults. Please confirm the supported execution method, any managed-service
dependencies, whether Supabase provisioning will recreate these defaults, and
how to keep them hardened. Global changes also affect future managed-created
objects outside public; please assess that impact before applying changes.

Do not grant postgres membership in supabase_admin, elevate postgres, modify
role attributes, rotate credentials, or change application data. No existing
object changes are requested in this support item. Our separately reviewed
owner-auth/RLS package secures existing application objects and postgres-owned
future defaults; it deliberately leaves these managed defaults unchanged and
reports RESIDUAL_MANAGED_DEFAULT_EXPOSURE.

We can provide redacted catalog/authority evidence through the support channel.
Please propose the remediation and validation/rollback procedure for our approval
before performing changes.
