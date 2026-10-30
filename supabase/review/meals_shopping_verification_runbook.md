# Shopping Wave 1 verification runbook

## Status and immutable artifacts

Migration run count: **1**. Fixture run count: **1**. Both completed under
separate exact owner authorization on 2026-10-30. Do not rerun either script.
Both repository execution guards remain disabled. The owner subsequently
authorized the Wave 1 source commit/dev push and established Pages release;
owner UAT remains pending and Wave 2 is not authorized.

Target: **home-maintenance-app / tawvchmjtkgykwwvnnnn**.

- [Migration](202610300001_meals_shopping.sql) stays disabled and unchanged.
- Disabled SHA-256: `f7d436dd8b4102c9a57a3dbf9b81abfdf3c5d3b85ea616aa9321df08cb75e768`
- Enabled SHA-256: `d42fe15d0f187fffd4376af50371577d8bcfabf82e3d08d154f7c1d674ea3ea9`
- Execution bytes: 7,207 UTF-8 bytes, no BOM, 124 CRLFs, final newline.
- LF-only `498f08b20008aabb82eb8faf5ccb999f9b63e59967bcf69183fb8eedbaaa932f`
  is not authorized.
- [Fixture script](meals_shopping_authorization_DISABLED.sql) stays disabled.
  Disabled SHA-256: `22bb5be9db43584d390af8803cadc51fbb2a45dde2a450ab69cbd59b4000ae10`
  Enabled SHA-256: `f149bc49f947a978a4cedfccdc64fe13bde055bca2a598f2a60e558ffb0846c1`

Never manually reconstruct SQL. Use raw file bytes, a single authorized guard
substitution where applicable, gzip/Base64 transport, browser decode/decompress,
raw-byte hash verification and individual editor readback byte comparison.
Keep enabled copies in memory, never in the repository.

STOP on any temporary Git object, disk/checkpoint/persistence error, SQL error,
unexpected difference, truncated result, timeout or ambiguous execution. Never
retry migration/fixtures or execute reversal automatically.

## Generic preservation contract, version 2

[Preservation SQL](meals_shopping_preservation.sql) replaces the incomplete
business-name selection. It inventories **every pg_class relation in public**,
including indexes, all public functions/procedures/aggregates/window functions,
all public types (including row/array/enum/domain/range/composite types), and
external trigger functions attached to preserved relations. No business-name
filter or ownership guess determines inclusion. Overloaded function identity
arguments distinguish functions with identical names.

The only exclusions are exact intended Shopping objects: the two tables, five
named indexes, one zero-argument function and four row/array types. Their attached
triggers/policies are covered by the separate exact Shopping postflight. These
exclusions must be empty in a valid before-snapshot. An unexpected Shopping-like
name is NOT excluded. The after-snapshot must contain exactly the expected
Shopping identities and also pass the separate full Shopping comparator.

The output independently inventories relations/functions/types, fingerprints
each included object, lists every justified exclusion, and lists unsupported
objects. The offline comparator cross-checks the inventory-to-fingerprint
bijection, rejects missing/duplicate/unjustifiably excluded objects, and requires
zero uncovered objects. A failed data query aborts the snapshot; it never
substitutes an empty/zero hash.

All nonpublic relation schemas in the previous discovery inventory (auth,
extensions, realtime, storage and vault) are explicitly **outside the public
relation contract**. No private Auth/storage/vault rows are queried or exported.
Their relation names are discovery evidence only, not a preservation claim.
The deployed auth.uid(), public/auth schema ACLs and default ACLs are retained
as shared security metadata. Relevant external trigger functions are included,
including pg_catalog RI functions. This is not a full Auth configuration audit.

### Catalogs

