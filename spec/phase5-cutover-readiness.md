# Phase 5 final readiness decision

Historical non-runtime record. Safe-mode/import statements below describe the
old decision, not current functionality. See [current architecture](architecture.md).

## Current scope: CUTOVER-READY; live-data-only local cutover completed

The owner's skip-all-legacy directive excludes all backup rows/identities from
execution and supersedes earlier import blockers and assumptions. Existing
Supabase data and saved modern configuration alone were used. No backup import
or retry occurred. See the [modernized build report](phase6-modernized-build.md)
for completed local entry/build changes, 194 passing tests and read-only browser
checks. Safe mode remains active; no legacy deletion/retirement or remote
deployment is implied. Earlier attempt-readiness findings below are historical.

## CUTOVER-READY for an owner-authorized execution attempt

**Subsequent execution outcome:** [Phase 6 live preview](phase6-cutover-execution.md)
initially found 43 differing existing weekly rows plus a planning-week conflict.
The owner authorized preserving existing rows/current week and importing only
non-conflicting records. Its revised preview passed; the database then rejected
the first unchanged task ID `task-home-194` as invalid UUID syntax. Zero inserts
succeeded, with no row changes or entry/build switch. Attempt-readiness was not
a certification of database compatibility; execution is now stopped on an
observed constraint, without ID substitution.

**Safe mode remains active. No cutover execution is performed or implicitly
authorized by this report.** This verdict means the owner-defined application
preflight gates are satisfied under the final accepted assumptions. It is **not**
a claim that database compatibility, successful import, deployed parity or a
completed cutover has been verified.

The supplied `106` value is not syntactically a UUID. A UUID-typed PostgreSQL
column cannot accept it unchanged. Owner authorization removes the application's
preflight rejection, not the database's type enforcement. If such a constraint
applies, the real import will fail. No schema change, correction, padding,
replacement ID or success-shaped fallback is made. Target availability is
explicitly assumed, not established.

## Final owner resolutions applied

| Item | Production behavior | Readiness interpretation |
| --- | --- | --- |
| Project `106` | Pass `3329de1a-c792-4f53-837e-cc5dae0eb88` unchanged to storage during legacy restore; no client UUID rejection | Owner-accepted execution risk, not a validated UUID |
| Missing curated project links | Only the two accepted stable row IDs are allowlisted as orphans; retain empty links and provenance | No identity generation or title inference |
| Project target availability | Legacy preview does not call `getProjects`; no existence or project conversion-target membership check | Owner-assumed; no fabricated verified targets |
| Master `107` | Use explicit existing master identity; preserve sparse metadata and supplied mapping | Accepted without independent master UUID corroboration |
| Retired identities | Exact saved null decisions and explicit dependent records still excluded | No reimport, merge or inferred replacement |
| Dates | Import-only event-local calendar dates; historical strings retained | Rows 13/14 become August 22, not UTC August 23 |
| Fallback | Explicit IDs only in production and retained consumers | No title/property/row heuristics |
| Frozen screen behavior | Parking notification/recurrence, Calendar lifecycle edge cases and Dashboard semantics unchanged | Owner-accepted post-cutover work; not claimed fixed |

Orphan exceptions:

- `curated-task-home-194-2026-08-14-1786655361196-81048`
- `curated-100-2026-08-15-1786655703404-47796`

Other curated/project rows lacking an explicit project link still conflict;
authorization does not silently extend to new orphan rows.

## Guards retained

The availability waiver is specific to **legacy-envelope import**. Modern
versioned backup validation and unique external-ID resolution remain strict.
Existing-row differences, week-setting conflicts, malformed shapes, duplicate
IDs, missing task/weekly conversion targets, nonempty retry queues without
disposition, and unsupported nested-day formats still fail explicitly.

Merge restore remains insert-only and rechecks conflicts. It does not replace or
delete existing rows, insert projects, replay Sheets retries, or schedule/cancel
notifications. Existing active-reminder import review behavior is preserved.
Database failures propagate through production storage with partial-insert
counts; a successful preview never means successful database execution.

## Complete repository backup evaluation

Offline preview using an empty fixture Planner with matching week settings:

- **0 application preflight conflicts; 79 proposed inserts.**
- 73 weekly source rows: **64 retained**, nine excluded by accepted retirements.
- Nine task-manager records and six retained recurrence masters: **15 task rows**.
- Three recurrence records excluded: **12 total excluded source records**.
- Exactly **two authorized orphans** keep empty project links.
- `106` stays byte-for-byte identical in mapped references and original metadata.
- Master `107` stays owner-authorized without a generated master ID.
- No project target reads, no real database reads/writes, and no Calendar,
  Sheets or Apps Script requests are used by this evaluation.

This fixture result does not assume the current live Planner has no conflicts or
matching week settings. Production restore must continue to surface such errors.

## Evidence and next phase

- [Historical reconciliation](phase5-backup-reconciliation.md) and
  archived 73-row source-classification summary retain their
  original syntax/export-validation findings. Their older blocked status is
  historical evidence, not the current owner-policy attempt-readiness verdict.
- [Owner crosswalk](phase5-project-identity-map.json) remains unchanged.
  Its original planning context is historical; executable exceptions are explicit
  in the production adapter audit and this final decision, not rewritten values.
- The now-retired legacy dependency map and
  [safe-mode preparation](phase5-safe-mode.md) recorded the boundary at that time.
- [Phase 6 execution plan](phase6-cutover-plan.md) is prepared, not executed.

## Validation and preservation

Offline tests exercise unchanged UUID submission, authorized orphan scope,
zero project-target queries, server-error propagation through production data
access, exact mapping, dates, retirements, backup idempotence and retained
no-title-fallback behavior. Main and standalone production builds use in-memory
output only.

All 29 isolated implementations, protected screens, entries/router, static/mobile
and Android outputs, backend and original input files remain retained. No
destructive operation, protected retirement, build switch or live import occurs.

Final measured validation:

- **190 tests passed, zero failures/skips**, across all 15 repository test files.
- Both main React and standalone Activity Planner production builds passed
  **in memory**, without output replacement.
- Focused ESLint, changed-test syntax checks and related whitespace checks passed.
- **242 source/input/protected/backend/generated files** stayed unchanged during
  validation.
- Production-storage fixtures confirm unchanged `106` submission and explicit
  database-error propagation; the two orphan rows persist with null project
  links and stable IDs and re-preview as identical.
- No live service requests/writes, destructive operations, module removals,
  protected-screen retirements, deployment or build switches occurred.

**Final decision: CUTOVER-READY for the owner-authorized attempt under explicitly
unverified database assumptions. Safe mode remains active. Phase 6 is planned,
not executed; database success is not certified.**
