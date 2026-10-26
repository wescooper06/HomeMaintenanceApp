# Phase 5 backup reconciliation: offline historical evidence

Archived, non-runtime investigation. The generated row-level reconciliation JSON
and temporary project export were retired in final housekeeping; this summary,
input hashes, owner crosswalk and original historical backup remain provenance
only. The retired reconciliation command below is not runnable or authorized.

**Backup gate: BLOCKED. No cutover or retirement performed.**
SMS retirement, old-build retirement and deployed Workbench policy are approved
by the user. This report does not execute remote trigger cancellation.

The supplied project export was tab-delimited. Both local inputs were
read-only. Hashes and the summary below document the former 73-row investigation;
the generated companion JSON was temporary output, not a restore source.
No title-based, numeric-prefix or row-order guess is an approved
mapping. Advisory title candidates in JSON are NOT verified identities.

Inputs:
- Repository backup SHA-256: 765d642a615c20c236810229e11abfb9608b5f44337817e223a688f3f32f3212
- Project identity export SHA-256: 55fdbe7045069318a9787bae69f566816464d2fa0c774db7f18654597572e04d
- Owner crosswalk SHA-256: e603aa633e300e5cc4c37ea21ba3e51811a3a026e09334555ebd8b0c9f23c6b8

An owner-supplied crosswalk was evaluated without modifying the input.
Non-null executable entries require valid UUID syntax and matching
UUID/external-ID/type in the local export. Explicitly allowlisted absent
identities may be accepted for safe-mode planning only; plannedUuid is distinct
from modernUuid, and target existence/type is not claimed as verified. Invalid
UUID syntax is not waived by owner authorization. Null entries are
explicit retirements: dependent rows are classified exclude-do-not-import.
No title fallback or project creation is permitted for them.

## Summary

| Measure | Count |
| --- | --- |
| exportedProjects | 301 |
| weeklyRows | 73 |
| references | 27 |
| verifiedMappings | 11 |
| retiredMappings | 4 |
| retiredWeeklyRows | 9 |
| invalidOwnerMappings | 1 |
| ownerMappingsAbsentFromExport | 0 |
| ownerAuthorizedUncorroborated | 3 |
| blockedMappings | 1 |
| calendarReferences | 8 |
| unresolvedMappings | 0 |
| ambiguousMappings | 0 |
| dateAdapterRows | 2 |
| curatedRowsMissingProjectLink | 2 |
| nestedDaysContainers | 0 |

Calendar event references are not project UUIDs: preserve their event identity,
do not create a project mapping. Remaining project/master IDs require an
authoritative legacy-to-current crosswalk; external IDs in this export are not
the numeric keys used by the backup.

## Project and event reference table

