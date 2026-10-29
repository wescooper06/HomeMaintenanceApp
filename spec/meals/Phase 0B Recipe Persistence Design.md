# Phase 0B Recipe persistence design and preflight

Status: **PHASE 0B RECIPE FOUNDATION DEPLOYED AND TECHNICALLY VERIFIED; PHASE 1 LOCAL APPLICATION CANDIDATE AWAITS DEPLOYMENT REVIEW AND OWNER ACCEPTANCE**.
Design run: `P0-DESIGN-001`, 2026-10-28.
Read-only production preflight: `P0B-PREFLIGHT-001`, 2026-10-28 local / 2026-10-29 UTC.
Accepted baseline: `75de46464a3b4eb5c72f4fadb9ac8c0baefde9d7`.

## 1. Executive summary and authority

Requirements v0.3 controls behavior. The Implementation Plan controls sequencing;
the workbook and its Update Protocol control acceptance. All four artifacts and
the Meals README were inspected. Phase 0A decisions and owner acceptance stand.

Propose three public tables: Recipes, Recipe Categories and Recipe Cuisines.
Ordered ingredient sections are a validated JSONB array in the Recipe row, not
separate browser-written child rows. This is a deliberate minimal design: saving
the entire Recipe is one atomic RLS-protected INSERT or UPDATE, without a CRUD
RPC, a multi-request child-replacement transaction, or a duplicate search cache.

No Shopping, meal-plan, Import, Planner, broker or Auth-user change is proposed.
No browser/service/UI implementation is included in this design assignment.

## 2. Current repository and database conventions

- Local and remote dev/main matched the accepted baseline at task start.
- Prior source/release commits `adf1e13` and `8298e2e` are in that baseline.
- Initial tracked tree/index were clean. Excluded untracked paths: 155 Downloads
  paths and the separate owner-auth broker-cleanup SQL. Their content was not read.
- Proposed SQL follows the existing `supabase/review/202610250001_project_creation.sql`
  convention: reviewed candidates remain outside `supabase/migrations/`.
  The existing numbered migrations directory is not an authorization mechanism.
- Owner cutover uses a disabled gate, transaction/timeouts, explicit grants and
  exact-owner operation policies. This draft reuses that approach without editing
  existing security SQL, defaults, roles or policies.
- Existing services use injected `getSupabaseClient`, explicit field mapping,
  UUID validation and contextual thrown errors. Trips/Activity readers paginate
  rather than silently accepting the first API page. Reuse those patterns, not
  Planner's text normalization, tombstones, metadata or recovery machinery.
- Existing PGlite role tests emulate `auth.uid()` from a synthetic request claim.
  Native PostgreSQL tests use disposable localhost clusters and an optional
  `WORKBENCH_TEST_PG_BIN`, never a production connection string.
- The separately authorized read-only Dashboard preflight has now completed.
  Production PostgreSQL is 17.11, UTF8, en_US.UTF-8; executor/database postgres,
  current schema public. All twelve sampled active application tables are
  postgres-owned with RLS enabled. No proposed object/name collision was found.

## 3. Proposed object inventory

All application objects use schema `public` and owner `postgres`.

| Object | Type | Purpose / requirements |
|---|---|---|
| `meals_recipes` | table | Recipe identity/fields, ordered ingredient blocks; RE-DATA-001 through RE-DATA-007, RE-VAL-001, RE-FUNC-005 through RE-FUNC-011, section 14 |
| `meals_recipe_categories` | table | Reusable Recipe classifications; RE-DATA-002, RE-FUNC-001, RE-FUNC-002, RE-FUNC-014 |
| `meals_recipe_cuisines` | table | Reusable Cuisines; RE-DATA-003, RE-FUNC-003, RE-FUNC-004, RE-FUNC-015 |
| Three primary-key indexes | B-tree indexes | UUID identity and keyset traversal |
| Two lookup name unique indexes | expression B-tree indexes | Case-insensitive normalized-name identity |
| Two Recipe foreign-key indexes | B-tree indexes | Category/Cuisine filters and referenced-delete checks |
| `meals_recipe_before_write()` | internal trigger function | Server timestamps, immutable IDs, ingredient shape; DB-DATA-001 |
| One before-write trigger per table | three triggers | Invoke internal validation/metadata handling |
| Four owner policies per table | twelve policies | ARCH-002 through ARCH-005, ARCH-012, DB-SEC-001 through DB-SEC-004 |

No views, sequences, new schemas, extensions, browser RPCs or separate ingredient
table are required. Table row/composite array types are PostgreSQL-owned automatic
implementation objects, not separately exposed APIs.

## 4. Detailed physical data model

### Common identity and timestamps (all three tables)

| Column | Type | Null | Default | Other behavior |
|---|---|---|---|---|
| `id` | uuid | no | `pg_catalog.gen_random_uuid()` | PK; client UUID accepted on INSERT for stable retry identity; UPDATE forbidden |
| `created_at` | timestamptz | no | `statement_timestamp()` | Trigger overrides on INSERT; retains original on UPDATE |
| `updated_at` | timestamptz | no | `statement_timestamp()` | Trigger assigns on every INSERT/UPDATE |

### Category and Cuisine

Each has the common columns plus `name text NOT NULL`, with nonempty and canonical
storage CHECKs. The trigger removes surrounding whitespace on INSERT and UPDATE;
the unique index is `lower(name)`.
Names are not required Recipe fields. No seeds, taxonomy or cross-domain lookup
table is created. Duplicate Recipe titles are allowed; duplicate normalized lookup
names within each lookup table are not.

### Recipe

| Column | Type | Null | Default / constraint |
|---|---|---|---|
| `title` | text | no | no default; at least one non-whitespace character |
| `category_id` | uuid | yes | null; FK to Recipe Category UUID |
| `cuisine_id` | uuid | yes | null; FK to Cuisine UUID |
| `source` | text | no | empty string; text or URL, no URL-only constraint |
| `favorite` | boolean | no | false; absence of a favorite means false |
| `ingredient_sections` | jsonb | no | `[{"name":"Ingredients","text":""}]` |
| `instructions` | text | no | empty string |

