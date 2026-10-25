# Project deletion: read-only schema inspection

No deletion implementation or deployment is authorized by these files.
No SQL was executed while preparing this workflow. Every numbered file has
one result-producing query inside a READ ONLY transaction. Nested catalog
queries are part of that single statement. Definitions are returned as text;
never execute any returned function, trigger, policy or view definition.

## Run individually

1. Open the intended Supabase project's SQL Editor as the database owner
   (`postgres`). Confirm the project yourself. No connection is made by the
   application or assistant for this workflow.
2. Open one numbered SQL file below in VS Code, copy the entire file into a
   fresh SQL Editor tab, and run it once. Do not combine numbered files.
   No substitutions or project UUID are needed for schema inspection.
3. Export that query's result as CSV into [results/](results/) using the exact
   filename below. Review function definitions locally; do not execute them.
4. Repeat for all 13 files. Query 13 preserves effective role-access checks
   from the original combined inspection, including inherited/PUBLIC access
   which raw grant listings alone do not fully characterize.
5. Return the results for review before dependency-location or implementation.
   Errors/permission failures are not empty results: save/report the error and
   do not claim that the schema or dependencies are absent.

| Query | Expected result filename |
| --- | --- |
| [01_relations_rls_acl.sql](01_relations_rls_acl.sql) | `01_relations_rls_acl.csv` |
| [02_columns.sql](02_columns.sql) | `02_columns.csv` |
| [03_constraints_foreign_keys.sql](03_constraints_foreign_keys.sql) | `03_constraints_foreign_keys.csv` |
| [04_indexes.sql](04_indexes.sql) | `04_indexes.csv` |
| [05_triggers.sql](05_triggers.sql) | `05_triggers.csv` |
| [06_rls_policies.sql](06_rls_policies.sql) | `06_rls_policies.csv` |
| [07_table_privileges.sql](07_table_privileges.sql) | `07_table_privileges.csv` |
| [08_column_privileges.sql](08_column_privileges.sql) | `08_column_privileges.csv` |
| [09_project_reference_columns.sql](09_project_reference_columns.sql) | `09_project_reference_columns.csv` |
| [10_project_reference_foreign_keys.sql](10_project_reference_foreign_keys.sql) | `10_project_reference_foreign_keys.csv` |
| [11_planner_functions.sql](11_planner_functions.sql) | `11_planner_functions.csv` |
| [12_project_delete_functions.sql](12_project_delete_functions.sql) | `12_project_delete_functions.csv` |
| [13_effective_role_privileges.sql](13_effective_role_privileges.sql) | `13_effective_role_privileges.csv` |

If a query completes successfully with zero rows, instead save the same stem
with `.empty.txt`, for example `05_triggers.empty.txt`, containing exactly:

```text
Query completed successfully.
Zero rows returned.
```

Do not leave both a CSV and an empty marker for the same inspection run.

## Scope and interpretation

The core catalog queries cover **all non-system relations**, not a guessed
shortlist. Thus every existing public table is included, even if a column is
unexpectedly named. Missing expected relations must be reported, not assumed.
Foreign keys include incoming cross-schema references. All indexes (including
expression/partial indexes), internal/non-internal triggers, policies,
column/table grants, column ACLs, role privileges and view definitions are
reported. Query 03 includes all constraints and FK action codes; query 10
expands FK actions and includes every FK with a public endpoint.

Known required public relations from current code:
`projects_home`, `projects_vehicle`, `projects_repeating`, `projects_misc`,
`projects_all`, `planner_tasks`, `planner_weekly_tasks`, `planner_parking_lot`.

Additional historical candidates from the saved migration:
`planner_profiles`, `parking_lot`, `curated_queue`, `staged_queue`.
Their current live existence/use is unconfirmed. Global profiles, backup and
import snapshots must not be treated as project-owned just because a UUID occurs.

Query 09 inventories public UUID, JSON/JSONB, string, numeric and array columns
plus identity-like names (project, parent/master, conversion, source-task and
external-ID fields). Broad inclusion is intentional: a column name or UUID
storage type is not an ownership rule. Query 02 additionally includes every
column, including custom/domain types not recognized by query 09.
The exact additional candidate table names will be known only from returned
live results; none are claimed discovered before execution.