Each relation includes schema/name/kind, owner, RLS/force-RLS, ACL and column ACLs,
column positions/types/collations/defaults/nullability/identity/generated fields,
constraints/FKs, index definitions and validity, all triggers/enabled states,
rules/policies, view/materialized-view definitions, inheritance/partition
definitions, sequence properties and storage options. Catalog JSON has SHA-256
fingerprints. Full catalog data is also compared, not only reported hashes.

Functions include identity, return type, language, owner, ACL and effective
browser/service EXECUTE permissions, security mode, volatility, configuration,
definition and catalog properties. Aggregates use their aggregate catalog
contract instead of unsupported pg_get_functiondef(). Types include complete
catalog properties, enum labels/order, domain constraints and range properties.

### Data

Every ordinary/partitioned table, populated materialized view and sequence
returns a count and SHA-256 digest calculated entirely inside PostgreSQL:
row_to_json(full row)::text -> UTF-8 SHA-256 per row -> sorted fixed-length hashes
with C collation -> duplicate-preserving concatenation -> final SHA-256.

No primary key is required; duplicate and zero-row tables are deterministic.
Quoted identifiers use format('%I.%I'). UTC, ISO dates, fixed interval style,
extra_float_digits=3 and hex bytea output stabilize built-in representations.
JSON text spelling is preserved by row_to_json; JSONB uses PostgreSQL's canonical
representation. UUIDs, timestamps, arrays, nullable fields, composite keys,
generated/identity columns and quoted names are locally tested. Views are not
executed: their definitions and all public stored relations are preserved.

Foreign tables and unsupported relation kinds are explicit uncovered objects,
not silently skipped or accessed through a foreign connection. An unpopulated
materialized view or unsupported type/output function causing a read error is a
STOP naming the failing relation through the SQL error context. Custom type
output functions are part of the catalog contract; READ ONLY prevents ordinary
database writes but does not prove arbitrary extension external side effects.
Review any unexpected external/custom storage before execution.

The query uses REPEATABLE READ, READ ONLY, row_security=off and a 60-second
timeout. RLS-filtered reads must fail rather than silently omit rows. Sequences
are non-MVCC; arrange a no-other-writers window. Concurrent legitimate changes
also fail comparison; do not dismiss them as harmless. No timestamp-only proof.

### Offline validation and comparison

Save exactly one complete `preservation` JSON result (or a one-row JSON export).
Never use the old partial baseline for final before/after comparison.

```powershell
node supabase\review\meals_shopping_verify.cjs snapshot <before.json>
node supabase\review\meals_shopping_verify.cjs preservation <before.json> <after.json>
```

Missing/unexpected relations, function identities or types fail with exact
object names. Catalog changes, row-count changes and row-digest changes are
reported separately. Every pre-existing non-Shopping object must match.
The comparator canonicalizes unordered catalog arrays but does not rewrite SQL
definitions; catalog fingerprints detect ordering changes too.

## Exact Shopping and authorization checks

[Read-only postflight](meals_shopping_postflight.sql) and
[expected contract](meals_shopping_expected_catalog.json) require 2 tables,
5 indexes, 8 exact-owner policies, 3 triggers, 1 internal SECURITY INVOKER
function, the exact 28 predefined category names/positions, 0 items and 0 custom
categories. Exact comparisons cover all columns, constraints/FKs, ACLs, RLS,
policy expressions, trigger timing/events/enabled state, function identity/body,
empty search_path, owner and effective EXECUTE privileges.

PUBLIC and anon have no private Shopping access. Authenticated table privileges
are SELECT/DELETE plus category INSERT(id,name)/UPDATE(name) and item
INSERT(id,text,category_id,checked)/UPDATE(text,category_id,checked).
service_role has table SELECT/INSERT/UPDATE/DELETE only. None of these roles
can execute the internal function. No unexpected Shopping RPC is allowed.

```powershell
node supabase\review\meals_shopping_verify.cjs postflight <postflight.json>
```

Never bless production drift by regenerating the expected contract. It was
generated from the immutable candidate in disposable PGlite 17.5. Hosted version
or rendering differences require review and STOP, not silent normalization.