Both FKs use `ON UPDATE RESTRICT ON DELETE RESTRICT`; removing a Recipe does not
remove reusable values. Recipe deletion removes the row and its embedded sections
physically. No generalized deletion flag/history/tombstone is introduced.

`ingredient_sections` must be an array. Every member must contain exactly two
string properties, `name` and `text`. Empty array, empty section name and empty
section text are valid. Array position is authoritative section order; section
names need not be unique. JSON object-key order has no meaning. The before-write
trigger rejects malformed members with SQLSTATE 23514, atomically with the save.

No `owner_id` exists: these are consistently a **single designated-owner domain**,
not multi-tenant tables. Every allowed operation checks the same exact Auth UUID.
All rows, including administrative inserts, belong to that private domain.
Non-owner identities cannot create their own rows or rows "for" the owner.
Adding multi-user ownership later requires a separately reviewed migration.

## 5. Text-preservation design

- Database writes preserve title, Source, Instructions and ingredient string
  content, including whitespace and leading/trailing/internal blank lines.
- JSONB changes object-key serialization only; decoded string content and array
  order round-trip. No splitting, parsing, trimming, deduplication or blank-line
  removal occurs on save. PostgreSQL text/JSON limitations (notably U+0000) apply.
- LF, CRLF and mixed line endings already present in a submitted string are
  retained. Browser textarea controls may normalize pasted newlines to LF before
  the application receives them; do not claim recovery of the original clipboard
  byte encoding. Preserve the actual controlled editor value thereafter.
- Display text with whitespace-preserving rendering in Phase 1. Do not feed it
  through Planner task/checklist normalization.
- UI initializes a new Recipe with one Ingredients section; DB default provides
  the same shape when the field is omitted. Removing all sections stores `[]`.
- Empty Instructions stores `''`; no instruction-step records are created.
  Null optional UI inputs map deliberately to empty text before submission.
- UI/service validate types and nonblank Title without changing original Title.
  DB enforces Title, JSON shape, FK/type integrity. Empty optional values never
  become additional required Recipe fields.
- Future Phase 2 ignores blank ingredient lines only when producing the Shopping
  selection, not by altering Recipe storage.

## 6. Category/Cuisine lifecycle

Select UUIDs, not copied names. Create a reusable value independently, then assign
its UUID to a Recipe. A failed subsequent Recipe save may leave a valid unused
lookup value; report failure and retain entered Recipe/lookup IDs for retry.
Do not silently delete that reusable value as compensation.

Rename updates the lookup row, so subsequent joined reads reflect the name for
every Recipe without mass rewriting Recipes. Delete a referenced value fails
with FK SQLSTATE 23503; surface "in use; reassign Recipes first." Never convert
that failure into apparent success. Delete an unused value physically.

Case-insensitive uniqueness uses database `lower` under en_US.UTF-8. Lookup names
are stored canonically, with surrounding ECMAScript String.trim whitespace removed:
U+0009..000D, U+0020, U+00A0, U+1680, U+2000..200A, U+2028/2029,
U+202F, U+205F, U+3000 and U+FEFF. The migration explicitly enumerates that set
for deterministic database btrim behavior. Original case and internal whitespace
are preserved. Future service validation uses String.trim for lookup names only.
This normalization never touches Recipe Title, section names/text, Instructions
or Source. Blank/whitespace-only names fail the DB CHECK (23514);
duplicate keys fail 23505. On a create race, report/reload the existing value,
not a blanket catch returning fabricated success. Production samples verified
ASCII/UTF8 lowercase and NBSP/EM SPACE canonicalization; local tests also cover
insert/rename canonical storage, Unicode padding, duplicates and blank names.

## 7. Search design

Initial single-owner scale does not justify an extension or a specialized index.
Propose complete direct-table reads using stable UUID keyset paging:
`order('id').limit(500)`, followed by `gt('id', lastId)` until an **empty** page.
Do not stop on a short page: the API server's cap may be lower than requested.
Page failures reject the complete load; do not render a partial library as complete.
Do not filter only page one. Lookup readers must also page to completion.

Apply literal case-insensitive substring matching to Title OR any section's
`text`, using the same ECMAScript lowercase/includes semantics for both.
Never search JSON serialization, property names, section headings or Instructions
as substitutes for ingredient text. A term cannot span two separate sections.
Category UUID, Cuisine UUID and Favorite filters combine with the search using
AND. Empty search means no search restriction. Percent, underscore, backslash,
quotes, comma, parentheses and asterisk are ordinary text: no wildcard parsing,
SQL interpolation or PostgREST `.or()` grammar is involved.

The local SQL reference test independently exercises `ILIKE` using bound
parameters with backslash, percent and underscore escaped before surrounding
the term with `%`. It is not a new exposed SQL endpoint. If server-side ingredient
search is justified later, review a security-invoker query shape or search API
with complete paging; do not quietly change semantics to prefix/token search.

UUID/FK indexes cover identity and classification. A B-tree does not accelerate
`%substring%`; no misleading lower(title) index is proposed. `pg_trgm` is not
required or installed. Read all matching records before desktop sorting/paging.

As with current readers, multiple HTTP requests are not a database snapshot:
serialize local writes against a load, invalidate/refetch on successful mutation,
and detect/retry inconsistent counts/duplicate IDs rather than claim snapshot
isolation. Concurrent cross-device changes can still require a refresh. Review
snapshot/server-search needs if scale or concurrent editing changes.

## 8. Browser operation matrix

Each object below is the whole exact-owner domain; anon and non-owner behavior
is identical across its Recipe and embedded ingredient data.

