# Project deletion: focused ownership evidence

**Evidence preparation only. No SQL has been executed by the assistant.
No delete RPC, UI, schema change, remote call or test dependency is created.**
These files use the supplied live catalog column names. No missing review
report is required: the authoritative schema evidence is the thirteen exports
in [the inspection results](../project-deletion-inspection/results/).

## Owner policy recorded for the later design

- Delete only exclusively owned project records through explicit identity
  paths, including historical, archived, completed and tombstoned dependents.
- Shared `default` profile only; preserve unrelated entries and all global
  settings/backups. Never replace a whole queue or Parking collection.
- Any ambiguous/shared candidate blocks that project's deletion; preserve it
  until resolved. Matching title/category/arbitrary UUID text is not ownership.
- Non-default project references block that project; never delete those rows.
- Active project-owned remote notification identities block deletion.
  No Google API call, cancellation or outbox is approved.
- Canonical UUID/type identity, atomic database rollback, master last,
  `projects_all` never a mutation target, allocator history untouched.

### RLS boundary is not resolved merely by running these queries

Run **all queries as postgres** (the supplied role has BYPASSRLS), not anon or
authenticated. Browser roles cannot see non-default rows in the older profile
tables. A SECURITY INVOKER function running as those roles cannot reliably
detect and report such hidden references. SELECT grants and table locks do
not bypass RLS. A one-time empty query 14 cannot enforce future absence.

The owner requires both "never access non-default rows in the browser workflow"
and reporting those hidden rows when present. The future design needs a
separately authorized visibility-safe guard or enforced ownership invariant;
do not silently weaken either requirement or introduce SECURITY DEFINER.
These owner-run queries are inspection, not authorization for browser access.

## Run individually and save results

1. Confirm the intended Supabase project, choose postgres in SQL Editor.
2. Copy one entire numbered file into its own tab and run it independently.
   No input substitution or disposable UUID is needed: these queries inspect
   existing representative relationships across projects.
3. Export its single result with the exact filename below. Keep results beside
   this README or in an owner-chosen results subdirectory and report location.
4. If it **succeeds** with zero rows, save the indicated `.empty.txt` instead.
   A permission error, missing relation, timeout or failed query is NOT empty.
5. Return all 14 exports/markers. Do not create data to populate an empty table.

Every file begins `BEGIN TRANSACTION READ ONLY;`, has one result-producing
query (possibly with CTEs/lateral subqueries), and ends `COMMIT;`.
No mutation functions or RPCs are invoked.

| SQL query | CSV result | Zero-row marker | Interpretation |
| --- | --- | --- | --- |
| [01_registry_task_links.sql](01_registry_task_links.sql) | `01_registry_task_links.csv` | `01_registry_task_links.empty.txt` | Both directions of registry/task links, registry UUID/type match and task UUID/source match; differing owners, missing endpoints and one-way links remain visible. Zero means no registry rows or task registry pointers, not no Planner tasks. |
| [02_historical_projects.sql](02_historical_projects.sql) | `02_historical_projects.csv` | `02_historical_projects.empty.txt` | Each copy's composite id/source, metadata and raw-master identity candidates. A text alias match still needs verification. Zero means table empty. |
| [03_historical_task_manager.sql](03_historical_task_manager.sql) | `03_historical_task_manager.csv` | `03_historical_task_manager.empty.txt` | Explicit projectId/alias candidates with source and metadata; unmatched/unlinked rows remain. Zero means table empty. |
| [04_historical_weekly_tasks.sql](04_historical_weekly_tasks.sql) | `04_historical_weekly_tasks.csv` | `04_historical_weekly_tasks.empty.txt` | Project, task, parent/master and metadata sourceTaskId paths; history and embedded state. Conflicting paths are not merged into ownership. Zero means table empty. |
| [05_repeatable_masters.sql](05_repeatable_masters.sql) | `05_repeatable_masters.csv` | `05_repeatable_masters.empty.txt` | Master/project/task identities, source, active state and candidate endpoint rows. Zero means table empty. |
| [06_repeatable_overrides.sql](06_repeatable_overrides.sql) | `06_repeatable_overrides.csv` | `06_repeatable_overrides.empty.txt` | Override project/id links, parent candidates, inactive/removal flags. Zero means table empty. |
| [07_historical_parking_conversions.sql](07_historical_parking_conversions.sql) | `07_historical_parking_conversions.csv` | `07_historical_parking_conversions.empty.txt` | Every sampled older Parking row, profile, conversion type/id and candidate project/task/weekly endpoints. Unconverted rows are retained for context. Zero means table empty. |
| [08_curated_queue_entries.sql](08_curated_queue_entries.sql) | `08_curated_queue_entries.csv` | `08_curated_queue_entries.empty.txt` | Individual composite profile/task keys, complete item JSON and explicit task/project candidates. Zero means queue table empty. |
| [09_staged_queue_entries.sql](09_staged_queue_entries.sql) | `09_staged_queue_entries.csv` | `09_staged_queue_entries.empty.txt` | Individual profile/id entries, item identities, task/project candidates; unlinked ideas are not automatically owned. Zero means queue table empty. |
| [10_planner_task_master_links.sql](10_planner_task_master_links.sql) | `10_planner_task_master_links.csv` | `10_planner_task_master_links.empty.txt` | All sampled tasks, including deleted/unlinked, direct master and registry paths, series/queue metadata. Zero means table empty. |
| [11_planner_weekly_ownership_paths.sql](11_planner_weekly_ownership_paths.sql) | `11_planner_weekly_ownership_paths.csv` | `11_planner_weekly_ownership_paths.empty.txt` | Direct UUID/alias, task sourceTaskId/parent, historical master candidates; overrides/tombstones/checklist/reminder preserved as evidence. week-settings is explicitly shared. Zero means table empty, including settings. |
| [12_planner_parking_conversions.sql](12_planner_parking_conversions.sql) | `12_planner_parking_conversions.csv` | `12_planner_parking_conversions.empty.txt` | Modern conversion flag + type + ID with all matching endpoint types and context; unknown/missing type does not authorize removal. Zero means table empty. |
| [13_remote_notification_identities.sql](13_remote_notification_identities.sql) | `13_remote_notification_identities.csv` | `13_remote_notification_identities.empty.txt` | Full, uncapped list of active/unknown-state notification candidates in current/historical row and queue reminder paths, with direct and indirect identity context. Deliberately includes unrelated/unlinked reminders so missing project links cannot conceal an external blocker. |
| [14_non_default_profile_references.sql](14_non_default_profile_references.sql) | `14_non_default_profile_references.csv` | `14_non_default_profile_references.empty.txt` | Full, uncapped list of explicit identity-bearing non-default entries, including unresolved references. Gives profile/table/composite key, exact identity field and endpoint context; matches are not automatically ownership. |

