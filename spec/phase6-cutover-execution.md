# Phase 6 execution report

## Superseding result: live-data-only local cutover completed

The owner subsequently directed skipping **all** legacy backup content.
The [modernized build report](phase6-modernized-build.md) records completed
local web/mobile/Capacitor asset cutover using existing Supabase data and saved
modern configuration only. No failed insert was retried; no backup data was
imported. The failed migration history below is retained, not a current gate
or authority for cutover.

## Final result: STOPPED on actual database UUID constraint; zero rows inserted

After the initial preview stop below, the owner explicitly authorized a revised
insert-only merge: preserve all existing rows and the current planning week,
import only non-conflicting records. Production backup service now supports
that explicit `preserveExisting: true` option for legacy backups only; default
strict conflict behavior and modern backup validation remain unchanged.

### Authorized revised execution

- Started `2026-10-25T02:44:41.980Z`, completed `2026-10-25T02:44:45.971Z`.
- Saved a fresh production Planner checkpoint before the attempt.
- Preview: **36 proposed inserts, 0 conflicts**, 43 differing existing weekly
  rows intentionally preserved, current week retained, 12 retired source
  records excluded, both owner-authorized orphans retained.
- Called production restore **once**, with no project-target verification.
- The first task insert failed on its unchanged legacy task primary ID:

> Backup restore stopped after 0 inserted row(s). No existing row was overwritten.
> Refresh the preview before retrying. Saving planner_tasks task-home-194:
> invalid input syntax for type uuid: "task-home-194"

- This is the actual database error, not a local UUID preflight or guessed
  incompatibility. `106` was passed unchanged in the proposed data but was not
  reached because the first task insert failed. No alternate IDs were attempted.
- **0 inserts succeeded.** Read-only checkpoint comparison after the attempt
  found **0 added IDs, 0 changed existing rows, 0 missing IDs** in all three
  Planner groups. Week settings remained unchanged.
- No automatic retry, row substitution, schema alteration, orphan linking,
  entry transition, build switch, protected retirement or legacy deletion.

Revised checkpoint SHA-256:
`edbe344852d1cc5f950421be703bc8ba6c84c1c580bbb9f4d4209a370855f03e`

Post-attempt export SHA-256:
`54639db75bf0199d622673231942ed5784ca24e80677833881aa8419c9776628`

Export hashes differ because export timestamps differ; canonical group data and
week settings compare equal. Private checkpoint, post-attempt export, preview
and ledger are saved under the session's `files/phase6-preserve-execution/`.

The saved identity decisions are unchanged, but successful execution cannot
proceed under the observed database schema with these task IDs as primary UUIDs.
No conversion to generated/substituted UUIDs or schema change is authorized.
Dependent screen/build cutover remains stopped.

### Post-attempt verification

The explicit preserve-existing legacy mode is covered by production-storage
fixtures: differing rows and week settings are untouched, only new records are
inserted, default strict preview still conflicts, and modern backups reject this
migration-only option. Full offline suite: **191 tests passed, zero
failures/skips**; both React production builds passed in memory. Focused backup
service lint and related diff checks passed. Preservation checks against 107
prior protected/input/output fingerprints found zero missing files and zero
unexpected changes beyond previously authorized identity-source edits.

## Initial attempt: STOPPED at live production preview

Execution was explicitly authorized on October 24, 2026. Safe mode remains
active. The [Phase 6 plan](phase6-cutover-plan.md) requires stopping on existing
row/week-setting conflicts without forced overwrite or entry replacement.

Execution began at `2026-10-25T02:38:48.803Z` using the existing Trips Vite
configuration and normal application publishable credentials. No elevated key,
project-target query, schema verification or substituted identity was used.

## Completed

1. Loaded the actual production backup/import/storage services through Vite.
2. Preserved exact source backup and owner-crosswalk copies and fingerprints.
3. Exported current Planner state through the production backup service as a
   local recovery checkpoint before any potential restore.
4. Ran the live production preview with final crosswalk, exclusions, event-local
   dates, recurrence/queue adapters, unchanged `106` and two authorized orphans.