| Object | Role/context | SELECT | INSERT | UPDATE | DELETE | EXECUTE | Reason / IDs |
|---|---|---|---|---|---|---|---|
| Recipes, including sections | anon | no | no | no | no | n/a | ARCH-004; SEC-TST-001/002 |
| Categories | anon | no | no | no | no | n/a | same |
| Cuisines | anon | no | no | no | no | n/a | same |
| Recipes, including sections | authenticated owner | yes | allowed columns | allowed columns | yes | n/a | RE-DATA-001..007; RE-FUNC-005..012; RL-FUNC-009/012; RD-FUNC-003/005 |
| Categories | authenticated owner | yes | id/name | name | unused only | n/a | RE-FUNC-001/002/014 |
| Cuisines | authenticated owner | yes | id/name | name | unused only | n/a | RE-FUNC-003/004/015 |
| All three tables | authenticated non-owner | no rows | denied | no rows | no rows | n/a | ARCH-005; SEC-TST-005 |
| All three tables | service_role administration | yes | yes | yes | yes | n/a | Explicit administrative CRUD, not browser owner authorization |
| Internal trigger function | PUBLIC/anon/authenticated/service_role | n/a | n/a | n/a | n/a | no | Not an application RPC |
| Internal trigger function | postgres | n/a | n/a | n/a | n/a | owner | Create triggers/administration |

Authenticated table-level grants are SELECT and DELETE only. INSERT/UPDATE use
explicit column grants. Recipe INSERT: id/title/category_id/cuisine_id/source/
favorite/ingredient_sections/instructions. Recipe UPDATE: same minus id.
Lookup INSERT: id/name; UPDATE: name. No timestamp writes, TRUNCATE, REFERENCES,
TRIGGER, MAINTAIN, grant option or blanket GRANT ALL.

The migration grants service_role exactly CRUD, without browser secrets or a
service client. It is an administrative BYPASSRLS role in local tests; verify
its actual production attributes. Table owners/postgres bypass ordinary RLS.

## 9. Exact RLS/policy design

Enable RLS explicitly on all three tables, with FORCE RLS false (as the existing
owner baseline). For each table T, the four exact names/clauses are:

| Name | Operation / role | USING | WITH CHECK |
|---|---|---|---|
| `T_owner_select` | SELECT / authenticated | P | absent |
| `T_owner_insert` | INSERT / authenticated | absent | P |
| `T_owner_update` | UPDATE / authenticated | P | P |
| `T_owner_delete` | DELETE / authenticated | P | absent |

P is exactly:
`(SELECT auth.uid()) = 'e72bccd9-ec2b-4822-bb5c-b7c1f39dcf60'::uuid`.
T is exactly `meals_recipes`, `meals_recipe_categories` or
`meals_recipe_cuisines` (twelve names). Policies are permissive but there are no
other policies; the postflight rejects extras. Null claims deny access.

All tables use the same fixed predicate rather than chained lookup/parent
policies. There is no missing child-owner check: embedded sections are protected
by their Recipe row. FKs point only to the same single-owner-domain tables.
Anonymous ACL denial occurs before RLS. Authenticated non-owner SELECT/UPDATE/
DELETE may return zero rows rather than an exception; services must not call an
unconfirmed mutation successful.

## 10. Functions, views, sequences, extensions and triggers

One internal `RETURNS trigger` PL/pgSQL function, SECURITY INVOKER, owner postgres,
`search_path = ''`; three BEFORE INSERT OR UPDATE row triggers. Needed to enforce
server metadata, canonical lookup names and JSON members without a separate
callable validator.
No data access or dynamic SQL in this function. Unintended EXECUTE is explicitly
revoked from PUBLIC, anon, authenticated and service_role.

PostgreSQL checks EXECUTE when the postgres owner creates the trigger; browser
table mutations invoke it without granting a callable function API. Local tests
prove that separation. Direct invocation is denied and a trigger-return function
is not a usable ordinary Recipe RPC. Reverify deployed ACL/definition/security.
No SECURITY DEFINER, custom view, sequence, extension or client-callable RPC.
UUID uses built-in `pg_catalog.gen_random_uuid()`, not an assumed extension.

## 11. Timestamp design

Defaults and the trigger use database `statement_timestamp()` (timestamptz).
The trigger overrides supplied INSERT timestamps, preserves created_at on UPDATE,
and sets updated_at for every update, including Favorite and lookup renames.
An update within the same statement may share a timestamp; this is operational
metadata, not a strict sequence, revision token or conflict-resolution mechanism.
No universal existing timestamp trigger is assumed/reused.

## 12. Deletion and future Phase 3 compatibility

Phase 1 confirms deletion in UI, then actually deletes Recipe rows. Embedded
sections disappear with their row; reusable lookups survive. Multi-delete is
one filtered table DELETE, not a loop that masks partial success.

The stable Recipe UUID can be a future nullable meal-plan FK. Phase 3 must add
an atomic reviewed conversion preserving the *current* Recipe title for every
linked occurrence before the Recipe disappears, then clear the link and retain
editable free text (PM-FUNC-008..011; E2E-08/09). `ON DELETE SET NULL` alone is not
enough to capture the latest title. No scheduled rows/trigger/FK or Planner
changes are created now; the Phase 3 migration must replace/extend deletion
behavior before any linked occurrences are allowed.

## 13. Draft migration

[Executable candidate](../../supabase/review/202610280001_meals_recipe_foundation.sql).
The first gate is now true under separate candidate-preparation authorization.
This boolean is not production execution authorization. Do not move to automatic
migrations or execute until the owner authorizes the exact new candidate hash.
The historical disabled/draft header in SQL is intentionally unchanged to keep
the migration diff limited to that boolean.

The transaction checks executor, human-owner metadata, browser role safety,
auth.uid/native UUID availability and namespace collisions before creation.
Creates three tables, seven indexes, one function, three triggers and twelve
policies. Explicitly resets each new object's browser ACL and grants only the
matrix. Unexpected inherited role ACLs abort instead of changing managed defaults.
No existing application rows/default privileges/security architecture are changed.
No IF NOT EXISTS/CREATE OR REPLACE hides partial deployment or conflicting objects.
Lock/statement timeouts bound the operation. Execute once only after authorization.

## 14. Reversal strategy

[Disabled reversal](../../supabase/review/meals_recipe_reversal_DISABLED.sql).
Separate false gate. Locks all three tables, refuses **any** Recipe/lookup data,
then drops Recipes before lookups, and finally the now-unused trigger function,
all with RESTRICT inside a transaction. Table-owned triggers/policies/indexes and
row types are removed with their table. No CASCADE, DROP OWNED or role reassignment.

Safe only for the reviewed, unused schema with no external incoming dependencies.
After Recipe use, preserve/export all three tables and identities/relationships
and review a new forward-fix/data-preserving recovery plan. This script deliberately
does not offer an override to delete live data. It does not restore Auth users,
and preparation authorizes no execution.

