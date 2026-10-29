# Meals Acceptance Workbook Update Protocol

## 1. Purpose and controlled artifacts

The Meals project uses these controlled artifacts:

- `Meals_Module_Product_and_Functional_Requirements_v0.3.docx`
- `Meals Acceptance Checklist v1.0.xlsx`
- `Acceptance Workbook Update Protocol.md`

The Requirements Specification defines what must be built. The Acceptance Workbook records how implementation, verification, defects, evidence, regression, and owner acceptance are tracked.

Whenever GitHub Copilot in VS Code implements, fixes, tests, deploys, or verifies Meals functionality, Copilot must read the applicable Requirement IDs and Test IDs and update the existing Acceptance Workbook as part of the task's Definition of Done.

## 2. Modify the workbook in place

Always modify the existing workbook. Do not recreate or replace it from a template.

Preserve:

- worksheet names;
- Requirement IDs and Test IDs;
- formulas and calculated summary/coverage fields;
- table definitions, formatting, freeze panes, filters, and data-validation lists;
- Test Run IDs, Defect IDs, evidence references, dates, and notes;
- prior technical results;
- all owner-entered UAT results and Phase Sign-Off decisions.

Never reset or erase prior results merely because a new implementation cycle started. Save under the same controlled filename unless the owner explicitly authorizes a new baseline version.

## 3. Requirements remain authoritative

Do not alter requirement intent, Expected Result, Requirement IDs, or test intent to make an implementation pass.

If code conflicts with an approved requirement, treat the implementation as defective unless the owner explicitly approves a requirements change. If a requirement is contradictory, incomplete, or technically blocked, record the issue and stop for a decision instead of silently rewriting the workbook.

## 4. Test Run IDs

Assign a Test Run ID to every meaningful implementation, verification, UAT-preparation, defect-fix, or retest cycle.

Use a convention such as:

- `P0-TECH-001`
- `P1-TECH-001`
- `P1-UAT-001`
- `P1-RETEST-002`
- `P2-DB-001`
- `P3-SEC-001`

Record the applicable Test Run ID on every row updated in that execution.

## 5. Status definitions

Supported statuses are:

- **Not Built**: required implementation does not yet exist.
- **Ready to Test**: implementation and applicable technical checks are complete; owner UAT remains.
- **Pass**: the specified test was actually executed and met the Expected Result.
- **Pass with Known Issue**: owner-approved, documented, non-critical exception that does not affect security, data integrity, or core functionality.
- **Fail**: the test was executed and did not meet the Expected Result.
- **Blocked**: the test cannot currently be executed because of an unresolved dependency, environment issue, or preceding defect.
- **Deferred**: explicitly outside the current accepted phase/scope.
- **N/A**: not applicable to the tested build, object, environment, or platform.

## 6. Copilot status authority

Copilot may mark a row **Pass** only when all of these are true:

1. The test is objectively technical.
2. Copilot actually executed the required validation.
3. The result met the Expected Result.
4. Required evidence was captured.

Examples include automated tests, build/lint, source inspection, database authorization checks, migration catalog verification, and secret exposure checks.

For tests requiring owner interaction, visual review, usability judgment, or product acceptance, Copilot must use **Ready to Test**, not Pass.

Copilot must never independently assign:

- **Pass with Known Issue**;
- **Accepted**;
- **Accepted with Known Issues**.

Those are owner decisions.

## 7. Implementation completion updates

For each applicable workbook row:

- keep **Not Built** if required implementation is absent;
- use **Ready to Test** when implementation and technical validation are complete but owner UAT is required;
- use **Pass** only for an objectively executed technical test;
- use **Fail** for an executed technical test that did not meet its Expected Result;
- use **Blocked** when execution is not possible;
- record Test Run ID, date, Git reference, environment, evidence, and technical notes as applicable.

Code completion alone is not a passing acceptance result.

## 8. Defect management

Use stable Defect IDs in the format:

`MEALS-DEF-###`

For each failure record:

- Test ID;
- Requirement ID;
- Defect ID;
- expected behavior;
- observed behavior;
- affected platform/environment;
- evidence reference;
- Test Run ID.

Do not modify Expected Result to accommodate a defect.

## 9. Fix and retest workflow

When fixing a failed acceptance test:

1. Read the Requirement ID, Test ID, Defect ID, expected result, and prior notes.
2. Correct the implementation without changing unrelated approved behavior.
3. Add or update automated regression coverage where appropriate.
4. Run applicable tests, build, lint, security checks, database checks, and regression scope.
5. Update technical evidence and Test Run ID.
6. If owner UAT is required, change **Fail** to **Ready to Test**, not Pass.

## 10. Evidence requirements

Use **Evidence / Build Reference** for useful proof such as:

- Git commit SHA or branch;
- automated test output/run identifier;
- build artifact or build run;
- screenshot filename;
- database catalog export;
- security verification output;
- Supabase Security Advisor review record.

Production security and database verification rows require an evidence reference before completion.

## 11. Functional acceptance