5. Saved the preview, proposed-insert manifest and execution ledger privately in
   the session's `files/phase6-execution/` directory.
6. Compared the captured checkpoint with incoming rows offline, without another
   service request, to characterize the stop condition.

No active browser Planner was driven; the headless production-storage session
serialized its own operations and did not initialize a UI/controller or its
background mutations. The checkpoint and preview are production service results,
not mocked data or proof of a globally locked database.

## Observed preview result

| Measure | Actual result |
| --- | --- |
| Proposed inserts | 36: 15 task/master rows and 21 weekly rows |
| Identical rows | 0 |
| Conflicts | 44: 43 existing weekly records differ, plus planning-week settings |
| Excluded source records | 12: nine weekly and three recurrence records |
| Authorized orphan rows | Both accepted, proposed with empty project links |
| Current planning week | `2026-10-19` |
| Historical backup week | `2026-08-10` |
| Checkpoint groups | 19 task records, 252 weekly records, two Parking records |
| Restore calls / inserts / updates / deletes | **0 / 0 / 0 / 0** |

The explicit production setting error was:

> Week settings differ. Merge restore cannot change the current planning week.

Each of the 43 overlapping weekly records produced:

> weeklyTasks [stable row ID]: existing content differs.

The complete exact conflict list and stable IDs are retained in the saved preview
and execution ledger. No database constraint error occurred: no insert was
attempted after this earlier stop condition. Project `106` was not blocked by
client syntax or availability checks; it remains proposed unchanged.

## Offline conflict characterization

Comparing incoming records to the production-export checkpoint found:

| Differing field | Overlapping weekly rows |
| --- | --- |
| metadata | 43 |
| completed | 23 |
| projectId | 14 |
| parentRepeatableId | 14 |
| date | 6 |
| overridden | 6 |
| deletedInstance | 3 |
| timeSlot / bucket | 1 each |
| reminder | 1 |
| title | 1 |

These counts overlap. Import provenance contributes metadata differences, but
the conflicts are **not merely provenance differences**: completion, dates,
tombstones, references and reminder state also differ. Ignoring all conflicts
or overwriting the live rows would change existing state beyond the authorized
insert-only merge. No such bypass was performed.

## Input and checkpoint fingerprints

- Source backup SHA-256:
  `765d642a615c20c236810229e11abfb9608b5f44337817e223a688f3f32f3212`
- Owner-crosswalk SHA-256:
  `e603aa633e300e5cc4c37ea21ba3e51811a3a026e09334555ebd8b0c9f23c6b8`
- Recovery checkpoint SHA-256:
  `77e93954a44a6d480ee9ce08a60a321685a8b88e838c0ad8374c61bfe54710b1`

Sensitive checkpoint/preview data stays outside the repository. No credentials
were printed or included in this report.

## Cutover and preservation status

Planner, embedded Parking, Calendar, Workbench, Dashboard, Trips, protected
web/mobile entries, router and all generated/Android builds remain unchanged.
All 29 isolated implementations, compatibility URLs, templates and backend are
retained. No Calendar/SMS schedule, cancellation or Sheets operation occurred.
Database activity was read-only for checkpoint/preview.

Phase 5 attempt-readiness did not certify that a populated live database would
have no existing-row conflicts. This execution provides the missing observation:
**the current live merge is blocked on existing content and week settings**.
It does not reopen accepted identities, exclusions, orphans or target assumptions.

## Initial conflict decision (subsequently resolved by owner)

The saved plan prohibits automatically forcing differences or changing the
current week. A separately authorized resolution could preserve all live rows
and current settings while importing only the 36 non-conflicting records; that
would intentionally skip 43 historical records and therefore is not equivalent
to the requested full import. Alternatively, reconcile conflicting rows
individually without writes before selecting a new merge policy.

The owner selected the non-conflicting-only option. Its subsequent attempt and
actual database rejection are recorded at the top of this report. No further
retry is scheduled; dependent screen/build cutover remains stopped.