## 15. Local test plan and files

[PGlite tests](../../tests/meals-recipe-persistence.test.cjs) execute only disposable
in-memory databases using the actual executable candidate without modifying it.
Tests reconstruct the disabled version in memory and require its SHA-256 to
match the reviewed disabled source before testing its refusal. Scenarios:

1. Exact candidate equivalence, disabled/identity/collision guards and unchanged hostile/default ACL fixtures.
2. Anon all-operation denial on every table; no trigger EXECUTE.
3. Owner create/read/update/delete, title-only creation, exact mixed line-ending/
   blank-line string round trips, section reorder, defaults, empty sections,
   malformed JSON atomic failure, FK/type constraints and timestamp protection.
4. Both lookup lifecycles: normalized duplicate rejection, rename reflected,
   referenced-delete failure and unused delete.
5. Synthetic authenticated wrong/missing UUID: no reads/inserts/updates/deletes;
   original owner-domain data unchanged.
6. Literal search symbols, title/ingredient matching, AND filters and a forced
   matching UUID beyond the first two-row page.
7. Service-role administrative behavior, exact catalog matrix and negative ACL,
   policy, trigger-function body and constraint drift checks.
8. Reversal disabled/nonempty/dependency refusal; empty reversal and reapplication.

These are executable design/SQL tests, not acceptance of a deployed feature or
proof that a Recipe service/UI exists. Tests use synthetic claims only locally.
No credentials, browser storage, production requests or persistent test data.
Native PostgreSQL follow-up should repeat these cases in the repository's
disposable localhost-cluster convention, including concurrent normalized lookup
creation, delete-while-reference race, timeouts, trigger invoker privileges and
production-version/collation parity. Do not point that harness at Supabase.

Executed local evidence: all eight new PGlite tests passed; the combined Recipe
design, existing owner-RLS and accepted Meals routing run passed 22 tests with
no failures/skips. New test-file ESLint passes. No application build was needed:
runtime source, entry points and generated assets are unchanged. These results
do not change any controlled workbook acceptance result.

## 16. Authorization test plan

Use the exact draft plus anon/authenticated/service_role fixtures; set claims
locally as existing owner-RLS tests do. Owner UUID is the configured production
authorization constant; test other UUID is synthetic, not a live Auth identity.
Anon must lack relation/column and routine ACLs. Non-owner RLS zero-row mutations
must leave owner contents unchanged, and INSERT must fail. Owner tests cover
every approved business operation and forbidden metadata writes.

Future injectable service tests must additionally cover complete API paging
(including smaller server caps), identity-safe retry, API errors/no success
fallbacks, unconfirmed update/delete, mapping without trimming, persisted reload,
and editor-value retention after save failure. Do not add a service merely to
pretend this design assignment completed Phase 1.

## 17. Read-only production preflight plan

[Preflight SELECTs](../../supabase/review/meals_recipe_preflight.sql) ran through
the authenticated Dashboard after separate read-only authorization. The original
catalog SELECT and a source-controlled supplemental SELECT were captured in full.
Future reruns must preserve the same fail-closed boundaries:

1. Check authenticated Supabase Dashboard origin, exact project URL ref
   `tawvchmjtkgykwwvnnnn`, and displayed project name `home-maintenance-app`.
   Stop if any disagree or the session expires; owner signs in directly.
2. Run only the reviewed SELECT, with exact request/query equality and an
   allowlist rejecting mutation statements/functions. Hardcoded expected labels
   returned by SQL are **not** project identity proof. SQL Editor database name
   `postgres` alone does not identify a Supabase project.
3. Verify postgres execution context, human owner exists/confirmed/nonanonymous/
   unbanned, public/auth schemas and required USAGE, browser role attributes and
   memberships, auth.uid/native UUID availability, language/collation/version.
4. Stop on any Meals/Recipe naming collision or unreviewed incoming/outgoing
   dependency. Inspect complete definitions of any conflicting routine before
   revising the draft; never overwrite it.
5. Record global/public default ACLs as context. Do not edit the six managed
   defaults, wait for their cleanup, or claim they secure new objects.
6. Preserve complete untruncated response, zero arrays, SQL hash, context and
   row counts in session/private approved evidence, never credentials/session
   secrets. No application data scan is required.

Observed result: no collisions or proposed-object dependencies; browser roles
have no membership/super/BYPASSRLS, required schema/function/language permissions
exist, and postgres has CREATE in public. Built-in and existing auth function
PUBLIC EXECUTE/schema USAGE are not private Meals data privileges. Existing
managed defaults and the postgres non-inheriting broker membership remain
informational, unchanged, and do not enter the proposed object ACL model.

Missing postgres ownership/CREATE authority, absent role/schema usage, unexpected
role inheritance, unexpected UUID/auth semantics or conflicting object state
blocks production authorization.

## 18. Post-deployment verification plan

[Postflight SELECT](../../supabase/review/meals_recipe_postflight.sql) must not be
run against production before deployment. Tests execute it against local fixtures
only. Reconfirm Dashboard identity first. Require every check true, inspect the
complete returned evidence and compare the function definition with the reviewed
draft. It checks:

- Exact table/column/type/nullability/default inventory, ownership and RLS.
- All twelve policy names/roles/commands/expressions; no extra policies.
- Table and column grants, grantors/grantability, inherited anon access and
  browser-role safety.
- Exact constraints and indexes, no views/sequences/extra Meals routines.
- Three invoker triggers, function owner/language/config/ACL and reviewed body
  fingerprint (built-in MD5 is only a drift check; also compare full definition).
- No unreviewed role dependency, including any broker role.

Capture outgoing routine/policy dependencies and review them against built-ins,
auth.uid and the three new tables; source-test the draft for prohibited broker
references. No broker memberships/grants/objects are needed or changed.