Copilot should populate objective implementation and technical fields and move UAT rows to Ready to Test. The owner executes UAT and records Pass, Fail, Pass with Known Issue, dates, defects, evidence, and notes as applicable.

Split desktop and mobile execution only where the workbook provides separate platform rows or behavior materially differs. Do not add duplicate rows without an approved requirements/test change.

## 12. Security Acceptance

Security testing must distinguish:

- logged-out/anon;
- authenticated designated owner;
- authenticated non-owner;
- service-role exposure/administrative semantics where applicable.

Where applicable, test both:

1. application behavior; and
2. direct database/API authorization.

Do not infer RLS success merely because UI controls are hidden.

Record **Execution Owner** as one of:

- COPILOT
- USER AUTHORIZATION
- MANUAL
- VERIFY

Record **Environment** as appropriate:

- Local/Test
- Source/Build Inspection
- Production Read-Only
- Production Smoke Test

Prefer Copilot for repeatable technical work. Do not require the owner to run repetitive read-only verification queries when the approved authenticated workflow can perform them.

## 13. Database Verification

For every database change record:

- Test Run ID;
- Check ID and Requirement ID;
- phase and object/area;
- migration filename;
- Git commit/branch;
- exact target project;
- Verification Stage;
- verification date;
- Deployment Blocker status;
- verification performed;
- expected catalog/security result;
- status;
- evidence/export;
- Rollback/Reversal Strategy Prepared?;
- Rollback Executed?;
- notes.

The expected production target is:

`home-maintenance-app / tawvchmjtkgykwwvnnnn`

Stop if the project does not match.

Verification Stage values are:

- **Preflight**: read-only checks before production authorization/execution.
- **Post-deployment**: read-only checks after execution.
- **Both**: required at both stages.

Unexpected ownership, privileges, RLS/policy state, target project, schema drift, or abandoned broker dependency is a deployment blocker when identified as such in the workbook/specification.

## 14. Rollback and migration failure behavior

Preparing a rollback/reversal strategy does not authorize execution.

Do not automatically retry a failed production migration. Do not automatically execute rollback. Stop, preserve evidence, update the workbook, and request a new decision/authorization.

## 15. End-to-End Tests

For each End-to-End scenario record:

- Test Run ID;
- Platform;
- Status;
- tested date;
- Defect ID;
- Evidence / Build Reference;
- Cleanup / Reset result;
- Notes.

Perform cleanup/reset instructions so repeated executions remain deterministic. If cleanup fails, record the issue.

## 16. Coverage

Every committed Phase 0–3 requirement must map to at least one verifiable coverage method:

- Functional Test
- Security Test
- Database Check
- End-to-End Scenario
- Automated Test
- Implementation Review
- Deferred Investigation

Recipe Import requirements may remain Deferred Investigation until approved.

Preserve formula-driven live status/date/defect/evidence fields. Do not manually overwrite formulas in Coverage unless updating the baseline design is explicitly authorized.

## 17. Regression testing

For later phases, execute the Regression Scope identified in Phase Sign-Off. Record the actual workflows/Test IDs rerun, not only a generic statement that regression passed.

Failures in previously accepted functionality are release blockers unless the owner explicitly applies an allowed disposition.

## 18. Phase Sign-Off

The workbook may calculate counts and readiness information but must never automatically set Final Decision.

Final Decision values are owner-controlled:

- Not Started
- In Progress
- Accepted
- Accepted with Known Issues
- Rejected
- Deferred

Copilot may populate supporting counts and technical gate results and may recommend readiness. Copilot may not enter Accepted or Accepted with Known Issues without explicit owner instruction.

## 19. Phase completion rule

Do not report a phase as complete solely because source code exists. Completion requires the applicable combination of:

- implementation;
- automated tests;
- build/lint;
- database verification;
- security acceptance;
- functional UAT;
- end-to-end testing;
- regression testing;
- owner Phase Sign-Off.

## 20. Git and repository handling

Store the workbook with the controlled Meals documentation, preferably under the repository's established documentation convention, such as `docs/meals/`.

Include the updated workbook in repository changes whenever technical status/evidence changes. Do not create alternate workbook copies for routine cycles. Git history is the recovery mechanism if the workbook is damaged.

## 21. Workbook integrity check

Before saving:

- preserve formulas, tables, validation lists, formatting, filters, freeze panes, worksheet names, and IDs;
- preserve owner-entered values and previous results;
- ensure no formulas contain errors;
- ensure the file opens in Microsoft Excel;
- make only task-relevant changes.

## 22. Required final task report

At task completion report:

1. Requirement IDs addressed.
2. Files changed.
3. Automated tests and results.
4. Build/lint results.
5. Migration and database verification performed.
6. Workbook rows updated.
7. Technical tests marked Pass.
8. Owner-UAT tests moved to Ready to Test.
9. Failed/blocked tests and Defect IDs.
10. Evidence references.
11. Regression scope executed.
12. Remaining owner actions.

Do not claim a phase is accepted unless the owner explicitly made/authorized the Phase Final Decision.
