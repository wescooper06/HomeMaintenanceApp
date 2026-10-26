# Canonical project database history and operational tools

Supabase is authoritative. The owner reported project creation deployed and
working, and subsequently reported project deletion deployed and live-validated.
This housekeeping pass did not connect to Supabase, execute live SQL, or
independently re-certify that deployment. Do not rerun migrations as cleanup.

## Retained inventory and classification

| File | Classification | Continuing purpose |
| --- | --- | --- |
| [202610250001_project_creation.sql](202610250001_project_creation.sql) | A: canonical deployed history | UUID generation, four type-specific sequences, unique external IDs and invoker creation RPC. |
| [202610250002_project_deletion.sql](202610250002_project_deletion.sql) | A: canonical deployed history | Invoker-only atomic modern cascade, master last, remote blockers. |
| [project_creation_rollback.sql](project_creation_rollback.sql) | B: operational disable | Disable creation without discarding counters, constraints or rows. |
| [project_deletion_disable.sql](project_deletion_disable.sql) | B: operational disable | Revoke/delete the deletion RPC, not application data. |
| [project_creation_preflight.sql](project_creation_preflight.sql) | C: operational read-only reference | Data/privilege safeguards before any separately approved future allocator maintenance. |
| [project_creation_validation.sql](project_creation_validation.sql) | C: operational read-only reference | Inspect deployed function, constraints, privileges, sequences and view. |
| [project_deletion_deployment_validation.sql](project_deletion_deployment_validation.sql) | C: operational read-only reference | Invoker/grants/RLS/view/allocator catalog checks without invoking deletion. |
| [project_deletion_preview.sql](project_deletion_preview.sql) | C: operational read-only reference | Exact identity/dependent/control/allocator snapshot before an authorized deletion. |
| [project_deletion_post_validation.sql](project_deletion_post_validation.sql) | C: operational read-only reference | Verify saved identities absent and unrelated control snapshots unchanged. |
| [MODERN-PROJECT-DELETION.md](MODERN-PROJECT-DELETION.md) | C: permanent policy/runbook | Ownership, Calendar boundary, recovery and concurrency limits. |

The canonical SQL is byte-for-byte unchanged. Its original "NOT EXECUTED" or
"proposal" comments describe preparation-time state, not the owner's subsequent
deployment report. References in immutable SQL comments to retired inspection
scripts are historical; those scripts are not deployment prerequisites now.
The concise current policies here replace the old investigation reviews.

SHA-256:

- Creation: `2D97F813ACA5776323F83DB967341FDEFAB23311A77BFD549F91C2D38A58427C`
- Deletion: `FE7129F45EE99D9EE649C8E0D0D5332FB789E88FF703A9E455B227CBEA35745F`

The versioned [Planner state migration](../migrations/202610230001_planner_remaining_state.sql)
is also retained as database history. Some relations in older history have since
left modern runtime; that is not permission to remove schema history or execute
database cleanup. These files are not a complete reproducible database baseline.
The [test-only schema fixture](../../tests/fixtures/workbench-schema.sql) preserves
the project/view/modern Planner shapes used by local regression tests, without
live rows; it is not a deployment migration.

## Identity and deletion policies

Home/vehicle/repeating/misc map explicitly to the four raw project tables.
PostgreSQL creates UUID primary keys and PA/PB/PC/PD external IDs. Approved initial
floors were 209/82/8/4; higher live maxima won during initialization. Numbers are
padded to at least four digits, expand beyond 9999, and are never gap-filled,
reset, decremented or reused through the RPC. Failed allocations can leave gaps.
Browser raw-write privileges remain a separate trust/access-control limitation.

Deletion uses exact UUID/type identity, not titles or external-ID prefixes:
typed linked modern Parking -> owned weekly -> owned tasks -> one raw master.
`projects_all` is a read-only projection, never a mutation target. Excluded
historical stores, profiles, unrelated/global rows and all allocators survive.
Owned active remote notifications block deletion; no Google API participates.
SECURITY INVOKER is required; changed RLS fails closed.

## Operational safety and recovery

Read the runbook and fill settings from a saved, freshly authorized preview.
Do not reuse the old disposable project's identity as permission for a new test.
The deployment catalog check confirms ordinary-view identity, not arbitrary
view write prevention or a function-body hash. Sequence snapshots need a saved
baseline to prove no rewind.

Disable scripts only disable capabilities. They cannot restore already committed
physical deletions. Supabase backup/PITR covering master and dependent data is
required for such recovery; Planner JSON does not contain master projects.
No backup configuration was changed or verified here.

## Retired investigation artifacts

Removed after consumer/reference checks: one-time schema query batches, collected
CSV/empty results, broad historical ownership locators/results, split validation
copies, old disposable-project smoke query, superseded proposal/review copies,
and the temporary project export. Combined operational validation survives.
Only the inspection-generator-specific test was retired; current lifecycle,
schema, allocator, UI, backup and navigation regressions remain.
See the [final health report](../../spec/final-modernization-health.md).