Catalog equality plus local role tests are not a live signed-JWT mutation test.
After separately authorized deployment, rerun local/native tests against the
verified migration and arrange fresh owner CRUD/search/text/lifecycle smoke via
the existing owner session, then clean only specifically created test rows.
Review new Meals-related Supabase Security Advisor findings. Non-owner browser
or API verification needs a valid permitted test identity/session; never invent
a signed token, use service_role as a non-owner, create an Auth user implicitly,
or request credentials. If unavailable, record that live check as outstanding,
not Pass; production policy/ACL evidence and local synthetic tests stay separate.

## 19. Acceptance Workbook planning and exact mapping

Original design left the workbook byte-identical. The authorized preflight adds
planning/evidence only to Database Verification DBV-ARCH-009, DBV-ARCH-015,
DBV-PROJECT-001 and DBV-BROKER-001 under P0B-PREFLIGHT-001. Their Status remains
Not Built and Verification Stage remains Both; notes identify preflight-only
evidence, with post-deployment checks outstanding. No acceptance result/phase
decision is changed for the proposed, undeployed schema.
Future authorized implementation updates existing technical fields per protocol,
preserving all Phase 0A results and owner notes.

### Requirements

Persistence: RE-DATA-001..007; RE-VAL-001; RE-FUNC-001..008, 010, 011, 014, 015;
DB-DATA-001. Save/failure contracts enable RE-FUNC-009/012/013 and STATE-001..005/007.
Search/filter/favorite/delete enables RL-FUNC-001..007, 009, 012, 018, 019;
detail enables RD-UI-002..004 and RD-FUNC-003..005.
Architecture/security: ARCH-001..009, 012..015; DB-SEC-001..012; SEC-TST-001..010.
Conditional view/sequence/RPC requirements require an evidenced not-applicable
disposition for this slice, not invented objects or an automatic whole-row Pass.
ARCH-010/011 and PM-FUNC-008..011 are future compatibility only, not implemented.

### Exact Security Test IDs

ARCH-001-T01, ARCH-002-T01, ARCH-003-T01, ARCH-004-T01, ARCH-005-T01,
ARCH-006-T01, ARCH-007-T01, ARCH-008-T01, ARCH-009-T01, ARCH-012-T01,
ARCH-013-T01, ARCH-014-T01;
SEC-TST-001-T01, SEC-TST-002-T01, SEC-TST-003-T01, SEC-TST-004-T01,
SEC-TST-005-T01, SEC-TST-006-T01, SEC-TST-007-T01, SEC-TST-008-T01,
SEC-TST-009-T01, SEC-TST-010-T01.

Already-passing Phase 0A rows remain passing for their recorded scope; fresh
data-object execution evidence is still required. Do not reuse shell evidence as
future data-layer RLS proof.

### Exact Database Check IDs

DBV-ARCH-004, DBV-ARCH-009, DBV-ARCH-013, DBV-ARCH-014, DBV-ARCH-015;
DBV-DB-SEC-001, DBV-DB-SEC-002, DBV-DB-SEC-003, DBV-DB-SEC-004,
DBV-DB-SEC-005, DBV-DB-SEC-006, DBV-DB-SEC-007, DBV-DB-SEC-008,
DBV-DB-SEC-009, DBV-DB-SEC-010, DBV-DB-SEC-011, DBV-DB-SEC-012;
DBV-DB-DATA-001, DBV-PROJECT-001, DBV-BROKER-001.
DBV-ARCH-010 is reserved for the separate later meal-plan domain.

### Exact persistence-enabled functional tests (not accepted now)

RE-DATA-001-T01, RE-DATA-002-T01, RE-DATA-003-T01, RE-DATA-004-T01,
RE-DATA-005-T01, RE-DATA-006-T01, RE-DATA-007-T01;
RE-FUNC-001-T01, RE-FUNC-002-T01, RE-FUNC-003-T01, RE-FUNC-004-T01,
RE-FUNC-005-T01, RE-FUNC-006-T01, RE-FUNC-007-T01, RE-FUNC-008-T01,
RE-FUNC-009-T01-D, RE-FUNC-009-T01-M, RE-FUNC-010-T01, RE-VAL-001-T01,
RE-FUNC-011-T01, RE-FUNC-012-T01, RE-FUNC-013-T01, RE-FUNC-014-T01,
RE-FUNC-015-T01;
RL-FUNC-001-T01, RL-FUNC-002-T01, RL-FUNC-003-T01, RL-FUNC-004-T01,
RL-FUNC-005-T01, RL-FUNC-006-T01, RL-FUNC-007-T01,
RL-FUNC-009-T01-D, RL-FUNC-009-T01-M, RL-FUNC-012-T01,
RL-FUNC-018-T01, RL-FUNC-019-T01;
RD-UI-002-T01, RD-UI-003-T01, RD-UI-004-T01,
RD-FUNC-003-T01, RD-FUNC-004-T01, RD-FUNC-005-T01;
STATE-001-T01, STATE-002-T01, STATE-003-T01,
STATE-004-T01-D, STATE-004-T01-M, STATE-005-T01, STATE-007-T01.

NAV-005-T01/NAV-006-T01 become full UI acceptance only in Phase 1.
NAV-007-T01 and future Shopping tests remain Phase 2. No native Capacitor release
is implied. Phase 1 E2E dependencies: E2E-01 (Recipe lifecycle), E2E-02 (search/
combined filters), E2E-10 (lookup management). E2E-00 is the accepted foundation
regression. E2E-03/04/11 and E2E-05..09 remain later-phase dependencies only.

## 20. Responsibilities

- **COPILOT:** design/draft SQL and local tests, source-controlled pre/postflight,
  evidence, future injectable service implementation when authorized; approved
  Dashboard SELECT automation and workbook technical updates.
- **USER AUTHORIZATION:** approve the exact reviewed production migration,
  object/operation matrix and effects after fresh preflight. This design prompt
  authorizes none of its production DDL/DML. Reversal is separately authorized.
- **MANUAL: None expected** during this technical design. If a future Dashboard
  session expires, direct owner sign-in only; do not paste queries or credentials.
- **VERIFY:** review JSONB atomic-save choice, literal complete-library search
  scale trade-off, operation matrix, exact-owner policies, test/preflight evidence,
  reversal limits and exact migration before authorization; later perform UAT.

## 21. Risks and stop conditions

