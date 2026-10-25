# Individually runnable project-deletion deployment validation

These files split the checks in
[the combined validation](../project_deletion_deployment_validation.sql).
The original file remains unchanged. These are catalog reads only: they make no
writes, do not invoke the deletion RPC, and do not advance allocator sequences.
No SQL was executed when preparing these files.

## Running the checks

In the correct Supabase project's SQL Editor, use the `postgres` role. Run each
entire numbered file separately, including its read-only BEGIN and COMMIT.
Save every result before testing deletion. Each file has one result-producing
SELECT statement; nested SELECTs in the RPC check are part of that statement.

| File | Expected PASS criteria |
| --- | --- |
| [01_rpc_definition_security_grants.sql](01_rpc_definition_security_grants.sql) | Exactly one `rpc` row. `function_count=1`; `returns_jsonb=true`; `security_invoker=true`; `empty_search_path=true`; `public_execute=false`; `anon_execute=true`; `authenticated_execute=true`. |
| [02_modern_tables_rls_privileges.sql](02_modern_tables_rls_privileges.sql) | Exactly seven `modern_table` rows, one per table listed below. Every row has `rls_disabled=true`, `anon_select_delete=true`, and `authenticated_select_delete=true`. |
| [03_modern_table_count.sql](03_modern_table_count.sql) | Exactly one `modern_table_count` row with `detail=7`. |
| [04_projects_all_projection.sql](04_projects_all_projection.sql) | Exactly one `view` row with `read_only_projection=true`. Zero rows is a failure, not a PASS. |
| [05_allocator_sequence_snapshot.sql](05_allocator_sequence_snapshot.sql) | Exactly four `allocator_snapshot` rows, one per sequence listed below. Each has `increment_by=1`, `cycle=false`, and a visible `last_value`; save the values for later comparison. |

Required modern tables:

- `projects_home`
- `projects_vehicle`
- `projects_repeating`
- `projects_misc`
- `planner_tasks`
- `planner_weekly_tasks`
- `planner_parking_lot`

Required allocator sequences:

- `projects_home_external_id_seq` (PA)
- `projects_vehicle_external_id_seq` (PB)
- `projects_repeating_external_id_seq` (PC)
- `projects_misc_external_id_seq` (PD)

The allocator values are live snapshots, not prescribed constants. Deletion must
not change them; concurrent unrelated creation can advance them, never rewind
them. Do not call nextval/setval or create a project to test the snapshot.

## Interpretation and limits

Stop before testing Delete Project if any query errors, any expected row is
missing, or any PASS criterion fails. Preserve diagnostic outputs. Do not retry
deletion or manually delete remaining rows.

The RPC check verifies the exact UUID/text signature, return type, invoker
security, search path and execution privileges. It does not execute the function
or prove a byte-for-byte body match. Retain the canonical deployed migration and
its SHA-256 from the [final deployment plan](../MODERN-PROJECT-DELETION.md).

The projection check confirms `projects_all` is an ordinary view. Its output
label expresses the application's read-only policy; `relkind='v'` alone does not
prove PostgreSQL rejects every possible write to a view. The deletion RPC must
never target it.

Passing these catalog checks does not delete anything or authorize additional
smoke tests. Follow the existing one-disposable-project procedure in the
[deployment plan](../MODERN-PROJECT-DELETION.md), including the separate
pre-delete preview, saved dependencies/control rows and post-delete validation.