The guarded fixture script is NOT read-only. Under future exact authorization,
it locks both Shopping tables in SHARE ROW EXCLUSIVE mode with a five-second
timeout, refuses existing items/custom categories or fixture collisions, and
tests owner CRUD plus anon/nonowner/null/malformed-subject denial. Reserved IDs
are b46b15b8-3343-4f76-a800-000000000001 through 000004 and labels begin
__shopping_wave1_verify_b46b15b8__. All writes are transaction-local fixtures and
the script ends with ROLLBACK. No Auth user/JWT/configuration is created.

This tests SQL roles, deployed auth.uid() interpretation and RLS only, not JWT
signature validation, PostgREST transport, client-token issuance or owner UI.
An error/ambiguous result requires STOP; do not rerun. Explicit ROLLBACK is the
only allowed transaction cleanup, followed by read-only inspection.

[Independent cleanup SQL](meals_shopping_fixture_cleanup.sql), in a fresh query
after confirmed rollback, requires zero reserved-ID/prefix fixtures, zero total
items/custom categories and 28 predefined categories. Repeat exact postflight
too, proving values/security, not just counts.

```powershell
node supabase\review\meals_shopping_verify.cjs authorization <authorization.json>
node supabase\review\meals_shopping_verify.cjs cleanup <cleanup.json>
```

## Future migration sequence (not authorized by baseline preparation)

1. Verify home-maintenance-app / tawvchmjtkgykwwvnnnn, repository disabled hashes,
   empty index and immutable workbook. Arrange no concurrent writers and capture
   available Security Advisor baseline identities/object names/severity.
2. Run the complete generic preservation baseline once and save the full result.
3. Validate offline: zero uncovered objects and every inventory object covered;
   no Shopping exclusion exists yet.
4. Verify current migration editor bytes equal the exact authorized bytes/hash.
5. Execute migration exactly once under renewed authorization.
6. Run exact read-only Shopping postflight and offline comparator.
7. Under exact fixture authorization, execute rollback-controlled fixtures once.
8. Confirm ROLLBACK, run independent cleanup and repeat exact postflight.
9. Run the identical generic preservation query and save the full after-snapshot.
10. Compare every pre-existing public object/function/type and stored-row digest.
11. Review available Security Advisor output against baseline: distinguish
    unrelated existing findings from new Shopping findings. Material Shopping
    findings block release; do not auto-change configuration. Unavailable Advisor
    output is a stated limitation requiring owner review, not a clean result.
12. Report and STOP before staging/commit/push/Pages/UI deployment, UAT or Wave 2.
    Reverify guards, empty index, workbook and excluded cleanup SQL untouched.

## Local validation

```powershell
node --test supabase\review\meals_shopping_verification.test.cjs tests\meals-shopping-persistence.test.cjs tests\meals-shopping-service.test.cjs
npx eslint --no-ignore supabase\review\meals_shopping_verify.cjs supabase\review\meals_shopping_verification.test.cjs
git --no-pager diff --check
```

Tests cover all requested negative changes, omitted inventory coverage,
previously missed project/Planner names without scope special cases, generic
datatypes, quoted names, duplicates/empty tables, partitioned/materialized data,
type/function changes, rollback fixtures and existing-owner-data refusal.
PGlite validates local PostgreSQL 17.5 behavior, not hosted PostgreSQL 17.11,
multi-connection locking/concurrency, JWT/PostgREST transport or Advisor.

## Completed generic baseline preparation

The revised SQL SHA-256 is
`045d3809fc5dfa9ce2714a21a543280cd16d2161c7dfb9ecfe55551480594204`
(10,724 bytes). Local validation: 22 passed, 0 failed/skipped; ESLint and
git diff --check passed.