| Exact legacy reference | Expected types | Status | Verified UUID | Plan-only UUID | Disposition | Title-only candidate count |
| --- | --- | --- | --- | --- | --- | --- |
| 100 | repeating | verified-owner-crosswalk | d3d55965-4ccd-49a4-893b-1ae544021c77 | - | map-after-adapter-validation | 0 |
| 101 | repeating | owner-authorized-uncorroborated | - | 1f872b31-1067-4219-b7c3-1cf706b733da | plan-only-target-unverified | 0 |
| 102 | repeating | owner-authorized-uncorroborated | - | 8219283b-a796-4ffb-98a9-441df6fced1b | plan-only-target-unverified | 0 |
| 103 | repeating | verified-owner-crosswalk | 7ed9d827-89c5-4741-8e2d-a1f2ca0cfced | - | map-after-adapter-validation | 0 |
| 104 | repeating | retired-by-owner | - | - | exclude-do-not-import | 0 |
| 105 | repeating | retired-by-owner | - | - | exclude-do-not-import | 0 |
| 106 | repeating | invalid-owner-mapping | - | - | blocked | 0 |
| 107 | repeating | owner-authorized-uncorroborated | - | 00d6e300-3bb7-4d6a-9d7e-cfddde60a377 | plan-only-target-unverified | 0 |
| 108 | repeating | retired-by-owner | - | - | exclude-do-not-import | 0 |
| 137 | home | verified-owner-crosswalk | c2639d89-8c04-4d01-9ff1-6b2ae060d0db | - | map-after-adapter-validation | 0 |
| 139 | home | verified-owner-crosswalk | 4f491f7a-233f-45d0-b1a9-813e8cf36ad8 | - | map-after-adapter-validation | 0 |
| 159 | home | verified-owner-crosswalk | 0521cdec-8f70-4ae1-846c-b11f5538aee7 | - | map-after-adapter-validation | 0 |
| 189 | home | verified-owner-crosswalk | 5a903589-95fd-440f-92de-25056129c6b8 | - | map-after-adapter-validation | 0 |
| 1ikm2h65hkbbekrbs1lhulu4bd |  | calendar-event-reference | - | - | preserve-event-identity | 0 |
| 1u7a8f0hj42u7402ksi486obpv |  | calendar-event-reference | - | - | preserve-event-identity | 0 |
| 201rhbspumc6oq7njhgde3ks8k |  | calendar-event-reference | - | - | preserve-event-identity | 0 |
| 233 | home | verified-owner-crosswalk | fb1a78bd-a0f1-42a1-b329-c5db71574880 | - | map-after-adapter-validation | 0 |
| 28os2u3njsk8fqtenv6vloqj46 |  | calendar-event-reference | - | - | preserve-event-identity | 0 |
| 294 | home | verified-owner-crosswalk | 1300b289-19ae-48fa-8f46-28a92ffe6a8d | - | map-after-adapter-validation | 0 |
| 302 | home | verified-owner-crosswalk | 630a12e3-b9f2-4e27-8311-dccf37065622 | - | map-after-adapter-validation | 0 |
| 303 | home | verified-owner-crosswalk | a8ef4ebf-50fe-4157-89f5-817595f26873 | - | map-after-adapter-validation | 0 |
| 304 | home | verified-owner-crosswalk | 43a28669-1a01-44eb-b98c-3081e1e10efb | - | map-after-adapter-validation | 0 |
| 309 | home | retired-by-owner | - | - | exclude-do-not-import | 0 |
| 4h3tj8c64ges0lll9pegalmgtd |  | calendar-event-reference | - | - | preserve-event-identity | 0 |
| 4il100gli5461g9uif2vb4pkf2 |  | calendar-event-reference | - | - | preserve-event-identity | 0 |
| 5cf20qte07j5kca54rdht1u03c |  | calendar-event-reference | - | - | preserve-event-identity | 0 |
| 6fdlbernrvq8jlg2io05j69chn |  | calendar-event-reference | - | - | preserve-event-identity | 0 |

## Owner crosswalk validation

| Legacy key | Supplied external ID | Supplied UUID | Validation | Exported external ID |
| --- | --- | --- | --- | --- |
| 100 | PC0001 | d3d55965-4ccd-49a4-893b-1ae544021c77 | verified-owner-crosswalk | PC0001 |
| 101 | 101 | 1f872b31-1067-4219-b7c3-1cf706b733da | owner-authorized-uncorroborated | - |
| 102 | 102 | 8219283b-a796-4ffb-98a9-441df6fced1b | owner-authorized-uncorroborated | - |
| 103 | PC0004 | 7ed9d827-89c5-4741-8e2d-a1f2ca0cfced | verified-owner-crosswalk | PC0004 |
| 104 | - | - | retired-by-owner | - |
| 105 | - | - | retired-by-owner | - |
| 106 | 106 | 3329de1a-c792-4f53-837e-cc5dae0eb88 | invalid-owner-mapping | - |
| 107 | 107 | 00d6e300-3bb7-4d6a-9d7e-cfddde60a377 | owner-authorized-uncorroborated | - |
| 108 | - | - | retired-by-owner | - |
| 137 | PA0187 | c2639d89-8c04-4d01-9ff1-6b2ae060d0db | verified-owner-crosswalk | PA0187 |
| 139 | PA0189 | 4f491f7a-233f-45d0-b1a9-813e8cf36ad8 | verified-owner-crosswalk | PA0189 |
| 159 | PA0031 | 0521cdec-8f70-4ae1-846c-b11f5538aee7 | verified-owner-crosswalk | PA0031 |
| 189 | PA0057 | 5a903589-95fd-440f-92de-25056129c6b8 | verified-owner-crosswalk | PA0057 |
| 233 | PA0096 | fb1a78bd-a0f1-42a1-b329-c5db71574880 | verified-owner-crosswalk | PA0096 |
| 294 | PA0199 | 1300b289-19ae-48fa-8f46-28a92ffe6a8d | verified-owner-crosswalk | PA0199 |
| 302 | PA0202 | 630a12e3-b9f2-4e27-8311-dccf37065622 | verified-owner-crosswalk | PA0202 |
| 303 | PA0159 | a8ef4ebf-50fe-4157-89f5-817595f26873 | verified-owner-crosswalk | PA0159 |
| 304 | PA0160 | 43a28669-1a01-44eb-b98c-3081e1e10efb | verified-owner-crosswalk | PA0160 |
| 309 | - | - | retired-by-owner | - |