Marker contents, exactly:

```text
Query completed successfully.
Zero rows returned.
```

Do not keep both a CSV and marker for the same run.

## Sampling, identity evidence and classification

Queries 01-12 return at most 100 outer rows, ordered by identity, with a window
count of the entire eligible relation/join result. Query 01 counts joined link
rows, not distinct registries. If the count exceeds exported rows, evidence is
**representative only**; do not infer that unsampled rows are unambiguous.
Further targeted read-only pages/queries will be needed where relevant.
Nested endpoint arrays are not capped so collisions remain visible.

All main rows survive LEFT joins even when their links are broken or missing.
Empty endpoint arrays are represented by SQL NULL; that means "no candidate
match", not "shared" or "safe to remove". Multiple candidates can be conflicting
owners or two fields reaching the same owner; review paths rather than counts.
`uuid_match`, `source_matches` and `type_matches` expose evidence independently.
External alias matches are candidates until uniquely resolved to the exact
master and canonical type. No prefix/title/category heuristic is used.

Queries expose native JSON for the structured ownership fields used by current
code and historical migration. Raw metadata can contain unrelated references;
returning it is not declaring ownership. Each conversion's type and target must
agree: project/repeatable vs task-manager/ad-hoc vs weekly. Unknown target types,
cross-table ID collisions or conflicting UUID/type paths require review.
Query 07/12 endpoint JSON provides onward links; use queries 01/04/05/10/11 to
resolve those endpoints through to a master, not just through one join.
Additional/encoded identity paths discovered in these JSON results will need
targeted queries; this is not a claim to decode unknown JSON schemas.

Zero results do not prove a historical table is retired permanently.
The exports cannot establish "inactive storage" by themselves: that also needs
writer/lifecycle evidence. Empty, shared, owned and ambiguous are distinct states.

## Remote notification scope

Query 13 examines current/historical reminder columns, task metadata reminder
objects and queue item reminder objects. It includes `eventId`/`event_id` or a
Google Calendar provider when active is true or unknown. Explicit false is not
an active blocker under the approved initial policy. It does not prove that
remote events are absent; no external API is consulted.

For each result verify the owning record's exact project/task/master path.
An active remote identity on a verified owned row blocks that project.
Unknown active/provider/ownership state needs review, not deletion.
Unrelated imported Calendar events and their Planner rows must survive.
No cleanup strategy has been selected.

Query 14 inspects only the three live profile-scoped collections, excluding
global planner_profiles/legacyImport snapshots from ownership. It returns
explicit references even when no master/task endpoint matches. Unmatched
provenance is not an automatically owned project. It never inspects titles,
notes or arbitrary UUID text as ownership evidence.

## Conditions before implementation can proceed

- Queries 01-12 do **not** have to be empty. Proven exclusive dependencies are
  eligible for the approved cascade regardless of age/state. Ambiguous/shared
  paths involving the target must be resolved; otherwise that project's
  deletion must fail closed and preserve them.
- Query 13 need not be empty globally. There must be **zero active remote
  notification dependencies for the project being deleted**; unrelated remote
  reminders survive. Unknown-state candidates require review.
- Query 14 need not be empty globally. There must be **zero verified target
  project references in non-default profiles**, and no unresolved candidate
  that could be one. Any such reference blocks that individual deletion.
- Runtime detection of RLS-hidden blockers must still be designed consistently
  with the owner's scope and invoker-only security requirements; a clean
  inspection snapshot is not a durable security guarantee.
- Identity conflicts, ownership aliases, default-profile row selection and
  concurrency/revalidation must be explicit before any cascade is implemented.

No deletion RPC/UI is prepared in this step. The existing disposable project,
Home Recycle, Repeating Project Test and allocator sequences remain untouched.
