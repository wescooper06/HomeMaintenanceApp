# Project schema inspection results

Run each linked query separately in the Supabase SQL Editor, including its
read-only transaction boundaries. Export its single result set as CSV using
the filename below, and save it in this directory.

| Query | Expected result filename |
| --- | --- |
| [01_relations_acl.sql](../inspection-queries/01_relations_acl.sql) | `01_relations_acl.csv` |
| [02_columns.sql](../inspection-queries/02_columns.sql) | `02_columns.csv` |
| [03_constraints.sql](../inspection-queries/03_constraints.sql) | `03_constraints.csv` |
| [04_indexes.sql](../inspection-queries/04_indexes.sql) | `04_indexes.csv` |
| [05_triggers.sql](../inspection-queries/05_triggers.sql) | `05_triggers.csv` |
| [06_rls_policies.sql](../inspection-queries/06_rls_policies.sql) | `06_rls_policies.csv` |
| [07_table_privileges.sql](../inspection-queries/07_table_privileges.sql) | `07_table_privileges.csv` |
| [08_column_privileges.sql](../inspection-queries/08_column_privileges.sql) | `08_column_privileges.csv` |
| [09_projects_all_view.sql](../inspection-queries/09_projects_all_view.sql) | `09_projects_all_view.csv` |
| [10_project_sequences.sql](../inspection-queries/10_project_sequences.sql) | `10_project_sequences.csv` |
| [11_project_functions.sql](../inspection-queries/11_project_functions.sql) | `11_project_functions.csv` |
| [12_role_select_privileges.sql](../inspection-queries/12_role_select_privileges.sql) | `12_role_select_privileges.csv` |

Empty results are meaningful. Preserve column headers in an empty CSV where
possible, or record explicitly that the query returned zero rows.

Function, trigger, view, and index definitions are returned as text only.
Do not execute any returned definition. These queries do not apply the proposed
migration. No queries were executed and no result CSVs were generated while
preparing these files.