Unused owner keys: none.

## Recurrence master table

| Backup row | Legacy master | Legacy project | Verified modern project | Plan-only project | Status | Disposition | Rule |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 102 | 102 | - | 8219283b-a796-4ffb-98a9-441df6fced1b | owner-authorized-uncorroborated | plan-only-target-unverified | biweekly |
| 2 | 100 | 100 | d3d55965-4ccd-49a4-893b-1ae544021c77 | - | verified-owner-crosswalk | map-after-adapter-validation | weekly |
| 3 | 103 | 103 | 7ed9d827-89c5-4741-8e2d-a1f2ca0cfced | - | verified-owner-crosswalk | map-after-adapter-validation | weekly |
| 4 | 104 | 104 | - | - | retired-by-owner | exclude-do-not-import | weekly |
| 5 | 105 | 105 | - | - | retired-by-owner | exclude-do-not-import | weekly |
| 6 | - | 107 | - | 00d6e300-3bb7-4d6a-9d7e-cfddde60a377 | owner-authorized-uncorroborated | plan-only-target-unverified | - |
| 7 | 106 | 106 | - | - | invalid-owner-mapping | blocked | weekly |
| 8 | - | 108 | - | - | retired-by-owner | exclude-do-not-import | - |
| 9 | 101 | 101 | - | 1f872b31-1067-4219-b7c3-1cf706b733da | owner-authorized-uncorroborated | plan-only-target-unverified | weekly |

Rule labels remain rules, not UUIDs. Missing explicit master IDs require a
reviewed derivation from a verified project/master identity; never generate
unrelated replacement masters or collapse missing IDs.

## Advisory crosswalk candidates (owner review required)

These are exact title/type similarities only, **not verified legacy identities**.
No candidate below has been applied. Shared candidates across different legacy
keys require explicit duplicate/merge review, not an automatic many-to-one map.

| Legacy key | Type | Current external ID | Candidate UUID |
| --- | --- | --- | --- |

## Legacy JSON formats

| Key | JSON encoded | Container | Record count |
| --- | --- | --- | --- |
| hm_task_manager_tasks | true | array | 9 |
| hm_repeatable_tasks | true | array | 9 |
| hm_weekly_planner | true | object | 73 |
| hm_sheet_write_retry_queue | true | array | 0 |

## Weekly metadata, checklist and reminder shapes

Paths and types only; task descriptions, checklist text and reminder values are
not reproduced. Counts include all instances, not unique values.

| Path:type | Occurrences |
| --- | --- |
| weekly.checklist:array | 73 |
| weekly.checklist.[]:object | 7 |
| weekly.checklist.[].completed:boolean | 7 |
| weekly.checklist.[].id:string | 7 |
| weekly.checklist.[].text:string | 7 |
| weekly.metadata:object | 73 |
| weekly.metadata.generated:boolean | 33 |
| weekly.reminder:object | 73 |
| weekly.reminder.active:boolean | 73 |
| weekly.reminder.sendAt:string | 1 |

## Weekly classification (all rows)

Classification covers identity/date/mapping readiness, not full screen parity.
Legacy-only metadata can also be present on a valid-identity-and-date row.

