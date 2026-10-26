# Phase 6 protected-screen cutover execution plan

## Superseding scope: skip all legacy backup content

The owner's final directive replaces the import sequence below with a
live-Supabase/configuration-only cutover. Local execution is complete:
see the [modernized build report](phase6-modernized-build.md).
Production legacy backup restore is disabled; prior inserts are not retried.
Web/mobile entries and required local web/Capacitor build assets were switched;
all legacy implementations remain retained. No remote release is claimed.
The original migration plan below is historical, not pending import instructions.

## Status: execution attempted; database rejected unchanged task ID; safe mode active

See the [execution report](phase6-cutover-execution.md). Production checkpoint
and initial preview completed; the owner then authorized preserving existing
rows/current week and importing only non-conflicting records. That revised
preview passed, but one restore attempt failed on actual UUID syntax rejection
of unchanged task ID `task-home-194`. Zero inserts succeeded; before/after
Planner data and settings were unchanged. No entries/builds were switched.
The steps below remain the accepted plan, not completed actions.

Phase 5 is [CUTOVER-READY for an owner-authorized execution attempt](phase5-cutover-readiness.md),
not certified for database compatibility or successful deployment. The owner
subsequently authorized execution; that authorization did not waive existing-row
overwrite guards or historical/current week conflicts. This document does not
disable safe mode.

Preparation validation: 190 tests passed, both production builds passed in
memory, and 242 source/input/protected/backend/generated files stayed unchanged
during validation. These results do not test real database acceptance.

## Accepted inputs and constraints

- Use the unchanged repository backup, supplied export, exact owner crosswalk and
  accepted retirement decisions. Never create projects, infer titles, substitute
  identities or rewrite historical inputs.
- Pass `106` unchanged. If UUID enforcement rejects it, report the real failure
  and stop dependent cutover steps; no schema/type workaround is authorized.
- Import the two named curated orphans with empty project links.
- Assume project availability as directed. Do not introduce target-verification
  gates or label those assumptions as verified observations.
- Keep the owner-frozen Parking, Calendar and Dashboard behaviors for later
  modernization. Do not claim full parity for deferred cases.

## Execution order and stop conditions

1. **Explicit execution authorization and recovery checkpoint**
   - Confirm execution scope, deployment destination and maintenance window in the
     Phase 6 instruction. Retain protected entries and deployed outputs for
     reversible entry/build rollback; do not remove them to start cutover.
   - Capture current Planner JSON through the modern backup UI and preserve the
     exact source backup/crosswalk plus a proposed-insert manifest.
   - No database deletion, bulk overwrite, policy change or automatic restore of
     that checkpoint is implied.
2. **Production preview, no target verification**
   - Run the production parser/preview under the accepted legacy policy.
   - Record actual existing-row/week-setting conflicts and the excluded/orphan
     audit. The offline 79-insert result is not the expected count in a populated
     database; identical existing rows may be skipped.
   - Keep guards for differing existing rows and unsupported shapes. Do not force
     merge or overwrite to manufacture a conflict-free preview.
3. **Explicit merge confirmation**
   - Use the existing Planner backup lock, pending-write drain and insert-only
     restore. No Sheets retry replay or notification recreation.
   - Pass exact identities, including malformed `106`, without validation-based
     substitution. Production database rejection is an operational failure,
     never successful import.
   - Restore is not a whole-database transaction. On failure, record completed
     inserts, leave protected entries unchanged, reload/re-preview and report;
     do not automatically delete inserted rows or retry blindly.
4. **Import acceptance before entry replacement**
   - Only after actual restore succeeds, record inserted/skipped counts and
     reload success. Inspect orphan presentation without linking by title.
   - Preserve separate event-local weekly rows, recurrence flags, tombstones,
     checklist/metadata and inactive reminder-review records.
   - If restore or reload fails, do not continue to dependent screen cutover.
5. **Reversible protected entry transition**
   - Prepare and test modern routes for Planner/embedded Parking, Calendar,
     Workbench, Dashboard and Trips, plus compatibility deep links/mobile bases.
   - Build reviewed production artifacts and change entries only within the
     authorized deployment step. Keep retained implementations for rollback.
   - Validate navigation/back/refresh/deep links, resource links by explicit ID,
     backup UI, project edit-only restrictions and preserved frozen semantics.
   - Validate deployed asset requests: modern routes must not load legacy
     assets; retained rollback routes are intentionally different.
6. **Post-cutover observation**
   - Record deployment and per-screen acceptance. Revert entries/build references
     if needed; do not reverse data with deletes or overwrite restore.
   - Track account-switch/external-event Calendar cases, Parking notification/
     recurrence behavior and Dashboard semantics as separate modernization work.
7. **Separate legacy-retirement authorization**
   - Do not delete the 29 isolated modules, protected templates/screens, mobile
     paths, compatibility URLs, backup helpers or backend as part of this plan's
     execution unless specifically authorized after successful cutover evidence.
   - Record accepted SMS/old-build retirement approvals without claiming this
     plan has remotely cancelled triggers or removed installed clients.

## Required execution report

Record authorization, input fingerprints, preview/audit counts, restore outcome
(including partial errors), reload outcome, deployed artifact/version, per-screen
checks, asset-request findings, rollback references, frozen behavior acceptance
and remaining work. Never equate owner-assumed targets with verified constraints
or an offline pass with a successful live import.
# Historical archive notice

This superseded Phase 6 plan is retained only as documentation. Do not execute
its old migration/import steps. See [current architecture](architecture.md).