Stop on requirement conflict, project mismatch, authentication expiry, material
catalog drift, unexpected ownership/ACL/schema/role inheritance or naming
collision. Stop if SECURITY DEFINER, broker dependence, browser service_role,
unverified extension semantics, unsafe reversal or unrelated file changes become
necessary. No such dependency is required by this proposal.

No migration blocker was identified by the read-only evidence. The owner-requested
canonical storage and expanded collision/collation evidence required draft updates;
they did not require a production change or a new product decision.

JSONB prevents partial Recipe/section saves but updates replace the array;
Phase 1 must protect unsaved edits, avoid overlapping saves and surface errors.
No automatic concurrency/merge guarantee is claimed. Search reads the complete
small owner library; revisit only with measured scale, not a premature RPC.
PGlite does not emulate Supabase Auth/PostgREST caches/JWT validation or prove
production catalog/version/collation parity. Those remain explicit later gates.

## 22. Files and evidence

New in the design worktree: this design, executable migration candidate, disabled reversal,
read-only preflight, read-only postflight and PGlite test file linked above.
Meals README links this draft. This preflight updates the design, migration,
preflight/postflight, tests and scoped workbook planning/evidence. Reversal remains
unchanged. No source/UI/service, accepted security SQL, generated assets or private
untracked materials are modified.

## 23. Production changes performed

**None.** Only the authorized read-only preflight SELECTs were submitted. Existing
Dashboard authentication was reused without credential/session-material inspection.
No Auth user/role/default/policy was changed, and no migration, reversal,
production postflight, deployment, staging, commit or push was performed.
Local PGlite databases are disposable.

## 24. Recommendation

Review the draft and local evidence, then separately authorize the next bounded
implementation/preflight step. This is not permission to deploy the migration or
start the Phase 1 Recipe UI. Phase 0A acceptance remains intact.

Phase 0B Recipe Persistence Design: READY FOR REVIEW

## 25. Authorized production preflight results

Run `P0B-PREFLIGHT-001` used the existing authenticated Supabase Dashboard on
2026-10-29 UTC (2026-10-28 owner-local date). Before SQL, the browser URL, page
title and project breadcrumb link independently matched home-maintenance-app /
tawvchmjtkgykwwvnnnn. No password, cookie, token, Auth storage or request headers
were inspected or recorded. Only the two preflight WITH-final-SELECT statements
were submitted; no migration, reversal or production postflight ran.

The original catalog SELECT returned one complete JSON row at
02:39:05.713Z; the supplemental SELECT returned one complete JSON row at
02:40:40.876Z. SQL hashes and outbound request equality were verified before
execution/capture. Results were captured from the full HTTP response, not grid
pagination. Sixteen section CSVs preserve headers/counts, including verified
zero-row collision/dependency results.

Evidence archive: session `b7458d86-6190-4718-8779-7c2b79a30630/files`.
Manifest: `meals-0b-production-preflight-manifest.json`.
Complete response envelopes: `meals-0b-production-preflight-catalog.json` and
`meals-0b-production-preflight-supplement.json`; decoded `*-rows.json` and exact
`*-executed.sql` copies are retained. The manifest contains timestamps, browser
identity context, per-query hashes, row counts, raw response hashes and per-CSV
SHA-256 values. The first successful HTTP 201 catalog response was unnecessarily
repeated because an initial capture guard expected 200; only the identical
read-only SELECT was repeated. This was not a migration retry.

### Findings and drift classification

| Finding | Classification | Disposition |
|---|---|---|
| PostgreSQL 17.11, UTF8, en_US.UTF-8; public schema, postgres database/executor | No impact | Built-in UUID and timestamp functions available |
| ASCII/UTF8 lowercase, literal percent/underscore and substring samples pass | No impact | Complete-library literal search retained; no extension needed |
| Category/Cuisine display names were previously stored with padding | Draft update required | Canonical storage on INSERT/UPDATE, exact Unicode whitespace set, lower(name) uniqueness and local tests now corrected |
| Initial query did not inventory every trigger/policy/constraint/index name or collation sample | Draft update required | Supplemental SELECT added to the same preflight file and captured |
| Public application objects and all twelve active sampled tables postgres-owned | No impact | Expected ownership retained; schemas/built-ins have normal managed owners |
| anon/authenticated are NOSUPERUSER/NOBYPASSRLS, have no inherited-role memberships | No impact | Fixed exact-owner RLS/column ACL model remains applicable |
| service_role is BYPASSRLS; postgres is non-superuser but has CREATE/USAGE and PL/pgSQL rights | No impact | Explicit administrative CRUD and invoker trigger design retained |
| PUBLIC schema USAGE and built-in/auth.uid EXECUTE exist | No impact | Not private Meals table/routine access; do not revoke shared built-in privileges |
| Seven stored default-ACL rows, including three managed public layers | No impact | Informational only; no default edits; new object ACLs explicitly reset and verified |
| postgres has a non-inheriting/non-settable planner_curated_api membership | No impact | Existing remnant unrelated to proposed Meals objects; untouched |
| All six object-kind collision inventories and proposed-object dependency arrays empty | No impact | No existing Meals object, migration collision or relevant broker dependency |

No unresolved Migration blocker or Requires owner decision discrepancy was
identified. Broader managed-default/broker cleanup remains outside this work.

The internal trigger remains an undeployed proposal. Catalog permissions and
local role tests support SECURITY INVOKER, postgres ownership, no browser
EXECUTE and attached-trigger usability; production attachment/ACL/behavior must
still be checked after separately authorized deployment. This preflight does not
pretend that an absent function was tested in production.

### Workbook and validation

Database Verification rows 3, 7, 21 and 22 record preflight planning/evidence only:
A/F/G/J/O/P/R (28 literal cells). The workbook was reopened and recalculated in
Excel, with all 892 formulas, tables, validations, row heights, prior evidence,
statuses and owner decisions preserved. Coverage K16/M16 recalculated; no mapping
or formula changed and no unresolved pointer exists.

Workbook before SHA-256:
`cb210d2b3a439015e4ef5a92e89e284815a65c8656e26f87f3be9f592cd0f76c`.
Workbook after SHA-256:
`65d71db080311f41ca0d0bbb4c3370692b0364781aabefbf055e2cc8094cdc11`.
All database statuses remain Not Built; Phase 0A Accepted and all eight UAT/six
technical results remain unchanged. No Phase 1 Ready to Test or Final Decision.

