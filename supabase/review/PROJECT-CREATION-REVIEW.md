# Live-schema review of Workbench project creation

## Verdict: DEPLOYMENT-READY after disposable validation; live deployment NOT EXECUTED

The original 13 files in [inspection-results](inspection-results/) were read:
its README, eight CSVs, and four successful-empty-result markers. The exported CSV
filenames include `supabasereviewinspection...` prefixes rather than the short
names listed in the README; the contents, not the names, identify the queries.

Subsequent owner-supplied results closed the preflight gaps:

- [Privilege preflight CSV](inspection-results/Read-only%20preflight%20SQL.csv):
  schema USAGE and UUID EXECUTE true for anon/authenticated/postgres/service_role.
- [Data preflight CSV](inspection-results/supabasereviewproject_creation_data_preflight.sql.csv):
  zero format, duplicate, order, and exhaustion blockers; no null external IDs.
  Current rows/maxima: home 209/209, vehicle 82/82, repeating 2/8, misc 4/4.
  Next IDs without intervening consumption: PA0210, PB0083, PC0009, PD0005.

The complete canonical migration has now been executed only in disposable local
PGlite and PostgreSQL 17.6 databases. Real concurrent sessions, cancellation,
five-second lock timeout, rollback, and safe full reapplication passed. No live
Supabase connection, live SQL execution, or live Workbench create occurred.
The following SQL files still require separate authorization for live use.

## Verified columns, types, nullability, and defaults

All four raw tables share:

| Column | Live type | Nullability/default |
| --- | --- | --- |
| `id` | uuid | NOT NULL, `gen_random_uuid()`; primary key |
| `external_id` | text | NOT NULL on home; nullable on other types; no default |
| `title`, `category`, `state`, `priority` | text | nullable, no default |
| `order` | bigint | nullable, no default |
| `metadata` | jsonb | nullable, no default |
| `created_at` | timestamp without time zone on home; with time zone otherwise | nullable on home, NOT NULL otherwise; `now()` everywhere |
| `updated_at` | timestamp without time zone | nullable, `now()` |

Additional nullable columns, all without defaults:

| Table | Columns |
| --- | --- |
| home (15 total) | `property text`, `area text`, `resource_links jsonb`, `cost numeric`, `date_completed date` |
| vehicle (18 total) | `vehicle text`, `date_completed date`, `hours numeric`, `mileage numeric`, `mechanic text`, `service_description text`, `resource_links jsonb`, `maintenance_checks jsonb` |
| repeating (13 total) | `property text`, `task_description text`, `recurrence text` |
| misc (11 total) | `resource_links jsonb` |

No identity/generated columns were exported. Ordinal gaps in home are not
additional live columns. The RPC's common/per-type allowlists match the actual
columns. It intentionally omits `task_description`, which is nullable, and both
timestamps, preserving their defaults. Existing field-name mappings remain valid.

## Constraints, indexes, triggers, and view

- The only constraints are validated UUID primary keys:
  `projects_pkey`, `project_vehicle_pkey`, `projects_repeating_pkey`, and
  `projects_misc_pkey`.
- The only indexes are the corresponding unique UUID btree primary-key indexes.
  There are no exported external-ID unique/check constraints, foreign keys
  involving these tables, or conflicting proposed index names.
- The trigger query returned zero non-internal triggers on these relations.
  PostgreSQL internal constraint machinery was intentionally excluded.
- `projects_all` is the exact four-way `UNION ALL` view expected by the app.
  It exposes UUID, external ID, literal project type, category/title/state,
  priority, **integer-cast order**, recurrence (repeating only), and metadata.
  Despite permissive ACLs it is not automatically updatable; no trigger makes
  it a writable create target. The RPC writes only raw tables.
- All raw `order` columns are bigint, but the view casts them to integer.
  The original RPC could save an order outside int32 and then break view reads.
  The reviewed RPC rejects values outside -2147483648 through 2147483647.
  Existing out-of-range orders are preflight blockers; none are auto-repaired.

## RLS and access: every exported role/column checked

RLS and FORCE RLS are false on all four tables; no policies were returned.
The view is owned by postgres, as are all raw tables.

All five relations have the same exported table privileges:

| Role | Table privileges on every relation | Grant option |
| --- | --- | --- |
| anon | SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER | no |
| authenticated | same | no |
| service_role | same | no |
| postgres | same; also owner | yes |

All 1,072 exported column-privilege records were checked. For **every column**
on each of the five relations, all four roles have SELECT, INSERT, UPDATE, and
REFERENCES; only postgres has the grant option. These information-schema
records need not represent independent column ACLs; table grants can account
for effective column privileges. All 140 table-grant records were also checked.
The final effective-SELECT export independently confirms both browser roles'
SELECT access on all five relations.