All public functions are included in query 11 to avoid relying on names alone;
related functions in other schemas are also candidates. Query 12 is a
supplemental text/name filter for possible removal functions, not proof that
an empty result means no deletion behavior. Review query 11 and triggers too;
dynamic SQL or external services can escape textual matching.

## JSON and Calendar inspection boundary

Code-confirmed paths requiring semantic review:

- `planner_tasks.metadata_json`: `series`, `queue`, `queueOrder`.
- `planner_weekly_tasks.metadata_json`: `sourceTaskId` and override metadata;
  `project_id` and `parent_rep` link project/master identities.
- `planner_weekly_tasks.reminder_json`: `active`, `provider`, `eventId`, `sendAt`.
  Removing the owning local record can leave a remote notification event.
- `planner_parking_lot.converted_to_id` plus
  `metadata_json.conversionType`: target can be a project, task or weekly row.
- Embedded checklist/reminder JSON belongs only to its characterized owning
  row; it is not an independent ownership match.
- Historical queue `item`, Parking `convertedTo` and global `legacyImport`
  JSON require review if those relations exist.

Google notification events use `extendedProperties.private.plannerTaskId`.
Imported Calendar weekly records use Google event identities; unrelated events
must not be removed. Catalog inspection identifies storage and definitions,
not which live rows have active remote events. The later candidate locator
reports reminder state; path-specific review must establish ownership.
No Google API is called, no event is cancelled, and no eventual-consistency
design is selected. Present remote cleanup separately after DB inventory review.

## Dependency generator: only after schema review

The supplied live catalog exports have now been reviewed; see
[live-schema findings](LIVE-SCHEMA-REVIEW.md). Status:
**READY FOR DEPENDENCY INSPECTION as postgres**, not approval for deletion.
The actual discovered additional relations include project_registry, projects,
task_manager, weekly_tasks, repeatable_masters and repeatable_overrides.

Use the separate [generator](../project_deletion_dependency_query_generator.sql).
Replace **only these two values in its first `settings` CTE**:

1. `'00000000-0000-0000-0000-000000000000'::uuid AS project_id`:
   substitute the persisted UUID of an owner-designated disposable test project.
2. `'home'::text AS project_type`: substitute exactly one of `home`, `vehicle`,
   `repeating`, `misc`, matching that physical master. Do not infer type from
   title, recurrence or external-ID prefix.

Do not globally replace the nil UUID: the generated script retains a nil-ID
guard. Do not use Home Recycle or Repeating Project Test for this workflow.

After results are reviewed and the disposable identity is selected:

1. Run the edited generator by itself. It produces one `inspection_sql` text
   cell and does not scan application records or execute the generated text.
2. Copy the complete cell into a separate SQL Editor tab and review it.
   It must start/end with the READ ONLY transaction wrapper. Execute only
   after schema review; the public-table scan may be expensive.
3. Export that single result as
   `results/dependency_candidates_<project-uuid>.csv`.
4. Require `identity_check.valid_for_review = true` and exactly one matching
   master. Otherwise stop and report the identity mismatch.
5. Treat `candidate_reference` rows only as discovery evidence. The locator
   follows exact scalar identity matches and candidate row IDs transitively;
   it can include self-ID matches, global snapshots and coincidental aliases.
   It never authorizes deletion or declares ownership. It now follows
   explicit registry/task/queue identity candidates as well as row IDs,
   reports composite row keys and history/conversion/reminder context, and
   includes inspection_context and profile_scope sections. Verify execution
   as postgres with BYPASSRLS; older tables hide non-default profiles from
   anon/authenticated. Return all sections, not only candidate rows.

Limitations: the locator scans public base tables (including partition parents),
not foreign tables, views, non-public tables or remote services; it does not
decode composite/string-encoded IDs, inspect JSON keys or parse JSON stored in
text. Expanding matches can reach unrelated records. Resolve all such findings
with field-specific semantic inspection after schema review.

The original [combined inspection](../project_deletion_schema_inspection.sql)
remains unchanged as historical preparation; use these individual files for
the new result collection. Nothing here is wired to migrations, builds, or
application execution.
