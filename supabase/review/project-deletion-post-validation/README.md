# Individually runnable post-deletion validation

These files split [the original post-validation query](../project_deletion_post_validation.sql)
without changing its predicates, output keys, control comparison, or allocator
snapshot semantics. The original file is unchanged. No SQL was executed during
preparation. No application code or deletion RPC is changed.

## Inputs and execution

Run each entire file separately in Supabase SQL Editor as `postgres`, including
its read-only BEGIN and COMMIT. Each file has one result-producing SELECT
statement; nested SELECTs, CTEs and UNION branches belong to that statement.
None invokes the deletion RPC, changes rows, or advances sequences.

Files 01-08 reproduce the original settings block in full. Copy the same saved
pre-delete inputs into every one of those files:

| Setting | Required value |
| --- | --- |
| project_id | Exact UUID from the saved preview; for the designated disposable test, `3ad885b1-d2dc-43e2-931c-2d802ced63f8`. Replace only the settings placeholder, not the nil-UUID safety comparison in file 01. |
| project_type | Canonical type from preview; `home` for the designated test. |
| external_id | Exact external ID from preview; `PA0211` for the designated test. |
| deleted_task_ids | All previewed task UUIDs as a uuid array. |
| deleted_weekly_ids | All previewed weekly IDs as a text array. |
| deleted_parking_ids | All previewed Parking IDs as a text array. |
| preview_identities_copied | Set true only after copying and checking the saved inputs. |
| expected_controls | JSON array of saved `control_snapshot.detail` objects, each with `relation`, `id`, and full `snapshot`. |

Empty ID arrays are valid only when the saved preview proved no corresponding
dependents. Do not guess missing IDs or reconstruct them from titles. Escape
apostrophes inside SQL string literals by doubling them, including in JSON.
File 09 needs no settings; it uses the saved pre-delete allocator snapshot for
manual comparison.

## File inventory and exact PASS results

Each query returns `section` and `detail`. Require all checks, not just zero
remaining counts. In particular, placeholder inputs can produce misleading zero
counts: run file 01 first with the same settings used in the other files.

| Filename | Purpose and inputs used | Exact expected PASS result |
| --- | --- | --- |
| [01_inputs_ready.sql](01_inputs_ready.sql) | Original input readiness predicate; UUID, canonical type, external ID and copied flag. | One `validation` row, detail `{"inputs_ready":true}`. This predicate intentionally does not validate saved arrays or control completeness; verify those against the preview manually. |
| [02_raw_master_absent.sql](02_raw_master_absent.sql) | Count UUID across all four raw master tables; UUID. | One `validation` row, detail `{"raw_uuid_remaining":0}`. |
| [03_projects_all_uuid_absent.sql](03_projects_all_uuid_absent.sql) | Count project UUID in the read-only view; UUID. | One `validation` row, detail `{"view_uuid_remaining":0}`. |
| [04_projects_all_external_id_absent.sql](04_projects_all_external_id_absent.sql) | Count external ID within the canonical type; type and external ID. | One `validation` row, detail `{"view_external_id_remaining":0}`. |
| [05_planner_tasks_absent.sql](05_planner_tasks_absent.sql) | Count saved task IDs or direct project ownership; UUID and saved task IDs. | One `validation` row, detail `{"tasks_remaining":0}`. |
| [06_planner_weekly_tasks_absent.sql](06_planner_weekly_tasks_absent.sql) | Count saved weekly IDs, direct project links, repeating parent, or owned-task parent/source identity; UUID, type, saved task and weekly IDs. | One `validation` row, detail `{"weekly_remaining":0}`. |
| [07_planner_parking_lot_absent.sql](07_planner_parking_lot_absent.sql) | Count saved Parking IDs or explicitly typed conversions to the project, tasks or weekly rows; UUID and all saved ID arrays. | One `validation` row, detail `{"parking_remaining":0}`. |
| [08_unrelated_controls_unchanged.sql](08_unrelated_controls_unchanged.sql) | Original relation/ID/full-row snapshot comparison; expected_controls. | One `control_validation` row: `controls_supplied` equals the saved nonzero control count, and `all_unchanged=true`. An empty controls array fails. |
| [09_allocator_sequence_snapshot.sql](09_allocator_sequence_snapshot.sql) | Original allocator snapshot; saved pre-delete allocator output required for comparison. | Exactly four `allocator_snapshot` rows with the sequence names below. Every last_value must be visible and not less than its saved value; start_value and increment_by must match the saved snapshot. In the absence of concurrent creation, require last_value unchanged. |

Required sequence names:

- `projects_home_external_id_seq`
- `projects_vehicle_external_id_seq`
- `projects_repeating_external_id_seq`
- `projects_misc_external_id_seq`

## Allocator interpretation and stop conditions

File 09 deliberately remains a snapshot: the original query has no baseline
input or automatic rewind comparison. Compare by exact sequence name against
the saved pre-delete snapshot. Concurrent unrelated creation may advance a
counter, never rewind it. A missing/null value or missing baseline is insufficient
evidence, not a PASS. Do not advance or reset sequences to validate them.

An absent external ID alone does not prove it cannot be reused; retain and
compare allocator high-water marks as well. For PA0211, the Home allocator must
retain the saved high-water mark at or beyond 211. Do not perform a live creation
to test reuse.

If any query fails, any expected result differs, or saved evidence is missing:
stop, preserve diagnostic outputs, do not retry deletion and do not manually
remove remaining rows. These checks are read-only validation, not authorization
for another deletion. Follow the [deployment/smoke-test plan](../MODERN-PROJECT-DELETION.md).