`SECURITY INVOKER` is appropriate: the RPC needs no table-right elevation and
does not bypass RLS. Its proposed explicit EXECUTE and sequence-USAGE grants
provide access to newly created objects. Schema-USAGE and built-in UUID EXECUTE
still need preflight confirmation. Granting the RPC does not turn the broad
existing ACLs into per-user isolation.

**Existing access caveat:** browser roles can already perform raw writes and
change external IDs outside the RPC. The proposal preserves those permissions
and application delete/move restrictions; it does not enforce those UI
restrictions at the database layer. It guarantees allocator behavior for RPC
creation, not exclusive use of the allocator by all possible clients. Other
writers must coordinate. Tightening existing grants/RLS is a separate authorized
change, not silently included here. A future raw insert of a chosen ID can cause
an eventual unique violation instead of silent duplication.

## Existing allocator inspection

The sequence query returned zero public sequences whose names contain `project`.
The function query returned zero ordinary public functions whose names contain
`project` or `external_id`. In particular, there is no name conflict with the
proposed sequences or RPC. These name-filtered results do not prove that no
generically named allocator exists in another schema. With no triggers, no
external-ID defaults, and the modern app explicitly calling the new RPC, no
existing automatic allocation hook was identified.

## Required proposal changes made, still NOT EXECUTED

The canonical [reviewed migration/RPC](202610250001_project_creation.sql):

1. Adds a five-second transaction-local lock timeout so deployment does not
   indefinitely wait for its exclusive table locks.
2. Rejects new orders outside the view's integer range before consuming an ID.
3. Marks this review copy as canonical.
4. Supports safe full reapplication after functional rollback. For fresh
   allocators only, seed above approved floors/current maxima and add uniqueness.
   For retained allocators, validate bigint/increment/cache/noncycling settings,
   the exact valid nondeferrable external-ID unique constraint, and a called,
   nonexhausted counter not behind data/floors. Never reset or reseed it.
   Partial, incompatible, rewound, or exhausted retained state fails explicitly.
   Reinstall the RPC and restore intended browser grants with CREATE OR REPLACE.

No schema-driven column, type, routing, RLS, table-grant, allocator-prefix, or
timestamp-default change is otherwise needed. Existing nullable external IDs
remain nullable. The new unique constraints permit multiple nulls; non-null
duplicates abort the transaction. The migration does not claim that every
historical null row has a usable identity.

The older [proposal copy](../proposals/202610250001_project_creation.sql) and
previous seven-file patch are superseded for deployment; they were not modified
by this review. Do not apply both SQL copies or use the older patch as the final
SQL. Allocator tests now target the canonical review copy.

## Exact deployment order, after separate approval

1. Keep project creation paused. Review backup/recovery availability and obtain
   explicit deployment authorization. Do not revert to the temporary UUID alias.
2. Run [preflight](project_creation_preflight.sql) manually as postgres. Save
   both result sets. Require all four `*_blockers` counts to be zero for every
   type and schema-USAGE/UUID-EXECUTE true for anon and authenticated. Historical
   null external IDs are informational; investigate rather than modify them.
   Higher maxima are valid and raise the seed; unexpected data is not repaired.
3. Record existing project UUID/external-ID pairs via an owner-controlled export.
   Data preflight counts are not a full identity snapshot.
4. Reconfirm no schema drift since the saved exports. Validate the revised SQL
   tests in a disposable database with the exact live schemas, and validate
   multi-connection sequence creation there (completed in this workspace).
   Do not use a rollback-wrapped RPC
   on production as a "read-only" test: sequences would still advance.
5. During a quiet period, apply **only** the reviewed migration as postgres, in
   its entirety. A lock-timeout, unexpected format, duplicate, cast error,
   or object-name conflict is a failed deployment. Do not bypass it, rename rows,
   reset counters, or continue to deploy the app. Roll back any open failed
   transaction first. Schema creation/unique constraints are transactional.
6. Run [post-deployment validation](project_creation_validation.sql) and rerun
   the read-only preflight. In SQL Editor, run each inspection SELECT separately
   between `BEGIN TRANSACTION READ ONLY;` and `COMMIT;` to retain every result;
   running the whole validation file may display only the final Recycle query.
   No Recycle row is required before the smoke test.
   Require four valid external-ID unique constraints,
   four noncycling increment-one sequences, one invoker RPC with empty search
   path, browser-role RPC/sequence access, and no browser sequence-reset access.
   Sequence last values should be at least the seed floors. Preflight's next
   number reflects current rows, not consumed-but-unused sequence values;
   inspect the sequences themselves for the actual next allocation.
7. Compare all pre-existing UUID/external-ID pairs with the predeployment export.
   No existing identity should change. Recheck table/column ACLs and RLS against
   these saved inspection results; the migration does not modify them.
8. Build and deploy the RPC-enabled app only after SQL validation passes. Refresh
   caches/bundles. Keep creation paused until explicit smoke-test approval.
9. Perform the one manual creation below, then enable ordinary creation.

## Rollback