One separately authorized read-only production run completed successfully,
with executor postgres and transaction_read_only=on. The complete result was
saved outside the repository and validated offline: 72 relations (26 tables,
40 indexes, 5 sequences, 1 view), 13 functions (including external trigger
dependencies), and 54 types; 139 discovered, 139 fingerprinted, 0 exclusions
and 0 uncovered within scope. All prior public discovery objects/functions
are covered.

The six formerly missed public tables were included without name-based scope
logic: project_registry, projects, repeatable_masters, repeatable_overrides,
task_manager and weekly_tasks. Each has 0 rows and valid catalog/data digests.
Recipe coverage remains 5 Recipes, 4 categories and 4 cuisines. The 44 nonpublic
relations in the prior discovery inventory are explicitly outside this public
relation contract, not silently counted as fingerprinted.

At baseline-preparation completion, migration and fixture run counts were 0.
The following separately authorized execution supersedes that historical gate.

## Production execution, verification and owner disposition

2026-10-30, home-maintenance-app / tawvchmjtkgykwwvnnnn:

- The exact authorized migration was executed once through the Dashboard Run
  control and one owner-authorized "Run without RLS" confirmation. Editor bytes
  matched the enabled SHA-256 above: 7,207 bytes, no BOM, 124 CRLF endings and a
  final newline. The complete request returned HTTP 201 with `[]`.
- Exact postflight comparison passed before fixtures and again after cleanup:
  2 tables, 5 indexes, 8 policies, 3 triggers, 1 internal SECURITY INVOKER
  function, 28 predefined categories, zero items and zero custom categories.
  Columns/defaults/nullability, constraints/FK, policies/RLS, indexes, triggers,
  function search_path/security/EXECUTE and table/column grants matched.
- The exact enabled fixture SHA-256 above was executed once. Owner SQL/RLS,
  anonymous/non-owner/null/malformed-subject denial and internal function
  EXECUTE denial passed. The entire BEGIN-through-ROLLBACK script succeeded.
  Independent cleanup found zero reserved-ID/prefix rows, zero items/custom
  categories and 28 predefined categories; repeated exact postflight passed.
  This proves SQL-role/auth.uid()/RLS behavior, not JWT/PostgREST transport.
- The identical generic after-snapshot covered all 139 pre-existing objects,
  with 12 exact authorized Shopping exclusions and zero uncovered objects.
  Recipe and Planner/Project catalogs and data fingerprints were unchanged.
- The strict preservation comparator FAILED for pre-existing public.trips and
  public.trips_workflow_metadata data: row counts 11 -> 12 and 3 -> 4,
  respectively, with changed row fingerprints. Both catalogs were unchanged;
  no other pre-existing-object differences were reported.
- One separately authorized read-only investigation confirmed the current
  data still matched the saved after-snapshot. Excluding one workflow row
  restored its before fingerprint, but no single Trip exclusion restored
  the Trips before fingerprint. A linked-new-record cause was not proven.
  Neither table is referenced by the Shopping migration; no triggers or
  foreign keys touching either table were found. No private Trip content is
  recorded here.
- Refreshed Security Advisor review: 0 errors, 1 unchanged Auth warning
  (Leaked Password Protection Disabled), 10 unchanged RLS Enabled No Policy
  informational findings on pre-existing tables, no new Shopping findings.

**Owner exception, 2026-10-30:** the owner accepts the Trips preservation
mismatch as unrelated, unattributed concurrent production activity and
authorizes proceeding to the Wave 1 source/release process. This is an explicit
owner risk disposition, NOT a proven cause and NOT a passing strict
preservation comparator. The before/after evidence and failure remain intact.
No repair, migration/fixture rerun or automatic reversal was performed.

The Acceptance Workbook remains unchanged at SHA-256
`a5033efc216edae9f640b6e8d1b2aebb5da1b82d545c8562717620f131e4915b`.
The hash-controlled SQL files are stored without Git text normalization to
preserve the reviewed bytes and disabled guards across checkouts.