| Row | Stable ID | Classification | Disposition | Date | Reasons | Legacy-only root fields | Metadata fields |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | adhoc-1785771502133 | valid-identity-and-date | adapter-review | 2026-08-03 |  | priority, recurrence |  |
| 2 | adhoc-1785791435012 | valid-identity-and-date | adapter-review | 2026-08-04 |  | priority, recurrence |  |
| 3 | curated-task-home-194-2026-08-14-1786655361196-81048 | legacy-only-needs-adapter-or-mapping | blocked | 2026-08-14 | curated-project-link-missing | priority, recurrence |  |
| 4 | adhoc-1785791456126 | valid-identity-and-date | adapter-review | 2026-08-05 |  | priority, recurrence |  |
| 5 | adhoc-1785791473416 | valid-identity-and-date | adapter-review | 2026-08-05 |  | priority, recurrence |  |
| 6 | adhoc-1785791510568 | valid-identity-and-date | adapter-review | 2026-08-07 |  | priority, recurrence |  |
| 7 | adhoc-1785791537219 | valid-identity-and-date | adapter-review | 2026-08-07 |  | priority, recurrence |  |
| 8 | adhoc-1785791556460 | valid-identity-and-date | adapter-review | 2026-08-08 |  | priority, recurrence |  |
| 9 | curated-100-2026-08-15-1786655703404-47796 | legacy-only-needs-adapter-or-mapping | blocked | 2026-08-15 | curated-project-link-missing | priority, recurrence |  |
| 10 | adhoc-2026-08-06-1785894864069-49055 | valid-identity-and-date | adapter-review | 2026-08-06 |  | priority, recurrence |  |
| 11 | adhoc-2026-08-11-1785894916179-78577 | valid-identity-and-date | adapter-review | 2026-08-11 |  | priority, recurrence |  |
| 12 | adhoc-2026-08-12-1785894960543-246 | valid-identity-and-date | adapter-review | 2026-08-12 |  | priority, recurrence |  |
| 13 | google-201rhbspumc6oq7njhgde3ks8k-1785982645985 | legacy-only-needs-adapter-or-mapping | blocked | 2026-08-22T17:00:00-07:00 | date:offset-timestamp-needs-policy, occurrence:offset-timestamp-needs-policy | priority, recurrence |  |
| 14 | google-201rhbspumc6oq7njhgde3ks8k-1785982655312 | legacy-only-needs-adapter-or-mapping | blocked | 2026-08-22T17:00:00-07:00 | date:offset-timestamp-needs-policy, occurrence:offset-timestamp-needs-policy | priority, recurrence |  |
| 15 | google-201rhbspumc6oq7njhgde3ks8k-1785982753854 | valid-identity-and-date | adapter-review | 2026-08-22 |  | priority, recurrence |  |
| 16 | google-4h3tj8c64ges0lll9pegalmgtd-1785984390237 | valid-identity-and-date | adapter-review | 2026-08-23 |  | priority, recurrence |  |
| 17 | google-4h3tj8c64ges0lll9pegalmgtd-1785984715353 | valid-identity-and-date | adapter-review | 2026-08-24 |  | priority, recurrence |  |
| 18 | google-4h3tj8c64ges0lll9pegalmgtd-1785984735439 | valid-identity-and-date | adapter-review | 2026-08-25 |  | priority, recurrence |  |
| 19 | google-4h3tj8c64ges0lll9pegalmgtd-1785985495556 | valid-identity-and-date | adapter-review | 2026-08-26 |  | priority, recurrence |  |
| 20 | google-6fdlbernrvq8jlg2io05j69chn-1785985538341 | valid-identity-and-date | adapter-review | 2026-08-23 |  | priority, recurrence |  |
| 21 | google-28os2u3njsk8fqtenv6vloqj46-2026-09-15-1785985719160-9194 | valid-identity-and-date | adapter-review | 2026-09-15 |  | priority, recurrence |  |
| 22 | google-28os2u3njsk8fqtenv6vloqj46-2026-09-16-1785985719160-8161 | valid-identity-and-date | adapter-review | 2026-09-16 |  | priority, recurrence |  |
| 23 | google-28os2u3njsk8fqtenv6vloqj46-2026-09-17-1785985719160-7496 | valid-identity-and-date | adapter-review | 2026-09-17 |  | priority, recurrence |  |
| 24 | google-1ikm2h65hkbbekrbs1lhulu4bd-2026-09-17-1785985754871-6794 | valid-identity-and-date | adapter-review | 2026-09-17 |  | priority, recurrence |  |
| 25 | google-1ikm2h65hkbbekrbs1lhulu4bd-2026-09-18-1785985754871-411 | valid-identity-and-date | adapter-review | 2026-09-18 |  | priority, recurrence |  |
| 26 | google-1ikm2h65hkbbekrbs1lhulu4bd-2026-09-19-1785985754871-7501 | valid-identity-and-date | adapter-review | 2026-09-19 |  | priority, recurrence |  |
| 27 | google-1ikm2h65hkbbekrbs1lhulu4bd-2026-09-20-1785985754871-914 | valid-identity-and-date | adapter-review | 2026-09-20 |  | priority, recurrence |  |
| 28 | google-1ikm2h65hkbbekrbs1lhulu4bd-2026-09-21-1785985754871-4172 | valid-identity-and-date | adapter-review | 2026-09-21 |  | priority, recurrence |  |
| 29 | google-1u7a8f0hj42u7402ksi486obpv-2026-09-05-1785986201223-3439 | valid-identity-and-date | adapter-review | 2026-09-05 |  | priority, recurrence |  |
| 30 | google-5cf20qte07j5kca54rdht1u03c-2026-09-12-1785986278615-4141 | valid-identity-and-date | adapter-review | 2026-09-12 |  | priority, recurrence |  |
| 31 | curated-309-2026-08-06-1786326926983-72161 | retired-by-owner | exclude-do-not-import | 2026-08-06 | retired-reference-do-not-import | priority, recurrence |  |
| 32 | repeatable-102-2026-08-03 | legacy-only-needs-adapter-or-mapping | blocked | 2026-08-03 | owner-authorized-target-unverified-plan-only | priority, recurrence | generated |
| 33 | repeatable-103-2026-08-14 | valid-identity-and-date | adapter-review | 2026-08-14 |  | priority, recurrence | generated |
| 34 | repeatable-103-2026-09-11 | valid-identity-and-date | adapter-review | 2026-09-11 |  | priority, recurrence | generated |
| 35 | repeatable-103-2026-10-09 | valid-identity-and-date | adapter-review | 2026-10-09 |  | priority, recurrence | generated |
| 36 | repeatable-103-2026-10-02 | valid-identity-and-date | adapter-review | 2026-10-02 |  | priority, recurrence | generated |
| 37 | adhoc-2026-08-10-1786326850151-99127 | valid-identity-and-date | adapter-review | 2026-08-10 |  | priority, recurrence |  |
| 38 | repeatable-103-2026-08-21 | valid-identity-and-date | adapter-review | 2026-08-28 |  | priority, recurrence | generated |
| 39 | repeatable-103-2026-08-28 | valid-identity-and-date | adapter-review | 2026-08-28 |  | priority, recurrence | generated |
| 40 | repeatable-103-2026-09-04 | valid-identity-and-date | adapter-review | 2026-09-04 |  | priority, recurrence | generated |
| 41 | repeatable-103-2026-08-15 | valid-identity-and-date | adapter-review | 2026-08-14 |  | priority, recurrence | generated |
| 42 | repeatable-101-2026-08-10 | legacy-only-needs-adapter-or-mapping | blocked | 2026-08-10 | owner-authorized-target-unverified-plan-only | priority, recurrence | generated |
| 43 | repeatable-100-2026-08-10 | valid-identity-and-date | adapter-review | 2026-08-10 |  | priority, recurrence | generated |
| 44 | repeatable-100-2026-08-13 | valid-identity-and-date | adapter-review | 2026-08-13 |  | priority, recurrence | generated |
| 45 | repeatable-100-2026-08-20 | valid-identity-and-date | adapter-review | 2026-08-20 |  | priority, recurrence | generated |
| 46 | repeatable-101-2026-08-17 | legacy-only-needs-adapter-or-mapping | blocked | 2026-08-17 | owner-authorized-target-unverified-plan-only | priority, recurrence | generated |
| 47 | repeatable-103-2026-08-22 | valid-identity-and-date | adapter-review | 2026-08-22 |  | priority, recurrence | generated |
| 48 | repeatable-100-2026-08-27 | valid-identity-and-date | adapter-review | 2026-08-27 |  | priority, recurrence | generated |
| 49 | repeatable-101-2026-08-24 | legacy-only-needs-adapter-or-mapping | blocked | 2026-08-24 | owner-authorized-target-unverified-plan-only | priority, recurrence | generated |
| 50 | repeatable-103-2026-08-29 | valid-identity-and-date | adapter-review | 2026-08-29 |  | priority, recurrence | generated |
| 51 | repeatable-100-2026-08-06 | valid-identity-and-date | adapter-review | 2026-08-06 |  | priority, recurrence | generated |
| 52 | repeatable-101-2026-08-03 | legacy-only-needs-adapter-or-mapping | blocked | 2026-08-03 | owner-authorized-target-unverified-plan-only | priority, recurrence | generated |
| 53 | repeatable-102-2026-08-10 | legacy-only-needs-adapter-or-mapping | blocked | 2026-08-10 | owner-authorized-target-unverified-plan-only | priority, recurrence | generated |
| 54 | repeatable-102-2026-08-24 | legacy-only-needs-adapter-or-mapping | blocked | 2026-08-24 | owner-authorized-target-unverified-plan-only | priority, recurrence | generated |
| 55 | repeatable-100-2026-09-03 | valid-identity-and-date | adapter-review | 2026-09-03 |  | priority, recurrence | generated |
| 56 | repeatable-101-2026-08-31 | legacy-only-needs-adapter-or-mapping | blocked | 2026-08-31 | owner-authorized-target-unverified-plan-only | priority, recurrence | generated |
| 57 | repeatable-103-2026-09-05 | valid-identity-and-date | adapter-review | 2026-09-05 |  | priority, recurrence | generated |
| 58 | repeatable-105-2026-08-17 | retired-by-owner | exclude-do-not-import | 2026-08-17 | retired-reference-do-not-import | priority, recurrence | generated |
| 59 | repeatable-104-2026-08-17 | retired-by-owner | exclude-do-not-import | 2026-08-17 | retired-reference-do-not-import | priority, recurrence | generated |
| 60 | repeatable-105-2026-08-18 | retired-by-owner | exclude-do-not-import | 2026-08-19 | retired-reference-do-not-import | priority, recurrence | generated |
| 61 | repeatable-104-2026-08-18 | retired-by-owner | exclude-do-not-import | 2026-08-18 | retired-reference-do-not-import | priority, recurrence | generated |
| 62 | repeatable-105-2026-08-26 | retired-by-owner | exclude-do-not-import | 2026-08-26 | retired-reference-do-not-import | priority, recurrence | generated |
| 63 | repeatable-104-2026-08-25 | retired-by-owner | exclude-do-not-import | 2026-08-25 | retired-reference-do-not-import | priority, recurrence | generated |
| 64 | repeatable-105-2026-09-02 | retired-by-owner | exclude-do-not-import | 2026-09-02 | retired-reference-do-not-import | priority, recurrence | generated |
| 65 | repeatable-104-2026-09-01 | retired-by-owner | exclude-do-not-import | 2026-09-01 | retired-reference-do-not-import | priority, recurrence | generated |
| 66 | adhoc-2026-08-14-1786655509328-20380 | valid-identity-and-date | adapter-review | 2026-08-14 |  | priority, recurrence |  |
| 67 | adhoc-2026-08-14-1786655513558-69322 | valid-identity-and-date | adapter-review | 2026-08-14 |  | priority, recurrence |  |
| 68 | adhoc-2026-08-14-1786655522161-55495 | valid-identity-and-date | adapter-review | 2026-08-14 |  | priority, recurrence |  |
| 69 | adhoc-2026-08-14-1786655527130-54968 | valid-identity-and-date | adapter-review | 2026-08-14 |  | priority, recurrence |  |
| 70 | google-4il100gli5461g9uif2vb4pkf2-2026-08-13-1786655635757-2361 | valid-identity-and-date | adapter-review | 2026-08-13 |  | priority, recurrence |  |
| 71 | adhoc-2026-08-16-1786655762176-48364 | valid-identity-and-date | adapter-review | 2026-08-16 |  | priority, recurrence |  |
| 72 | adhoc-2026-08-16-1786655775289-71816 | valid-identity-and-date | adapter-review | 2026-08-16 |  | priority, recurrence |  |
| 73 | adhoc-2026-08-16-1786655785886-2558 | valid-identity-and-date | adapter-review | 2026-08-16 |  | priority, recurrence |  |