Use [rollback SQL](project_creation_rollback.sql) **only after a successfully
committed migration**, as postgres, with app creation disabled first. It removes
the RPC and browser sequence access, but deliberately keeps all four sequences,
their high-water marks, uniqueness constraints, and every project row.

This is a safe functional rollback, not a destructive return to the exact old
schema. Never drop/reset counters after numbers may have been issued, even if
no surviving project row uses them. New project rows remain intact. If the
migration itself failed before commit, rollback its transaction; do not run the
post-commit rollback script against absent objects.

Re-enabling after functional rollback now supports rerunning the full canonical
reviewed migration: it verifies and retains allocator/constraint state, never
reseeds existing sequences, and reinstalls the RPC/browser grants. This exact
rollback/reapply flow was tested on real PostgreSQL. Stop if retained-state
validation fails; never manually reset the counters. Do not deploy older
raw-insert or UUID-external-ID creation as a fallback.

## Minimal live smoke test: NOT PERFORMED

Only after explicit permission for one live row:

1. Run the validation query listing existing Recycle rows and inspect the
   repeating sequence's last value without calling `nextval`. Record both.
2. In Workbench, Add Project; select **repeating**, title **Recycle**, choose the
   desired state/category/property and a nonempty recurrence; leave order blank
   unless deliberately setting a valid integer.
3. Submit **once**. Verify one POST to `/rest/v1/rpc/create_workbench_project`
   with `p_type: "repeating"` and no caller-supplied `id` or `external_id`.
4. Verify one new UUID and a returned `PC` ID at least `PC0009`, not `PC0003`.
   Expect exactly PC0009 only if no higher live maximum or intervening sequence
   consumption exists. Do not require gaplessness or transaction commit ordering.
5. Verify the new UUID is in `projects_repeating`, appears once in `projects_all`,
   and remains visible after a Workbench refresh. Compare it with the before
   snapshot to establish exactly one addition.
6. Stop on any error. A network timeout may have committed: inspect by the
   returned identity/results before retrying. Do not automatically delete the
   smoke-test row, restore old IDs, or perform unrelated edits.

## Validation performed in this review

The owner subsequently authorized disposable SQL execution, not live execution.
The [real PostgreSQL tests](../../tests/workbench-project-postgres.test.cjs)
initialize a fresh local cluster bound only to 127.0.0.1 on a dynamically chosen
port; every connection explicitly targets that cluster. Ambient PG connection
settings are removed. The cluster is stopped and deleted after each run. The
[fixture](../../tests/fixtures/workbench-live-schema.cjs) reconstructs columns,
types, defaults, nullability and the unified view from the saved live CSVs.

Validated:

- 16 distinct concurrent backend sessions each for home and repeating, without
  duplicate IDs; consecutive allocation ranges when no failure intervenes.
- Real backend cancellation after allocation for both types: no project row
  commits, and the consumed number is not reused.
- Rejected inserts roll back an entire transaction, including a prior successful
  insert in that transaction; both consumed numbers remain unused.
- All four prefixes, UUID/default preservation, raw-table routing and view
  visibility, per-table uniqueness, caller-ID/unknown-field rejection, int32
  boundaries, browser roles, invoker privilege/RLS enforcement.
- Deployment lock timeout measured about 5.1 seconds with another backend holding
  the exclusive table lock; no allocator objects were installed on that failure.
- Functional rollback removes the RPC and browser allocator access while
  preserving rows, unique constraints and counter values; full canonical reapply
  preserves those values and subsequent IDs advance correctly.
- Fresh repeated deployment and execution of all read-only verification scripts.
- PGlite additionally covers four-digit padding/expansion beyond 9999, every
  approved floor, higher current maxima, and rejection of damaged retained state.

To reproduce the full suite with real PostgreSQL, set `WORKBENCH_TEST_PG_BIN` to
an existing local PostgreSQL bin directory, then run `npm test`. Without that
variable the real-server test is explicitly skipped; PGlite tests still run.
No PostgreSQL package, global service, or project dependency was installed.

Final workspace validation:

| Command | Result |
| --- | --- |
| `npm run lint` | Passed, zero errors/warnings |
| `npm test` with `WORKBENCH_TEST_PG_BIN` set | 152 passed, zero failed/skipped |
| `npm run build` | Passed; existing large-bundle warning only |

The final real concurrency run allocated PA0214 through PA0229 and PC0013
through PC0028 in 16 distinct backend sessions per type; these are disposable
fixture IDs, not live IDs. Lock timeout occurred after 5,083 ms. No duplicate,
reused canceled/failed number, or changed pre-existing identity was observed.
Both functional rollback/reapplication and a second fresh-database deployment
passed. Generated bundle changes from validation were cleaned up rather than
included as unrelated source changes.

Canonical file SHA-256:

```text
2D97F813ACA5776323F83DB967341FDEFAB23311A77BFD549F91C2D38A58427C
```

This hash identifies the exact SQL validated. Any edit requires revalidation.