Revised local validation: eight new PGlite tests and the combined 22-test
owner-RLS/Meals routing run pass, no failures or skips; targeted ESLint passes.
Reversal remains disabled and unchanged, safe only for empty reviewed objects
with no incoming dependencies. No Shopping or meal-plan objects are introduced.

**Production Changes Performed: None.**
Next boundary: owner reviews the exact revised migration and evidence, then
separately authorizes its one-time production execution. No execution approval
is implied by successful preflight.

Phase 0B Production Preflight: READY FOR MIGRATION REVIEW

## 26. Executable candidate preparation

On 2026-10-28 owner-local date, separate authorization permitted preparation only.
The disabled source was hash-verified and copied byte-for-byte outside the
repository before editing. The sole migration change is line 9:

```diff
-  approved_for_execution boolean := false;
+  approved_for_execution boolean := true;
```

Disabled source SHA-256:
`a59138ebd20edfd211927c62eae8959cb49012fa4217d85abf3da149e52a3418`.
Executable candidate SHA-256:
`56072ae496d572710ae195449ff2cc9823b3eb8bdf3122bec95203cf2cc2bae6`.
The source is 9,711 bytes and the candidate 9,710 bytes: a single five-byte token
replaced by a four-byte token, with no newline, encoding or other byte changes.
All object definitions, ACLs, RLS, exact-owner UUID, canonicalization, text/JSONB
behavior, timeouts, transaction handling and safety assertions are unchanged.
Historical preflight hashes above identify the disabled source, not this candidate.

The local test executes the candidate unchanged only inside disposable PGlite.
It reconstructs the disabled variant and pins its CRLF-reconstructed SHA-256 to
the reviewed source, tests its refusal, and retains identity/collision refusal, exact catalog,
all role-denial/owner-operation, canonicalization, text-preservation and reversal
safety checks. Combined persistence/owner-RLS/Meals routing validation: 22 passed,
zero failed/skipped. Targeted ESLint passed.

Preflight evidence remains historical: catalog response at
2026-10-29T02:39:05.713Z and supplement at 02:40:40.876Z. No production change was
performed during this work or the preceding stopped execution task. Local
candidate preparation does not change catalog applicability, but external actors
or deployments could change collisions, memberships, owners, ACLs or prerequisites.
No new production query was submitted, so current freshness is not asserted.

Before any later execution, separately authorize this exact candidate hash,
complete the explicit source-control gate and rerun required validation; verify
the authenticated Dashboard project name/reference, repeat both reviewed
read-only preflight statements with complete capture, and reject material catalog
drift or any collision. Immediately before submission, require the committed
file, submitted SQL and newly authorized hash to match exactly. Execute once only
under that new authorization; no automatic retry or reversal.

Workbook unchanged; no database Pass, UI readiness or phase decision recorded.
Production changes performed: **None**. No SQL, staging, commit, push or deployment.
Reversal authorization state: **NOT AUTHORIZED**; its false guard is unchanged.
The previous execution authorization for the disabled hash does not authorize
this candidate. Recipe UI implementation remains outside scope.

Phase 0B Executable Migration Candidate: READY FOR AUTHORIZATION

## 27. Repository-canonical LF candidate

Separate preparation-only authorization on 2026-10-28 permitted safe unstaging
of the eight reviewed package paths and normalization of migration line endings.
The exact CRLF candidate was preserved outside the repository before formatting.
No visible SQL, comment text, within-line whitespace or executable guard changed.

| Representation | SHA-256 | Bytes | CRLF | LF-only | Logical lines |
|---|---|---:|---:|---:|---:|
| Historical executable CRLF candidate | `56072ae496d572710ae195449ff2cc9823b3eb8bdf3122bec95203cf2cc2bae6` | 9710 | 189 | 0 | 189 |
| Current repository-canonical LF candidate | `5a741e8ccd0a0a74078fb07890af47ed0d2a74f2aeaafbc608559231f3959c27` | 9521 | 0 | 189 | 189 |

Byte comparison proves exactly 189 CR bytes were removed, exclusively from CRLF
pairs. Logical-line sequences are identical. The execution guard remains true.
Temporary staging of only the migration proved the working/source bytes and Git
blob identical under existing attributes; it was then unstaged. No attribute or
Git configuration change was required. Final index is empty; no commit or push.

The local test additionally pins the exact LF candidate hash, reconstructs the
historical disabled CRLF representation for its original hash assertion, and
executes the unchanged LF candidate only in disposable PGlite. No behavioral
assertion was removed. Persistence/owner-RLS/Meals routing: 22 passed, zero
failed/skipped. Targeted ESLint and Git diff whitespace checks passed.

Preflight/postflight/reversal SQL and workbook remain byte-identical to their
preparation baseline. Phase 0A acceptance and future decisions are unchanged.
Reversal remains disabled and **NOT AUTHORIZED**. Production changes: **None**.
No production SQL, fresh preflight, migration, postflight or reversal was run.

All earlier hashes are historical identifiers. Only the current LF hash above
identifies this candidate awaiting new, separate production execution authorization.
The earlier CRLF execution authorization is not transferable. Future execution
still requires the explicit package commit, exact committed/submitted hash match,
fresh Dashboard identity and complete read-only production drift checks.

Phase 0B LF Migration Candidate: READY FOR AUTHORIZATION

## 28. Production verification and controlled evidence baseline

Run `P0B-DB-001`, project home-maintenance-app / tawvchmjtkgykwwvnnnn.
Package commit: `0d30359ab5cdd4aa3577c33823de1bbc80a3d4f2`.
The 9,521-byte LF migration SHA-256 is
`5a741e8ccd0a0a74078fb07890af47ed0d2a74f2aeaafbc608559231f3959c27`.
Working, staged, committed and submitted bytes were verified equal. Separately
authorized production execution occurred once at 2026-10-29T03:14:08Z; HTTP 201,
complete response `[]`. No retry or schema reversal. Fresh complete preflight
responses matched the previous catalog except execution time.