## Required adapters and unresolved decisions

- The two rejected weekly dates are offset timestamps, not date-only keys.
  Preserve the original timestamp and offset in metadata; obtain approval for
  event-local calendar date versus configured-timezone conversion. Do not use
  an unconditional UTC truncation. Both rows refer to the same event but have
  distinct stable row IDs; review duplicate intent before any consolidation.
- Exact project IDs and recurrence master IDs remain unresolved where shown.
  Supply an authoritative crosswalk from historical numeric project IDs to
  current external IDs/UUIDs, scoped by type/source. A unique title match is only
  a review candidate, not sufficient provenance.
- Retired legacy keys must not be imported, merged, inferred from titles or
  recreated under new UUIDs. Preserve the original backup as the audit source;
  exclude dependent weekly rows and recurrence/task records from a future
  converted import, rather than importing them with empty project links.
- Safe-mode owner authorization resolves identity intent for allowlisted absent
  entries, not database existence or UUID syntax. Keep them as plan-only targets;
  do not create missing projects, widen policies or submit an invalid UUID.
  All numeric references have an owner decision; no title fallback is permitted
  when the supplied safe-mode policy disables it.
- Convert legacy task-manager, repeatable override, curated/staged queue and
  Parking keys explicitly. Modern legacy-envelope import currently handles
  weekly tasks only; preserve queue membership/order and all rule flags. Do not
  replay retry queues automatically.