All 20 reviewed production postflight checks passed: three postgres-owned
RLS-enabled tables, 18 columns, seven indexes, ten constraints, twelve exact-owner
operation policies, one internal invoker function and three attached triggers.
Explicit table/column/function ACLs, exact predicates/roles, browser denial,
service-role administrative privileges and no unreviewed broker-role dependency
were verified. No Shopping, meal-plan, Import, view, sequence or CRUD RPC.

Production SQL synthetic role/claim assertions passed owner CRUD, lookup
canonicalization/uniqueness/rename/referenced-delete rejection/unused-delete,
JSONB order and atomic invalid-save rejection, content preservation, timestamps,
anon all-operation denial and synthetic non-owner/null-subject denial. These are
native database role tests, **not live JWT/API authentication or owner application
smoke/UAT evidence**. Random-ID test fixtures were explicitly deleted within a
test transaction, then rolled back; a subsequent SELECT confirmed zero rows in
all three tables. This test rollback was not migration reversal.

Security Advisor was refreshed: complete 16-item response contained no Meals
finding or ERROR. Security UI: zero errors, one unrelated Auth warning, ten
informational security suggestions. Existing unrelated findings were untouched.

### Captured evidence

Full envelopes, exact submitted SQL, CSVs (including zero-row exports), timestamps
and hashes reside in session `b7458d86-6190-4718-8779-7c2b79a30630/files`.
No credentials, browser session material or request headers were inspected.

| Evidence | SHA-256 |
|---|---|
| meals-db-final-manifest.json | `4cbbc3eac24c13860d39ee3a0d8c6ae79c638cc5967d5274d1e7ea219091f8da` |
| meals-db-final-execution.json | `841bc13ea65f1744d83776edaf9c8a22277d0b4ccc67b135c3f72e6a91b47bd0` |
| meals-db-final-catalog-after.json | `c90e6d40396a6e79326aa204ad1bb18d3be09e49aab51a49e21e06a0daf14c92` |
| meals-db-final-authorization.json | `53027fc3bb3595f52180afeac5c4b2017d12f16058135a8bb363302397cdc892` |
| meals-db-final-advisor.json | `06350649e7fbd3ca6ca4772c29b638a499d5a9a9c3db2888e33ac68df531c567` |

That production manifest records the initial workbook blocker, not final workbook
completion; it remains immutable historical evidence. The later
`meals-repair-controlled-verification.json` and exact-cell CSV record its repair.

### Coverage row 185 diagnosis and repair

Original workbook SHA-256:
`65d71db080311f41ca0d0bbb4c3370692b0364781aabefbf055e2cc8094cdc11`.
The rejected prior workbook was not retained; its blocker record and restored
baseline were available. Disposable reproduction showed row 185 at 15 points
before writes, after long evidence writes, after full rebuild and after first
save. First-save XML still lacked `ht`/`customHeight`. On reopen Excel auto-fit it
to 409.5 points because wrapped M185 looks up the long Database Verification
evidence. Restoring 15 points serialized `ht="15" customHeight="1"`; the old
verifier rejected missing-versus-explicit `ht`, not a surviving visible change.

Row 185 is DB-SEC-001 / DBV-DB-SEC-001. Original XML has no row style, hidden or
outline attribute (COM visible, OutlineLevel 1); worksheet default height is 15.
No merged-cell participation. Fonts, fills, borders, number formats, alignment,
wrap settings, row descent, validations, conditional formatting and table
membership were unchanged in the reproduction and controlled result.

The shared workbook-layout helper now captures XML heights including defaults,
pins them before save regardless of current equality, and checks final read-only
COM heights against the values observed after pinning. This avoids treating
Excel's display rounding (e.g. serialized 33.95 versus COM 34) as a layout defect.
Saved XML effective heights remain strictly checked. Only equal effective
implicit/explicit height and fixed-height metadata are normalized; changed
height, hidden/outline/style and all cell/structural changes still fail.

Two independent full disposable workflows produced identical cell/cache/layout
outcomes before the controlled workbook was changed. Controlled workflow closed
Excel fully between first write, recalculate/save reopen and final read-only
verification. Row 185 remains 15 points and pinned. There are 473 equal-effective
row serialization changes: 369 add customHeight, 104 add default ht/customHeight.
All row attributes other than these equivalent height representations are intact.

### Workbook technical results

Final workbook SHA-256:
`563ac8035cbe7418f9da37b0b1c67061ffcbb00094533eebc6af92edfa719e6b`.
129 literal cells changed (112 database, 17 security), with exact stable IDs,
headers and before/after values in `meals-repair-exact-cell-changes.csv`.

Database Verification Pass rows: 2, 3, 5, 7, 8, 9, 10, 11, 13, 14, 18, 19, 20,
21, 22. Each was resolved by Check ID and Requirement ID and annotated with its
specific captured proof. Prior notes/evidence were appended, not discarded.
Verification Stage stays Both; rollback prepared Yes, executed No. The original
Deployment Blocker classification remains unchanged; notes record none observed.

Security Pass rows: 4 ARCH-003-T01 (owner UUID), 10 ARCH-009-T01 (explicit object
security), 21 SEC-TST-008-T01 (no unintended PUBLIC/anon catalog access). Tests
requiring UI/application/API behavior, including the fresh-owner-smoke composite,
remain unchanged despite relevant partial database evidence.

43 formula caches recalculated, no formula edits. Summary Security Pass 6 -> 9,
Database Pass 0 -> 15, Phase 0 aggregate Pass 14 -> 32. Seven sheets, five tables,
892 formulas, validations/filters/panes/styles/conditional formatting and all
Coverage mappings are preserved; unresolved Coverage pointers zero. Phase 0A
Accepted, eight owner results, six prior technical results, all future functional
tests and every owner decision are unchanged.

Workbook regression tests cover protected owner values/decisions, formulas,
styles, tables, validations, pointers, actual row changes and long-evidence
save/reopen behavior: five tests passed, zero failed/skipped; targeted ESLint and
Git whitespace checks passed. This repair submitted no production SQL or browser actions.
Recipe migration was NOT rerun. Reversal was NOT executed and remains
**NOT AUTHORIZED**. Phase 0B technical completion is not Phase 1 acceptance.