- Preserve unknown weekly fields such as recurrence/priority in metadata,
  checklists, reminder review state, overrides and deletion tombstones. Parking
  must retain root recurrence identity on round-trip and handle active
  notifications before archival; these local parity gates remain unpassed.
- Curated rows missing explicit projectId must be reviewed. Embedded IDs in
  taskId/weekly ID strings are not authoritative mapping evidence and must not
  silently become new project UUIDs.
- No nested days containers were found in this backup if summary count is zero.
  The historical Dashboard code supports weekStart/days/day/bucket arrays.
  Its adapter must validate a week anchor and day/slot names, require stable IDs,
  preserve source coordinates, reject ambiguous date/ID conflicts, and test
  duplicate/tombstone behavior. Absence here does not inventory other devices.
- Deployed UI acceptance does not automatically resolve remaining Dashboard
  data-layout semantics, Calendar cross-account/deleted-event lifecycle or
  Parking metadata/notification gaps. No protected consumer can be deleted on
  this report alone.

## Cutover and retirement status

Planner, Calendar, Workbench, Dashboard, Trips and embedded Parking: **not switched**.
All 29 isolated implementations, mobile/static compatibility paths and Apps
Script backend files remain. Retirement approval is recorded, but execution
depends on the unresolved data and parity gates above.

This is a reconciliation report, not a final Modernized Build certification.
No Supabase, Calendar, Sheets or Apps Script requests or writes were made.

## Validation

Regenerate offline:

```powershell
node scripts\reconcile-legacy-backup.cjs www\localStorage_backup_2026-08-13.json supabase\projects__all_exports.csv spec\phase5-backup-reconciliation spec\phase5-project-identity-map.json
```

The companion tests exercise CSV/TSV quoting, malformed exports, UUID/type
validation, exact versus title-only matches, ambiguity, event identity,
date-shape classification, recurrence masters and complete 73-row accounting.
Run `node --test tests\legacy-reconciliation.test.cjs` or the full repository
test suite; measured results are recorded in the dependency map.
