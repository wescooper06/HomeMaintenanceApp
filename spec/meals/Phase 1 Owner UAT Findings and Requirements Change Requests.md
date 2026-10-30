# Phase 1 Owner UAT Findings and Requirements Change Requests

## Record

- UAT runs: `P1-UAT-001`, `P1-UAT-002`, `P1-UAT-003`, `P1-UAT-004`
- Reported: 2026-10-29
- Environment: live web application; owner-reported results
- Release: `69a82ebd134a6b54660d470c11c6a62bd6343a2b`
- Scope: record only the owner's reported results against the current approved Phase 1 requirements and separately track proposed product changes.
- Acceptance Workbook: [Meals Acceptance Checklist v1.0.xlsx](./Meals%20Acceptance%20Checklist%20v1.0.xlsx)
- Requirements baseline: [Meals_Module_Product_and_Functional_Requirements_v0.3.docx](./Meals_Module_Product_and_Functional_Requirements_v0.3.docx)

This record does not amend the approved Requirements Specification or any
Acceptance Workbook Expected Result. The owner-reported PASS results are not
reclassified as failures because a different future behavior was requested.
Change requests CR-1 through CR-6 are proposals for requirements review, not
authorization to implement. CR-6 is optional and non-critical. No database,
source, policy, grant, deployment, or migration changes were made for these
requests.

## Owner UAT result record

### P1-UAT-001 — Round 1

The owner reported PASS for Phase 1 UAT sections 1–15 and E2E-01, E2E-02, and
E2E-10. The controlled workbook records PASS only for the mapped rows whose
reported behavior supports the row's current Expected Result. Rows with
platform-specific or composite criteria not established by the report remain
Ready to Test. `RE-FUNC-006-T01` remains Ready to Test because its single
workbook Expected Result also contains the explicitly out-of-scope Shopping
check; the verified Phase 1 blank-line-preservation result is recorded in its
notes without accepting Shopping.

The owner expressly excluded Shopping, Plan Meal / Planner integration, and
Recipe Import from Phase 1 acceptance. `RL-FUNC-020-T01` remains unchanged and
Not Built. No Phase 1 Final Decision is made in this record.

### Workbook recording detail

The 48 Functional Acceptance rows recorded Pass under `P1-UAT-001` are:

- Navigation: `NAV-005-T01`, `NAV-006-T01`.
- Recipe Library: `RL-UI-001-T01-D`, `RL-UI-001-T01-M`,
  `RL-UI-002-T01`, `RL-UI-003-T01`, `RL-FUNC-001-T01` through
  `RL-FUNC-006-T01`, `RL-FUNC-008-T01`, `RL-FUNC-010-T01` through
  `RL-FUNC-012-T01`, `RL-FUNC-016-T01` through `RL-FUNC-019-T01`,
  `RL-STATE-001-T01`.
- Recipe Detail: `RD-UI-002-T01` through `RD-UI-004-T01`,
  `RD-FUNC-003-T01` through `RD-FUNC-005-T01`.
- Recipe Editor: `RE-UI-001-T01`, `RE-DATA-001-T01` through
  `RE-DATA-007-T01`, `RE-FUNC-001-T01` through `RE-FUNC-005-T01`,
  `RE-FUNC-007-T01`, `RE-FUNC-010-T01`, `RE-FUNC-013-T01` through
  `RE-FUNC-015-T01`.
- Cross-cutting: `RESP-002-T01`, `RESP-003-T01`, `STATE-005-T01`.

The three reported end-to-end passes are `E2E-01`, `E2E-02`, and `E2E-10`.
The existing Phase 1 Regression Acceptance summary is recorded Pass from the
owner's report; because the report did not identify individual regression
Test IDs, no additional test rows were inferred or changed. Existing
`P1-TECH-001` run IDs and evidence remain in place alongside `P1-UAT-001`.
The tested date is recorded as 2026-10-29. The Phase 1 Final Decision remains
Not Started.

The following table is the **Round 1 status snapshot** at the end of
`P1-UAT-001`; it is historical, not the current workbook status. Round 2
results and remaining Ready to Test rows are recorded under `P1-UAT-002`
below. No Round 1 per-row PASS was inferred without support for the full
Expected Result:

| Test ID | Remaining owner check |
|---|---|
| `RL-FUNC-007-T01` | Desktop: sort Name, Category, Cuisine, and Source columns both ascending and descending. |
| `RL-FUNC-009-T01-D`, `RL-FUNC-009-T01-M` | Desktop and mobile: toggle Favorite from the star without navigating to Detail, then refresh to verify persistence. |
| `RL-STATE-002-T01` | Create a non-empty library with zero search/filter matches; verify the no-match message and a way to clear criteria. |
| `RD-UI-001-T01-D`, `RD-UI-001-T01-M` | Desktop and mobile: verify Recipe Detail is one scrolling page without content tabs. |
| `RD-UI-005-T01` | Mobile: Shopping and Plan Meal actions are outside Phase 1 and are not accepted; do not use this row as Phase 1 sign-off evidence. |
| `RE-FUNC-006-T01` | Partial only: blank-line preservation was reported passed. The composite row also requires verifying blank lines do not generate Shopping items; keep Ready to Test and Shopping unaccepted. |
| `RE-FUNC-008-T01` | Verify an ingredient section can be removed. |
| `RE-FUNC-009-T01-D`, `RE-FUNC-009-T01-M` | Desktop and mobile: verify the editor provides Save and Cancel. |
| `RE-VAL-001-T01` | Verify Title is the only required field and all other listed Recipe fields may be empty. |
| `RE-FUNC-011-T01` | Verify a new Recipe starts with one section named Ingredients and that the name can be changed. |
| `RE-FUNC-012-T01` | Trigger a failed save; verify the editor and entered values remain, failure is clear, and retry is available. |
| `STATE-001-T01`, `STATE-002-T01`, `STATE-003-T01` | Verify loading, actionable data-load error, and duplicate-submission prevention states. |
| `STATE-004-T01-D`, `STATE-004-T01-M` | Desktop and mobile: distinguish true empty states from zero-match states and provide suitable recovery actions. |
| `STATE-007-T01` | Trigger a mutation failure; verify it is clear the change did not persist and content is preserved where practical for retry. |

## Requirements-change register

| ID | Request | Classification | Current requirement disposition |
|---|---|---|---|
| CR-1 | Remove blank lines from pasted ingredient-section text. | Proposed behavior change; requires owner requirements approval. | Conflicts with the approved preservation requirement. Current behavior is not a defect on this basis. |
| CR-2 | Display multiline Instructions as numbered items. | Proposed presentation enhancement; confirm detailed numbering rules. | Can likely retain the approved single multiline persisted value and number lines only in the Detail presentation. |
| CR-3 | Allow multiple Category and Cuisine selections in Recipe Library filters. | Proposed filtering enhancement; requires owner requirements approval. | Changes the existing single-value filter interaction; current filtering PASS remains valid. |
| CR-4 | Delete a classification referenced only by the Recipe currently being edited and atomically clear that Recipe's association. | Proposed behavior change; requires owner requirements and transaction/security design approval. | Conflicts with the current rule blocking deletion while any Recipe references the value. |
| CR-5 | Clearly notify the owner when deletion is blocked because other Recipes use the value. | Proposed UX clarification/enhancement; confirm whether existing inline alert satisfies the request. | The current service supplies an in-use explanation and the editor renders mutation errors as an alert; no defect is established without owner clarification. |
| CR-6 | Optionally list Recipes using a blocked Category or Cuisine. | Nice-to-have, non-critical enhancement. | Not required for Phase 1 acceptance and must not become an acceptance blocker unless later approved. |
| CR-7 | Resolve a valid Source URL to its external page title and hyperlink that title. | Non-blocking presentation enhancement; security/architecture review before implementation. | Current URL-versus-ordinary-text behavior passed; title lookup is not an approved Phase 1 requirement. |
| CR-8 | Preserve mobile Recipe Library search, Category, Cuisine, and Favorites state when opening Detail and returning. | Non-blocking navigation/state enhancement; requires an explicit persistence decision. | Current reset behavior is not a defect under the approved requirements; no state-preservation requirement is currently approved. |

## Change-request impact analysis

### CR-1 — Ingredient blank-line handling

- **Affected requirements:** `RE-FUNC-006`; related data/display context in
  `RE-DATA-006`.
- **Affected tests:** `RE-FUNC-006-T01`; E2E-01. The Shopping checklist portion
  of `RE-FUNC-006-T01` remains outside Phase 1.
- **Conflict:** Yes. The approved requirement explicitly preserves entered
  ingredient text, including blank lines. Removing blank lines would change
  that behavior. The owner-reported preservation PASS remains a PASS against
  the current approved Phase 1 behavior.
- **Requirements/workbook:** If approved, version the Requirements
  Specification and revise the applicable Expected Result and test steps.
  Keep the Shopping clause deferred or split it into a later-phase test; do
  not mark Shopping accepted.
- **Likely implementation/test surfaces:** `src/pages/Meals/RecipeCore.jsx`,
  possibly `src/services/recipeService.js` if normalization is required at the
  save boundary, and `tests/meals-recipe-interaction.test.cjs` /
  `tests/meals-recipe-service.test.cjs`.
- **Database, RLS, migration:** No schema, RLS, or authorization change is
  inherently required. No historical-data migration is needed if the approved
  change applies only to newly entered/pasted text. If existing stored
  ingredient text is also to be normalized, that is a separate data-change
  decision; do not silently rewrite existing Recipes.
- **Regression:** Paste and round-trip text with blank lines, repeated lines,
  leading/trailing whitespace, multiple sections, search, Detail display, and
  Recipe edit/save. Confirm no Shopping behavior is included in Phase 1.
- **Decision still needed:** Whether to remove blank lines at paste time, on
  save, or only from a new entry path, and whether existing persisted text is
  excluded from transformation.

### CR-2 — Numbered Instructions presentation

- **Affected requirements:** `RE-DATA-007` and `RD-UI-004`.
- **Affected tests:** `RE-DATA-007-T01`, `RD-UI-004-T01`, and E2E-01.
- **Conflict:** The persisted single multiline text model is compatible with
  numbering in presentation. The display would change from preserving the
  entered format verbatim to rendering each eligible line as a numbered item;
  clarify whether numbering is intended to replace or accompany visible
  user-entered numbering.
- **Requirements/workbook:** Revise or clarify the presentation requirement
  and its Expected Result if approved. Retain `RE-DATA-007`'s single multiline
  persistence requirement; add a separately traceable presentation
  requirement/test if the distinction warrants it.
- **Likely implementation/test surfaces:** `src/pages/Meals/RecipeCore.jsx`
  (Recipe Detail rendering) and `tests/meals-recipe-interaction.test.cjs`;
  service tests can continue to assert exact raw-text persistence.
- **Database, RLS, migration:** None required if numbering is presentation
  only. No persisted data transformation is required.
- **Regression:** Verify round-trip text remains unchanged; test LF, CRLF, and
  CR line endings, blank lines, repeated lines, leading/trailing whitespace,
  and already-numbered text. Define whether blank lines are omitted or retained
  as visual spacing and whether numbering restarts per Recipe.
- **Decision still needed:** Numbering rules for blank lines, pre-numbered
  lines, and line-ending variants.

### CR-3 — Multi-select Category/Cuisine filters

- **Affected requirements:** `RL-FUNC-004`, `RL-FUNC-005`, and
  `RL-FUNC-018`.
- **Affected tests:** `RL-FUNC-004-T01`, `RL-FUNC-005-T01`,
  `RL-FUNC-018-T01`, and E2E-02.
- **Conflict:** Yes, the existing controls select one Category and one Cuisine
  at a time. The owner-reported single-selection and combined-filter PASS
  results remain valid against current requirements.
- **Requirements/workbook:** Add/clarify multiple-value selection in the
  Requirements Specification and revise filter/test steps and Expected
  Results after approval. Keep the existing AND behavior between search,
  selected Category set, selected Cuisine set, and Favorites.
- **Likely implementation/test surfaces:** `src/pages/Meals/RecipeCore.jsx`,
  `src/services/recipeService.js` (`recipeMatches`), and
  `tests/meals-recipe-interaction.test.cjs` / `tests/meals-recipe-service.test.cjs`.
- **Database, RLS, migration:** None required; classification IDs remain
  unchanged. No persisted Recipe data needs migration.
- **Regression:** Test multiple selected values within each filter, OR behavior
  within a selected Category set and Cuisine set, AND behavior across filter
  types, clear-one/clear-all, empty and zero-result states, keyboard/touch
  interaction, and desktop/mobile presentation.
- **Decision still needed:** Confirm OR-within-filter and AND-between-filter
  semantics, and how an empty selection represents “all.”

### CR-4 — Delete a Category/Cuisine used only by the current Recipe

- **Affected requirements:** `RE-FUNC-014` and `RE-FUNC-015`; the Recipe
  classification associations in `RE-DATA-002` and `RE-DATA-003`.
- **Affected tests:** `RE-FUNC-014-T01`, `RE-FUNC-015-T01`, and E2E-10.
- **Conflict:** Yes. The current requirements prohibit deletion while *any*
  Recipe references the value. The requested eligible case still has one
  reference—the Recipe being edited—and asks the application to clear that
  association and delete the value.
- **Cases that must remain distinct:**
  - **A — current Recipe is the only reference:** after owner approval, clear
    its corresponding field and delete the classification as one atomic
    operation.
  - **B — another Recipe also references it:** keep deletion blocked and show
    the CR-5 notification.
- **Requirements/workbook:** Revise the requirements and tests to specify
  both cases and their atomicity. Update E2E-10 so it separately exercises
  eligible current-Recipe deletion and blocked other-Recipe deletion.
- **Likely implementation/test surfaces:** `src/pages/Meals/RecipeCore.jsx`,
  `src/services/recipeService.js`, and service/interaction tests. The deployed
  foundation defines `ON DELETE RESTRICT` foreign keys for both associations.
  A client-side “clear then delete” sequence is not atomic; a future design
  must use a transaction-backed operation and fail without a partial update.
- **Database, RLS, migration:** No table/column addition is inherently needed,
  but a safe atomic server-side transaction will likely require a reviewed
  database function/RPC or equivalent transaction endpoint and a new,
  separately authorized migration. Do not broadly change the foreign keys to
  `ON DELETE SET NULL`, since that would not enforce the requested
  current-Recipe-only case. Review RLS, function execution privileges, owner
  scoping, and authenticated grants; do not introduce anon access or
  `SECURITY DEFINER` without an explicit security design. This task performed
  no such change.
- **Persisted data:** No bulk backfill is required. Only the current Recipe's
  association would be cleared during a successful eligible deletion.
- **Regression:** Test current-only and shared references for Category and
  Cuisine; concurrent/reference-count changes; transaction rollback; owner
  versus non-owner and anon authorization; update timestamps; and existing
  delete/reference behavior.
- **Decision still needed:** Approve the behavior and authorize a separate
  transaction/RLS/grant design and migration review.

### CR-5 — Clear blocked-delete notification

- **Affected requirements:** `RE-FUNC-014` and `RE-FUNC-015`.
- **Affected tests:** `RE-FUNC-014-T01`, `RE-FUNC-015-T01`, and E2E-10.
- **Conflict:** The block itself matches current requirements. The requested
  message is a UX clarification, not a change to deletion eligibility.
- **Current implementation observation:** The service recognizes a foreign
  key violation and adds an in-use explanation; the editor displays mutation
  errors in an element with `role="alert"`. The owner asked for a clear
  dialog/message. Clarify whether this existing inline alert was unclear or
  whether a modal/other presentation is specifically desired before
  classifying current behavior as defective.
- **Requirements/workbook:** If a distinct presentation is required, define
  the notification and update the applicable test Expected Result after
  approval. Do not alter the current referenced-delete rule as part of CR-5.
- **Likely implementation/test surfaces:** `src/services/recipeService.js`,
  `src/pages/Meals/RecipeCore.jsx`, and
  `tests/meals-recipe-interaction.test.cjs` /
  `tests/meals-recipe-service.test.cjs`.
- **Database, RLS, migration:** No change required for a clearer presentation
  using the existing constraint error. No RLS, schema, or historical-data
  change is required.
- **Regression:** Verify the message is accessible, identifies the
  in-use reason, preserves the editor's current values/selection, and supports
  retry after references are removed; test Category and Cuisine separately.
- **Decision still needed:** Confirm whether an inline accessible alert
  satisfies the request or a modal is required.

### CR-6 — Optional list of Recipes using a classification

- **Affected requirements:** Related to `RE-FUNC-014` and `RE-FUNC-015`;
  displaying reference names would be new functionality and should receive a
  new requirement/test ID if approved.
- **Affected tests:** E2E-10 may include this as optional verification only
  after approval; do not make current E2E-10 or Phase 1 acceptance depend on
  it.
- **Conflict:** None with the current deletion rule if used only to explain a
  blocked deletion. This is explicitly nice-to-have and non-critical.
- **Requirements/workbook:** Add a traceable requirement and test only if
  promoted from optional to approved scope.
- **Likely implementation/test surfaces:** `src/services/recipeService.js`
  for a scoped read, `src/pages/Meals/RecipeCore.jsx` for presentation, and
  service/interaction tests.
- **Database, RLS, migration:** No schema or migration is inherently needed.
  Reuse authenticated, RLS-protected reads; verify Recipe names cannot expose
  another owner's data. No persisted data changes are required.
- **Regression:** Verify accurate reference lists, rename/delete races,
  empty/loading/error states, and owner/non-owner/anon isolation.
- **Decision still needed:** None for Phase 1. Do not block sign-off on CR-6.

## Round 1 sign-off guidance (superseded by Round 2 readiness below)

The reported PASS results apply to the currently approved behavior and should
remain separate from the proposed changes above. CR-1, CR-2, and CR-3 are
enhancements or requirements changes and do not automatically block acceptance
of the current Phase 1 behavior. CR-4 is a material change to the approved
referential-deletion rule and should be decided in requirements review before
it is treated as committed product scope; it does not retroactively fail the
reported current-rule UAT. CR-5 needs clarification because an accessible
in-use alert already exists. CR-6 is optional and non-blocking.

**Recommendation:** the owner may consider the supported PASS results as
evidence for the current approved Phase 1 behavior; keep the six requests in
requirements review rather than silently changing acceptance criteria. Before
making the Phase 1 Final Decision, review the remaining Ready to Test rows
above, explicitly exclude or defer the out-of-scope Shopping/Planner checks,
and decide CR-4/CR-5 as product requirements separately from current-rule UAT.
CR-6 is non-blocking. The owner retains control of the Phase 1 Final Decision;
no acceptance decision is recorded here.

## P1-UAT-002 — Round 2 results and evidence review

- **Reported:** 2026-10-29; live-web owner report.
- **Release:** `69a82ebd134a6b54660d470c11c6a62bd6343a2b`.
- **Overall result:** Owner-reported PASS; no owner-reported remaining issues or
  untested items. Workbook rows below remain Ready to Test only where the
  detailed report or the full row's Expected Result does not establish a
  complete/platform-specific result.
- **Change boundary:** No application, test, database, migration, security
  policy, deployment, or release changes were made. CR-7 and CR-8 remain
  proposals. The approved requirements and Phase 1 Final Decision were not
  changed.

### Results recorded

The Round 2 workbook update retains prior Test Run IDs, evidence, and notes;
`P1-UAT-002` is appended rather than replacing them.

| Report section | Result recorded | Test IDs |
|---|---|---|
| 1 — Ingredient multiline / blank-line behavior | Partial only; the approved blank-line-preservation behavior passed, but the composite Shopping checklist clause remains outside Phase 1. | `RE-FUNC-006-T01` remains Ready to Test. |
| 2 — Remaining Add Recipe / Editor checks | PASS. | `RE-FUNC-008-T01`, `RE-FUNC-009-T01-D`, `RE-FUNC-009-T01-M`, `RE-VAL-001-T01`, `RE-FUNC-011-T01`. |
| 3 — Save-failure behavior | PASS on executed automated evidence; no redundant owner failure injection required. | `RE-FUNC-012-T01`. |
| 4 — Loading and load-error states | Normal loading PASS; load-error evidence is assessed separately below. | `STATE-001-T01` and `RL-STATE-001-T01` recorded/retained Pass. `STATE-002-T01` remains Ready to Test. |
| 5 — Desktop sorting | PASS. | `RL-FUNC-007-T01`. |
| 6 — Desktop layout | PASS. | `RL-UI-002-T01`, `RESP-002-T01`. |
| 7 — Mobile Library presentation | PASS; CR-8 is separate. | `RL-UI-003-T01`, `RESP-003-T01`. |
| 8 — Mobile Recipe Detail presentation | PASS; CR-7 is separate. | `RD-UI-001-T01-M`. |
| 9 — Row navigation vs Favorite activation | Row navigation PASS. Favorite activation was reported PASS, but the report does not identify which platform or establish the platform-specific refresh/persistence step. | `RL-FUNC-010-T01` recorded Pass; `RL-FUNC-009-T01-D` and `RL-FUNC-009-T01-M` remain Ready to Test. |
| 10 — True empty vs zero matches | PASS for the reported Library behavior. | `RL-STATE-002-T01` recorded Pass. `STATE-004-T01-D` and `STATE-004-T01-M` remain Ready because the report does not say the empty/zero-match recovery workflow was checked at both required form factors. |
| 11 — Duplicate submission protection | PASS, confirmed by executed automation. | `STATE-003-T01`. |
| 12 — Mutation-failure preservation | Partial automated coverage; full cross-mutation UI behavior is not established. | `STATE-007-T01` remains Ready to Test. |
| 13 — Single-Recipe Detail deletion/confirmation | PASS. | `RD-FUNC-005-T01`, `STATE-005-T01`. |
| 14 — Multi-selection / management actions | PASS. | `RL-FUNC-011-T01`, `RL-FUNC-012-T01`, `RL-FUNC-019-T01`. |
| 15 — Existing Category/Cuisine selection | PASS. | `RE-FUNC-001-T01`, `RE-FUNC-003-T01`. |
| 16 — Current Source URL / ordinary text display | PASS; CR-7 is separate. | `RD-UI-002-T01`. |
| 17 — Final desktop responsive check | Interpreted as PASS: `"PASS /"` is consistent with the overall PASS and has no contradictory failure note. | `RESP-002-T01`. |
| 18 — Final mobile responsive check | PASS. | `RESP-003-T01`. |
| 19 — Cleanup | Owner reports UAT cleanup complete. Existing E2E Cleanup / Reset instructions and prior scenario results are unchanged. | Cleanup note appended to `E2E-01`, `E2E-02`, and `E2E-10`; no additional production data was changed in this task. |
| 20 — Round 2 summary | Owner-reported overall PASS; no owner-reported issues or untested items. This summary does not override the evidence gaps above or change sign-off. | Recorded in Phase 1 Summary Owner Notes; Final Decision remains Not Started. |

### Workbook integrity and final state

The workbook saved and reopened read-only in Excel. It retains all 7 worksheet
names, 892 formulas, 5 tables, and 11 data-validation rules. All 210 non-empty
Coverage location/pointer pairs resolve to an existing acceptance Test ID.
Effective row heights were pinned before save and verified after reopen.
Phase 0 evidence and the E2E-01/E2E-02/E2E-10 Pass statuses and Cleanup / Reset
instructions remain in place; Round 2 cleanup notes were appended separately.

The Functional Acceptance ledger now has 66 Pass rows and 9 Ready to Test
rows. Phase 1 Security Acceptance and End-to-End Tests have 0 Ready to Test
rows. Regression Acceptance remains Pass, the Phase 1 Final Decision remains
Not Started, and the workbook SHA-256 after verification is
`531709807a7578086bbb17d740e399a19fc56067d4a9d6bcda4d466cef1bbb5`.

### Automated evidence findings

The focused command
`node --test tests/meals-recipe-interaction.test.cjs tests/meals-recipe-service.test.cjs tests/meals-recipe-persistence.test.cjs`
completed on 2026-10-29 with **19 tests passed, 0 failed**.

- **`RE-FUNC-012-T01`: complete automated coverage.** In
  `tests/meals-recipe-interaction.test.cjs`, test
  `editor title-only validation, multiline text, failed-save retention/retry
  and synchronous duplicate-submit guard` injects a failed create, verifies
  the editor stays on the form, entered Title and ingredient text remain,
  the error says the Recipe was not saved, and a subsequent retry is allowed.
  The test also verifies no navigation occurs before retry succeeds. Record
  Pass from this executed objective evidence; a second owner failure
  injection is redundant.
- **`STATE-001-T01`: normal loading.** The same interaction test
  `library loading/error/retry, empty and filtered zero-result states`
  verifies “Loading Recipes” appears and the empty-library state does not
  appear while the initial Recipe Library data is pending. The owner also
  reported normal loading PASS. Error behavior is not inferred from this
  loading result.
- **`STATE-002-T01`: insufficient cross-page evidence; keep Ready to Test.**
  `library loading/error/retry, empty and filtered zero-result states`
  injects a Recipe Library load failure, verifies its error state, and
  invokes the supplied retry callback successfully. The test does not render
  and assert the end-user retry control or execute the error state on both
  Recipe Detail and Recipe Editor. Do not disturb production connectivity.
  If a manual confirmation is needed, use an isolated local/Test build with a
  deterministic mock that rejects one Recipe Detail load, verify an
  accessible error alert and Retry action, switch the mock back to success,
  and click Retry to load the Recipe.
- **`STATE-003-T01`: complete objective coverage.** The editor interaction
  test above issues two submits while the first save remains pending and
  confirms the service is called only once. The test passed; record Pass.
- **`STATE-004-T01-D/M`: automation covers the shared Library logic, not both
  platform rows.** The loading/empty test checks a true empty Library, a
  populated Library with no matches, and the clear-search action. It does
  not run the viewport-specific acceptance workflow on desktop and mobile.
  The owner reported the state result but did not identify either viewport
  for that workflow, so both platform rows remain Ready to Test.
- **`STATE-007-T01`: partial objective coverage; keep Ready to Test.**
  `editor title-only validation, multiline text, failed-save retention/retry
  and synchronous duplicate-submit guard` proves a failed new-Recipe save
  keeps entered values and supports retry. In
  `tests/meals-recipe-service.test.cjs`, test
  `explicit failures and zero-row mutations never become success; non-owner
  still denied through service` verifies service rejection for a failed
  update and zero-row Favorite/delete outcomes. It does not prove that the
  Favorite/Delete UI displays a truthful failure, preserves the currently
  persisted Recipe in the visible UI, and permits the corresponding retry.
  Minimum safe check: in an isolated local/Test build, use a deterministic
  mock to fail one Favorite mutation for a saved synthetic Recipe; verify an
  accessible “not confirmed” error, the original Favorite state/Recipe remain,
  then make the mock succeed and retry. Do not change production data,
  connectivity, schema, RLS, policies, or grants.

### Round 2 workbook rows still Ready to Test (historical snapshot)

These were the Phase 1 Functional Acceptance rows still Ready immediately
after the Round 2 update. Round 3 dispositions and the current remaining rows
are recorded at the end of this document. The “reason” column assigns one
specific reason per row.

| Test ID | Reason | Exact remaining owner check |
|---|---|---|
| `RL-FUNC-009-T01-D` | Owner observation still required — desktop Favorite report has no platform detail and does not establish the row's refresh/persistence step. | On desktop Recipe Library, record a Recipe's Favorite value; activate only its star; verify the row stays in the Library and the star changes; refresh and verify persistence. |
| `RL-FUNC-009-T01-M` | Owner observation still required — mobile Favorite report has no platform detail and does not establish refresh/persistence. | Repeat the same Favorite-only interaction and refresh check at a supported mobile/Capacitor width. |
| `RD-UI-001-T01-D` | Owner observation still required — the desktop layout report does not specifically confirm the Detail page is one scrolling page without tabs. | Open Recipe Detail at supported desktop width; verify it is one scrolling page and has no content tabs. |
| `RD-UI-005-T01` | Later-phase scope contamination — Shopping and Plan Meal actions are outside Phase 1. | No Phase 1 owner test. Keep these capabilities excluded/deferred; do not make current sign-off depend on them. |
| `RE-FUNC-006-T01` | Later-phase scope contamination — the full Expected Result includes the Shopping checklist clause. | Blank-line preservation passed. The unaccepted clause is: open Add to Shopping and verify blank lines do not become checklist items. Keep the composite row Ready until that later-phase requirement is in scope or the owner authorizes a traceable test split. |
| `STATE-002-T01` | Technically automated evidence is partial; remaining cross-page/UI assertion is not yet mapped to a complete test. | In a local/Test build only, reject one Recipe Detail load through a deterministic mock; verify an accessible error and Retry, switch mock to success, and retry. No production fault injection. |
| `STATE-004-T01-D` | Owner observation still required — the true-empty/zero-match result is not explicitly assigned to desktop. | On desktop, verify a genuinely empty Library shows its empty state/recovery action; with at least one Recipe, create zero matches and verify a distinct no-match state and clear action. |
| `STATE-004-T01-M` | Owner observation still required — the true-empty/zero-match result is not explicitly assigned to mobile. | Repeat both true-empty and zero-match/recovery checks at supported mobile/Capacitor width. |
| `STATE-007-T01` | Technically automated evidence is partial; failed persisted-content mutation UI behavior is not yet mapped. | In local/Test with deterministic mock only, fail a Favorite change for a synthetic saved Recipe; verify a truthful accessible failure, unchanged persisted/visible state, and a working retry after the mock succeeds. |

No Phase 1 Security Acceptance rows and no Phase 1 End-to-End rows remain
Ready to Test. The existing Phase 1 E2E-01, E2E-02, and E2E-10 results remain
Pass. Security rows still Ready in the workbook are Phase 0 rows and are not
reclassified by this Phase 1 UAT.

## CR-7 — Resolve Source URL to page title

- **Owner rationale:** current Source URL behavior passed, and the owner
  requested a more readable title with a link to the same Source URL.
- **Affected requirements/tests:** `RD-UI-002` / `RD-UI-002-T01` and
  E2E-01 for presentation. `RE-DATA-004` can remain unchanged if the original
  Source URL remains the stored value; revise its test only if the owner wants
  resolved-title persistence or additional stored metadata.
- **Likely implementation:** Recipe Detail `Source` rendering in
  `src/pages/Meals/RecipeCore.jsx`; a new narrow title-resolution service
  would be needed if external lookup is approved. No current implementation
  change was made.
- **Architecture and browser constraints:** client-side fetch of arbitrary
  external pages is unreliable because most sites do not grant CORS access,
  and the browser same-origin policy prevents reading another page's HTML.
  A client navigation to the external page does not expose its document title
  to the Meals application. If automatic resolution is required, use a
  narrowly scoped server-side resolver/edge endpoint rather than a browser
  proxy. A manual optional label is a lower-risk alternative if the owner
  accepts manual entry.
- **Security/privacy:** an endpoint fetching arbitrary URLs can become an
  SSRF/open-proxy path. It would need authenticated/rate-limited access,
  HTTP(S)-only validation, rejection of credentials and private/link-local/
  loopback destinations, DNS and every redirect revalidation, strict
  time/response-size/content-type limits, no script execution, safe HTML
  title parsing/escaping, and no secret-bearing request headers. External
  servers will see the resolver's request and may receive the exact URL
  (including query parameters); document whether URL lookup is logged or
  cached and minimize retention. Keep the existing safe-link protections
  (`target="_blank"`, `rel="noopener noreferrer"`).
- **Fallback:** if the resolver times out, is blocked by CORS/SSRF policy,
  returns no valid title, or returns an error, display the original URL as the
  clickable link. Do not make loading/failure prevent Recipe display or
  editing.
- **Database/security changes:** no database or RLS change is required for
  transient resolution. A cache or persisted page-title field would require
  a separately approved data/retention design. A server resolver needs its
  own authentication, egress, abuse, and privacy review; it must not be an
  unauthenticated general-purpose URL fetch endpoint.
- **Regression:** valid and invalid URLs, ordinary text, redirects,
  cross-origin/CORS failures, no/empty/malformed title, timeout, oversized
  response, private-address redirect, hostile title markup, fallback link
  safety, and unchanged stored Source value.
- **Classification:** Non-blocking enhancement; requirements change
  recommended after current Phase 1 acceptance. Current URL-versus-text
  acceptance remains Pass.

## CR-8 — Preserve mobile Recipe Library state

- **Owner rationale:** mobile search, Category, Cuisine, and Favorites reset
  after opening Recipe Detail and returning to the Library.
- **Affected requirements/tests:** clarify/create state-preservation
  criteria associated with `RL-FUNC-002`, `RL-FUNC-003`, `RL-FUNC-004`,
  `RL-FUNC-005`, `RL-FUNC-006`, `RL-FUNC-018`, and `RL-STATE-002`.
  Update the corresponding tests and E2E-02. The current requirements do not
  require search/filter state to persist across navigation.
- **Routing/state observation:** `RecipeLibrary` owns its filter `useState`;
  navigating to `/meals/recipes/:id` unmounts it and returning mounts it
  again. Routes are declared in `src/pages/Meals/MealsPage.jsx`. This explains
  the reset and is not, by itself, a defect against the approved baseline.
- **Options:** URL query parameters naturally support Back/Forward, refresh,
  and deep links; they expose search text in browser history, bookmarks, and
  copied URLs, which may be undesirable for private search terms. Router
  `location.state` can carry filters through a Detail/back interaction but is
  not a durable refresh/deep-link contract. Shared React state above the
  routes survives route changes but not reloads unless separately persisted.
  `sessionStorage` can survive reload within a tab but introduces stale-state,
  tab-isolation, and cleanup rules. A keep-alive Library subtree is possible
  but adds lifecycle/data-freshness complexity.
- **Recommendation/decision:** prefer URL query parameters for non-sensitive
  filters if refresh/share/deep-link persistence is required; otherwise use
  route-level shared state for in-app Back behavior and document that refresh
  resets state. Decide whether search text may appear in URLs and whether
  refresh must preserve values before implementation. Preserve desktop and
  mobile behavior consistently unless the owner explicitly limits the change
  to mobile.
- **Back-button behavior:** browser/OS Back should return to the same Library
  location and values; forward should restore the subsequent Detail route.
  The in-page “Back to Recipes” link must follow the same state-restoration
  contract rather than creating duplicate or stale history entries.
- **Database/security changes:** no schema, migration, RLS, or grants are
  required for URL, route, shared React, or session state. Avoid persisting
  private search/filter state in a server-side database.
- **Regression:** search, Category, Cuisine, Favorites, combined AND filters,
  clear-all, zero results, browser and OS Back/Forward, in-page Back link,
  direct Detail entry, refresh on Library and Detail, stale/deleted Recipe,
  desktop/mobile parity, and owner-authenticated routing.
- **Classification:** Non-blocking enhancement; requirements change
  recommended after current Phase 1 acceptance. The reported reset is not a
  current-requirement defect.

## Round 2 sign-off readiness (superseded by Round 3)

The owner-reported overall PASS is recorded without assigning the owner’s
Phase 1 Final Decision. Round 2 closes the supported desktop/mobile
presentation, sorting, editor, source, deletion, and management-action
observations; CR-1 through CR-8 do not retroactively fail current approved
behavior.

**Recommendation:** Phase 1 is **not ready for an unqualified Final Decision**
until the remaining current-scope platform-specific checks and the two
state-failure evidence gaps listed above are dispositioned. The Shopping-only
clauses in `RE-FUNC-006-T01` and `RD-UI-005-T01` are later-phase scope and
should not block Phase 1; keep them explicitly deferred or split only through
approved traceability changes. Once the owner completes or explicitly
dispositions the remaining current-scope rows, Phase 1 may be presented for
the owner's Final Decision. Do not set Accepted in this record.

| Change request | Classification |
|---|---|
| CR-1 | Requirements change recommended after current Phase 1 acceptance |
| CR-2 | Non-blocking enhancement |
| CR-3 | Requirements change recommended after current Phase 1 acceptance |
| CR-4 | Requirements change recommended after current Phase 1 acceptance |
| CR-5 | Non-blocking enhancement |
| CR-6 | Optional / nice-to-have |
| CR-7 | Non-blocking enhancement |
| CR-8 | Non-blocking enhancement |

None of these requests is a current Phase 1 acceptance blocker. The owner
alone sets the Phase 1 Final Decision.

## P1-UAT-003 — Round 3 and final technical acceptance evidence

- **Reported:** 2026-10-29; owner-reported live-web UAT.
- **Overall result:** Partial. No owner-observed issues; only desktop and
  mobile true-empty visual presentation remained untested.
- **Workbook evidence:** `P1-UAT-003` was appended to prior runs. Desktop and
  mobile Favorite persistence and desktop Detail layout were reported Pass.
  Desktop and mobile empty-versus-zero-match rows were reported Partial:
  zero-match behavior passed on both viewports; true-empty visual presentation
  was not tested. No observation is inferred for the untested viewport state.
- **Mixed-scope owner decisions:** The owner approved deferring
  `RD-UI-005-T01` Shopping/Plan Meal clauses from Phase 1 and approved
  splitting/correcting `RE-FUNC-006-T01` through controlled test-design
  change. The Phase 1 multiline/blank-line behavior is accepted by the owner;
  its Shopping checklist clause remains Phase 2. Because the current
  workbook row is composite and its Test ID/Expected Result were not
  authorized for direct redesign in this update, the row is recorded Deferred
  with the approved split and Phase 2 traceability documented. Neither
  Shopping nor Plan Meal is marked Pass.

### Executed deterministic UI tests

The focused command
`node --test tests/meals-recipe-interaction.test.cjs tests/meals-recipe-service.test.cjs tests/meals-recipe-persistence.test.cjs`
completed on 2026-10-29 with **21 tests passed, 0 failed**.

- **`STATE-002-T01`: Pass.** The updated interaction test deterministically
  rejects required data loads for Recipe Library, Recipe Detail, and Recipe
  Editor. For each page it checks the rendered error component produces
  `role="alert"` and a Retry button, changes the mock to success, activates
  Retry, and verifies the recovered page content. No production connectivity
  was disturbed.
- **`STATE-007-T01`: Pass.** A persisted synthetic Recipe is loaded with
  Favorite off. The first Favorite mutation rejects; the test verifies no
  navigation, the unchanged `aria-pressed` state, and an accessible
  “not confirmed” error with retry guidance. A second Favorite action
  succeeds and changes the visible state only after the mock returns the
  persisted update. This is representative mutation UI evidence; the current
  Expected Result does not require separate UI failure cases for every
  mutation type.
- **True-empty logic:** The Library interaction test verifies the empty
  Library message includes an Add Recipe recovery link and differs from the
  populated zero-match message. It also verifies clearing criteria restores
  the Recipe. This establishes the shared true-empty/zero-match behavior
  objectively, but it does not establish viewport-specific visual layout.

### Phase 1 Functional rows after Round 3 (historical snapshot)

Only these Phase 1 Functional Acceptance rows remain Ready to Test:

| Test ID | Remaining evidence |
|---|---|
| `STATE-004-T01-D` | Owner confirmed desktop zero-match state and recovery. The automated test proves shared true-empty content/recovery and distinguishes it from zero-match content. Owner has not visually inspected the true-empty state at desktop width. |
| `STATE-004-T01-M` | Owner confirmed mobile zero-match state and recovery. The automated test proves shared true-empty content/recovery and distinguishes it from zero-match content. Owner has not visually inspected the true-empty state at mobile width. |

Security Acceptance and End-to-End Tests have no Phase 1 rows Ready to Test.
`RD-UI-005-T01` and `RE-FUNC-006-T01` are Deferred for Phase 1 as described
above. CR-1 through CR-8 remain non-blocking for acceptance of the current
approved Phase 1 baseline; CR-6 remains optional. No request was implemented,
and the Phase 1 Final Decision remains Not Started and owner-controlled.

**Minimum owner follow-up:** At desktop width, visually verify the true-empty
Recipe Library message and Add Recipe recovery action. Repeat at supported
mobile/Capacitor width. Do not delete production Recipes to create an empty
library. No other owner retest is required by the current evidence.

### Round 3 workbook integrity and validation

The controlled workbook was saved and reopened read-only in Microsoft Excel.
All 7 worksheet names, 892 formulas, 5 tables, and 11 data-validation rules
remain intact; all Coverage pointers resolve, effective row heights were
preserved, and package-level comparison found no changes outside the authorized
owner-evidence, technical-evidence, disposition, and Summary-note cells.
Phase 0A remains Accepted, prior Phase 0B database evidence and
P1-UAT-001/P1-UAT-002 records remain unchanged, and E2E-01/02/10 remain Pass.
The owner-reported Round 3 cleanup completion is recorded in the Notes for all
three E2E rows; their statuses, tested dates, and Cleanup / Reset instructions
are unchanged.
Regression Acceptance remains Pass. The Phase 1 Final Decision remains Not
Started. Final workbook SHA-256:
`f348cf10e2243eb60c8dac839171b361f31bcccc234bb1f00b40411b4f849756`.

Validation completed:

- Focused Recipe command: **21 passed, 0 failed**.
- Full configured `npm test`: **338 passed, 0 failed, 1 skipped**. The skip
  requires `WORKBENCH_TEST_PG_BIN` to point to a local PostgreSQL bin directory.
- `npm run lint`: passed.
- `npm run build`: passed; Vite reported existing large-chunk size warnings.
- `git diff --check`: passed.

After Round 3, only `STATE-004-T01-D` and `STATE-004-T01-M` remain Ready to
Test. Both have owner-confirmed zero-match behavior and automated true-empty
logic/recovery evidence; only owner visual confirmation of the true-empty
state at desktop and mobile widths remains.

## P1-UAT-004 - Round 4

PHASE 1 OWNER UAT ROUND 4
Run ID: `P1-UAT-004`

Reported: 2026-10-29. This is a recording of the owner's results, not a new
UAT execution. The Round 3 snapshot above remains historical evidence.

### 1. Desktop true-empty Recipe Library: PASS

Test ID: `STATE-004-T01-D`

Owner verified:

- the Recipe Library was genuinely empty;
- the desktop true-empty state was clearly presented;
- Add Recipe was available;
- the true-empty state was distinct from the previously tested zero-match
  state;
- desktop presentation remained usable.

Combined with the preserved desktop zero-match/recovery result from Round 3
and previously executed technical true-empty message, Add Recipe recovery,
empty-versus-zero-match distinction, and clear-filter recovery evidence, the
complete unchanged Expected Result is proven. `STATE-004-T01-D` is **Pass**.

### 2. Mobile true-empty Recipe Library: PASS

Test ID: `STATE-004-T01-M`

Owner verified:

- the Recipe Library was genuinely empty;
- the mobile true-empty state was clearly presented;
- Add Recipe was visible and touch-usable;
- the true-empty state was distinct from the previously tested mobile
  zero-match state;
- mobile presentation remained usable.

Combined with the preserved mobile zero-match/recovery result from Round 3
and previously executed technical true-empty message, Add Recipe recovery,
empty-versus-zero-match distinction, and clear-filter recovery evidence, the
complete unchanged Expected Result is proven. `STATE-004-T01-M` is **Pass**.

### 3. Round 4 summary

- Overall owner result: PASS
- Remaining owner-observed issues: None
- Cleanup completed: YES

One Round 4 summary/evidence event is recorded here and in the workbook's
existing Phase 1 Summary Owner Notes cell. Both updated test rows append the
applicable Run ID and evidence to their prior content; no prior evidence is
replaced. The workbook contains exactly one Round 4 summary, not one literal
occurrence of its Run ID.

### Controlled workbook changes and integrity

Before modification, workbook SHA-256 was:
`F348CF10E2243EB60C8DAC839171B361F31BCCCC234BB1F00B40411B4F849756`.

The exact authorized literal-cell changes were:

- Functional Acceptance: `A170`, `L170`, `O170`, `P170`, `A171`, `L171`,
  `O171`, `P171` (append Run ID, set Pass, append evidence and notes).
- Summary: `Q24` (append the single Round 4 summary).

Both existing tested dates were already 2026-10-29 and remain unchanged.
No Expected Result, Test ID, Requirement ID, or Coverage formula was changed.

After saving, the workbook was reopened read-only in Microsoft Excel and
recalculated. Package comparison and Excel verification confirmed:

- All seven worksheet names, 892 formulas, five tables, and 11 validation
  rules remain intact.
- All 210 ledger Coverage pointers resolve uniquely; zero unresolved pointers.
  Coverage mappings and formulas remain unchanged.
- Effective row layout and reopened Excel row heights are preserved.
  Row-height metadata changes: zero. Formula-cache changes: seven.
- All cells outside the nine authorized literal cells are preserved, excluding
  recalculated formula caches. Cell styles, table definitions, validations,
  filters, freeze panes, and other checked worksheet metadata are unchanged.
- Prior evidence from `P1-UAT-001` through `P1-UAT-003` and `P1-TECH-002`
  remains intact. `STATE-002-T01`, `STATE-007-T01`, and E2E-01/02/10 remain
  Pass; their rows were not edited.
- `RD-UI-005-T01` and `RE-FUNC-006-T01` remain Deferred. CR-1 through CR-8
  are unchanged and non-blocking; CR-6 remains optional.
- Exactly one Round 4 summary exists in the workbook, and each updated
  test row's Test Run ID field contains one appended reference to this run.
- Phase 1 Final Decision (`Summary!O24`) remains **Not Started**.
  Accepted Date and other sign-off fields were not modified.

Final workbook SHA-256:
`ACE3756836490031A521534AF75102F93F0A0CB2C90745048262A0979096727B`.

### Current Phase 1 disposition and remaining owner action

| Disposition | Rows |
|---|---|
| Pass | 66 Functional Acceptance rows and E2E-01, E2E-02, E2E-10 |
| Ready to Test | None |
| Deferred | `RD-UI-005-T01`, `RE-FUNC-006-T01` |
| Fail or Blocked | None |
| Not Built, outside current acceptance | `RL-FUNC-020-T01` (Recipe Import) |

No Phase 1 Security Acceptance or Database Verification rows are classified
as Phase 1 in the existing ledgers; prior Phase 0 security/database evidence
is unchanged. Recipe Import, Shopping, and Plan Meal / Planner integration
are not accepted by this record.

**Recommended Phase 1 Final Decision:** Accepted for the approved Phase 1
Recipe Core scope, retaining the documented later-phase exclusions and
deferrals. This is a recommendation only, not a sign-off.

**Remaining owner action:** Review the preserved supporting evidence and
existing sign-off gate fields, then explicitly make/authorize the Phase 1
Final Decision and acceptance date. The existing Technical Validation,
Functional Acceptance, and Security Acceptance summary gate fields remain
Not Started; Regression Acceptance remains Pass. No further owner UAT is
requested for the current approved Phase 1 scope.

This record-only task performed no new application tests, build/lint,
regression execution, migration, database modification, deployment, commit,
or push. The checks above validate workbook recording and integrity only.

## Phase 1 Final Decision - owner manual sign-off

- **Phase 1 Final Decision:** Accepted.
- **Owner authorization date / acceptance date:** 2026-10-29.
- **Accepted scope:** Current approved Phase 1 Recipe Core.
- **Authority:** Owner manually saved, closed, reopened, and verified the
  controlled workbook in Microsoft Excel. Read-only inspection confirms
  `Summary!O24` is Accepted, `P24` represents 2026-10-29, and `Q24` preserves
  prior evidence with normal Excel line-ending normalization and exactly one
  appended owner Final Decision note. Earlier recommendations and Not Started
  statements above are historical snapshots, superseded by this manual decision.
- **Exclusions:** Shopping and Plan Meal / Planner functionality are not
  accepted. Recipe Import is not accepted and remains future investigation/scope.
  `RD-UI-005-T01` and `RE-FUNC-006-T01` remain Deferred. The latter's Phase 1
  multiline ingredient-entry and blank-line-preservation evidence remains
  accepted; its Phase 2 Shopping checklist clause is not accepted.
- **Future work:** CR-1 through CR-8 retain their existing classifications;
  none is implemented or reclassified as a defect against the accepted baseline.
  CR-6 remains optional / nice-to-have.
- **Verified workbook SHA-256:**
  `A5033EFC216EDAE9F640B6E8D1B2AEBB5DA1B82D545C8562717620F131E4915B`.

Read-only package and normal Excel-open verification confirmed seven visible
worksheets, 892 formulas, five tables, 11 validation rules, 210 resolved Coverage
pointers, zero unresolved pointers, and no cached or recalculated formula
errors. Excel was closed without saving; the workbook hash was unchanged.
The owner's Summary column-width adjustments are retained; row heights remain
unchanged. Full wrapped evidence remains available in the cell/formula bar.
No workbook content or formatting was changed by this verification task.

All prior ledger evidence and Coverage mappings remain logically intact.
`P1-UAT-001` through `P1-UAT-004`, `P1-TECH-002`, all four specified STATE
passes, E2E-01/02/10 Pass, Phase 0A Accepted, and the 15 Phase 0B database Pass
records are preserved. Phase 1 has 66 Functional Pass rows, two approved
Deferred rows, and no Ready-to-Test, Fail, or Blocked Functional rows.
`RL-FUNC-020-T01` remains Not Built for later Planner-linked deletion behavior;
it is not a Recipe Import test. Actual Import Coverage remains Deferred
Investigation / Deferred.

**Evidence reconciliation caveat:** No Security or Database ledger rows are
tagged Phase 1, but phase tagging alone does not establish that all inherited
Recipe security gates are complete. Nine Phase 0-tagged Security rows retain
P1-TECH-001 notes explicitly awaiting Recipe live owner/API authorization
checks: `ARCH-002-T01`, `ARCH-004-T01`, `ARCH-005-T01`, `ARCH-012-T01`,
`ARCH-013-T01`, `SEC-TST-001-T01`, `SEC-TST-002-T01`, `SEC-TST-004-T01`,
and `SEC-TST-005-T01`. All remain Ready to Test. This record neither marks them
Pass nor infers a security exception from the manual acceptance.
The Phase 1 Technical Validation, Functional Acceptance, and Security Acceptance
summary fields remain Not Started; Regression Acceptance remains Pass.
Owner evidence reconciliation is still needed for those inherited security
checks and supporting summary fields. No production verification was rerun.

The six remaining Not Built database checks concern later or conditional
objects: `DBV-ARCH-010`, `DBV-ARCH-014`, `DBV-DB-SEC-005`,
`DBV-DB-SEC-008`, `DBV-DB-SEC-009`, and `DBV-DB-SEC-010`.
No unresolved current Recipe database gate was identified from their stated
conditions and the preserved Phase 0B evidence.

New proportional validation: `node --test tests/meals-recipe-interaction.test.cjs`
passed **7 tests, 0 failed**; `git diff --check` passed. The existing interaction
test diff still matches the previously recorded P1-TECH-002 coverage, and no
application source changes are present in tracked Git status. Previously
recorded comprehensive results remain applicable: focused Recipe suite
21 passed; full suite 338 passed, 0 failed, 1 PostgreSQL-environment skip;
lint passed; build passed with existing chunk-size warnings. These comprehensive
commands were not rerun. No new build or deployment is required solely for
this evidence/test commit.

Only this register was edited by this task. No application, test, database,
migration, RLS, policy, grant, or deployment changes were made. No files were
staged, committed, or pushed.

## Recipe Core R1 - Wave 1 - CR-5 technical implementation

- **Technical run:** `RC-R1-TECH-001`, 2026-10-29.
- **Baseline:** `604ab63903e9a24d77998e4975244e05360e144c`, branch `dev`.
- **Scope:** CR-5 only. Owner UAT remains pending under `RC-R1-UAT-001`;
  CR-5 is not recorded complete or accepted.
- **Confirmed defect:** Classification-local error state was set after a
  refused deletion, but `!confirm` resolved against the browser's global
  confirmation function and suppressed the inline error component. A
  pre-edit runtime reproduction showed zero rendered errors with that global
  function present, versus one with a false comparison control.
- **Implemented behavior:** Render the existing inline `role="alert"` beside
  the affected classification controls. Preserve the service's structured
  database error code; only a delete refusal with code `23503` receives:
  - Category: "Cannot delete this Category because it is used by a Recipe.
    Reassign Recipes using it, then try again."
  - Cuisine: "Cannot delete this Cuisine because it is used by a Recipe.
    Reassign Recipes using it, then try again."
- **Preservation/fallback:** Failed deletion does not change the classification
  list, selected value, or unsaved Recipe fields. Retry remains available.
  Messages persist until another classification action or a selection/name
  context change clears or replaces them. Network, authorization, unknown,
  and non-delete failures retain the general failure explanation instead of
  being inferred from arbitrary message text. No modal or browser alert is
  used for refusal.
- **Deletion rules unchanged:** Any persisted Recipe reference, including the
  current Recipe, still prevents deletion. No automatic association clearing,
  reference list, transaction, RPC, or CR-4 behavior was added.
- **Focused validation:** `node --test tests/meals-recipe-interaction.test.cjs
  tests/meals-recipe-service.test.cjs` passed 22 tests (15 interaction,
  7 service), 0 failed, 0 skipped. Coverage includes both exact messages,
  browser globals, alert semantics, preserved editor/list/selection state,
  retry, stale-message clearing, non-reference error distinctions, and
  unchanged unused-classification deletion. Existing migration-backed service
  tests still reject referenced deletion for both classification types.
- **Broader validation:** `npm test` passed 347 tests, 0 failed, 1 skipped
  (optional real PostgreSQL environment requires `WORKBENCH_TEST_PG_BIN`);
  `npm run lint` passed. Both production Vite configurations built successfully
  with `build.write=false` (main: 17 output files; Activity Planner: 3).
  Publishing was intentionally not run, so tracked generated web assets were
  not overwritten. `git diff --check` passed.
- **Isolated browser verification:** Existing synthetic-auth, in-memory
  transport fixture only; no production requests. Category and Cuisine
  refusal passed at 1280px desktop and 375px mobile widths, with exact text,
  unchanged draft/selection, no horizontal alert overflow, and 44px enabled
  retry controls. Context changes and later successful rename cleared stale
  messages. This is technical verification, not owner UAT.
- **Acceptance governance:** Controlled workbook and Word requirements were
  not changed. Historical Phase 1 results, Accepted Final Decision, Deferred
  rows, scope exclusions, and CR-1 through CR-8 history remain intact.
  Refinement requirement/test IDs and workbook rows require separate approval.
  Historical Security Acceptance reconciliation remains separate.
- **Production/database/security/deployment:** None. No migration, RLS,
  policy, grant, or Auth configuration changes. No staging, commit, or push.

## Recipe Core R1 - Wave 1 - CR-5 owner UAT result

- **Run ID:** `RC-R1-UAT-001`.
- **Owner results recorded:** 2026-10-30.
- **Source commit:** `5a9d0f694552c8dc2341973849d65bd94a9d4c25`.
- **Pages release commit:** `1aa7a6a86a0f652d6da109dd352aa7fc83cfb42f`.

1. Desktop Category referenced-delete refusal: PASS
2. Desktop Cuisine referenced-delete refusal: PASS
3. Mobile Category referenced-delete refusal: PASS
4. Mobile Cuisine referenced-delete refusal: PASS
5. Retry and stale-message behavior: PASS
6. Unknown/network error distinction:
   TECHNICAL EVIDENCE SUFFICIENT under RC-R1-TECH-001

Overall owner result: PASS

Remaining owner-observed issues: None

Cleanup completed: YES

**Final CR-5 disposition: Accepted and complete.**

This owner result supersedes the pending-UAT disposition in the preceding
technical record without replacing or duplicating that record. Historical
Phase 1 acceptance and scope exclusions remain unchanged. No Acceptance
Workbook, application, test, database, migration, or release file was changed
to record this result. No deployment, staging, commit, or push was performed.

## Recipe Core R1 - Wave 2 - CR-2 numbered Instructions

- **Technical run:** `RC-R1-TECH-002`, 2026-10-30.
- **Scope:** Owner-approved CR-2 implementation only; related requirements
  `RD-UI-004` and `RE-DATA-007`. Owner UAT remains pending under
  `RC-R1-UAT-002`; this is not an owner acceptance result.
- **Behavior:** Recipe Detail renders one semantic ordered-list item per
  nonblank logical Instructions line, recognizing LF, CRLF, and CR.
  Blank/whitespace-only lines do not generate steps. Nonblank lines retain
  whitespace, duplicate content, numeric prefixes, and other text verbatim.
  Already-numbered text is not inferred or stripped, so duplicate displayed
  numbering is intentional. Empty Instructions retain the heading and show
  "No instructions provided." Edit retains the multiline textarea; display
  parsing does not modify persisted raw text.
- **Implementation:** Small local `instructionLines` helper, Detail list
  rendering, and minimal list indentation/spacing. Existing preserved-text
  styling provides whitespace preservation and long-content wrapping.
- **Validation:** Focused interaction/service tests passed 25, failed 0,
  skipped 0 (18 interaction, 7 service). New tests cover mixed line endings,
  empty/single/repeated lines, whitespace, existing numbering/numeric content,
  literal markup, semantic lists, and unchanged raw Instructions through an
  unrelated Recipe edit/save. Existing CR-5 regression coverage still passes.
  Full configured suite: 350 passed, 0 failed, 1 optional PostgreSQL-environment
  skip (`WORKBENCH_TEST_PG_BIN`). Lint passed. Main production Vite configuration
  compiled to 17 in-memory outputs without publishing generated assets.
  `git diff --check` passed.
- **Isolated browser verification:** Synthetic local fixture only; desktop
  1280px and mobile 375px views showed decimal list numbering, preserved text,
  readable wrapping without horizontal list overflow, and literal markup
  rather than rendered HTML. Empty/single-line states and raw Edit/unrelated
  Save round-trip passed. This is technical verification, not owner UAT.
- **Short owner checks:** (1) normal multiline/single-line Instructions;
  (2) blank-line handling; (3) existing numbered/numeric content, including
  expected duplicate numbering; (4) mobile presentation and Edit round-trip.
  Suggested response: `1 PASS`, `2 PASS`, `3 PASS`, `4 PASS`, `Overall PASS`,
  with notes for any failure. A live release requires separate authorization.
- **Preserved boundaries:** CR-5 Accepted and complete closure above remains
  intact. Historical Phase 1 acceptance and scope exclusions are unchanged.
  No workbook, requirements Word document, database, migration, RLS, policy,
  grant, Auth configuration, or generated release asset changed. Other CRs
  were not implemented. No staging, commit, push, or deployment performed.

## Recipe Core R1 - Wave 2 - CR-2 failed owner UAT

- **Owner result recorded:** 2026-10-30, following technical run
  `RC-R1-TECH-002` and Pages release
  `67eea0dd01a432113abba90bd98362496ec024d1`.
- **Overall owner result: FAIL. CR-2 is not accepted.**
1. Normal multiline Instructions: FAIL.
   Owner observation: "Pasting Instructions from a website did not display
   numbered Instructions." "Manually entering Instructions also did not
   display numbering."
2. Blank-line handling: NOT TESTED.
3. Existing numbered/numeric text: NOT TESTED.
4. Mobile display + Edit round-trip: NOT TESTED.
- **Disposition:** Corrective implementation required after diagnosis of the
  actual failing owner path, followed by technical validation and owner retest.
  The earlier technical evidence does not establish owner acceptance.
  Historical Phase 1 acceptance and CR-5 acceptance remain unchanged.

### CR-2 failure diagnosis and refresh confirmation

- The owner supplied a screenshot of Recipe Detail without visible numbering.
  After a diagnostic hard refresh, the owner reported:
  "Numbering appears after Ctrl+Shift+R".
- The served entry, main JavaScript/CSS, and Meals JavaScript/CSS match release
  `67eea0dd01a432113abba90bd98362496ec024d1` byte-for-byte. The evidence
  identifies stale browser-page state, resolved by refresh without a data or
  deployment change; the exact prior browser cache mechanism was not captured.
  No evidenced parsing, persistence, routing, or list-style defect warrants a
  speculative application change.
- A full production-build fixture with isolated synthetic transport exercised
  manual multiline entry and Edit/Save/Detail, multiline text insertion,
  blank-line filtering, preserved numeric prefixes, and raw Edit round-trip.
  Desktop and narrow-mobile screenshots visibly showed sequential 1-3 markers.
  Automated full-page screenshot comparisons with markers enabled versus
  suppressed detected painted marker differences at both widths, beyond DOM
  or computed-style assertions. Computed styling was decimal/outside,
  list-item display, 32px indentation, visible overflow, and no horizontal
  document overflow. Browser-tool scaling yielded actual CSS viewports of
  1014px and 297px for requested 1280px and 375px sizes.
- Revalidation: focused tests 25 passed, 0 failed; full suite 350 passed,
  0 failed, 1 optional environment-dependent skip; lint passed. The full
  suite's production-build/static-host test and the browser fixture compiled
  the main application in memory. No generated release assets were changed.
- No application/CSS/test change or replacement deployment was needed to
  resolve the reported symptom. The historical FAIL remains recorded; refresh
  confirmation is diagnostic evidence, not acceptance. CR-2 remains pending
  the same four owner retest checks. No production Recipe data, workbook,
  database, migration, RLS, policy, grant, or Auth configuration was changed.

## Recipe Core R1 - CR-2 owner retest acceptance

CR-2 OWNER RETEST

1. Normal multiline Instructions: PASS
2. Blank-line handling: PASS
3. Existing numbered/numeric text: PASS
4. Mobile display + Edit round-trip: PASS

Overall: PASS

Notes:

Initial owner UAT reported missing numbering on a previously open browser page.
After Ctrl+Shift+R, numbering appeared without any application or deployment
change. The deployed assets matched the authorized CR-2 release. Retest then
passed all four owner checks.

**Final CR-2 disposition: Accepted and complete.**

Recorded 2026-10-30. The original failed observation and refresh diagnosis above
remain historical evidence. Phase 1 acceptance and the Acceptance Workbook are
unchanged. This closure accompanies the next CR-3/CR-8 source/evidence commit,
not a separate documentation-only commit.

## Recipe Core R1 - CR-3 + CR-8 multi-select Library criteria

- **Technical validation:** 2026-10-30. Owner UAT pending; neither CR-3 nor
  CR-8 is accepted by this technical record.
- **Scope:** Category/Cuisine checkbox disclosures follow the existing
  Workbench interaction pattern, with selected names/counts in each summary,
  native keyboard behavior, and 44px touch targets. Empty selections are
  unrestricted. Values within each classification use OR; Category, Cuisine,
  unchanged literal title/ingredient search, and Favorites combine with AND.
  Clear search and filters resets every criterion. No Unassigned option or
  Recipe data-model change was added.
- **State:** One criteria object owned by the mounted Meals parent. In-app
  Back to Recipes, browser Back, Detail/Edit Save or Cancel, and Meals
  sub-page navigation preserve criteria. Refresh, a fresh/direct-detail
  entry, logout, and parent unmount start at defaults. No localStorage,
  sessionStorage, query parameters, or other criteria store was introduced.
  Library remount reloads current Recipes/lookups; bulk selections, dialogs,
  mutations, and errors are not retained. Successful lookup loads prune
  unavailable selected IDs without modifying Recipe data.
- **Focused validation:** Recipe interaction, service, and Meals routing
  tests: 35 passed, 0 failed. Coverage includes OR/AND behavior, independent
  deselection, clear-all, true-empty versus zero-match recovery, fresh-parent
  defaults, missing lookup reconciliation, fresh data, and transient reset.
  Existing CR-2 numbered Instructions/raw Edit preservation and CR-5
  reference-refusal/retry/fallback tests remain passing.
- **Broader validation:** Full configured suite 354 passed, 0 failed,
  1 optional environment-dependent PostgreSQL skip. Lint passed.
  Production main-app build/static deep-link tests passed in memory.
  Diff whitespace check passed.
- **Full-app isolated browser checks:** At actual 1280px desktop and 375px
  mobile widths, keyboard-operated disclosures/checkboxes, combined filters,
  independent deselection, zero-match/clear-all, in-app Back, browser Back,
  Edit Save/Cancel, Meals sub-pages, refresh, direct static deep links, and
  logout/reset passed. Mobile labels/summaries meet 44px targets with no
  horizontal document overflow. A changed Recipe reloaded with its new title;
  a deleted Recipe did not return; removed lookup selections were pruned.
  Only isolated synthetic transport/data was used, not production owner data.
- **Boundaries:** Acceptance Workbook, historical Phase 1 acceptance, formal
  requirements DOCX, database/migrations, Supabase/RLS/policies/grants/Auth,
  and Activity Planner are unchanged. Only CR-3 and CR-8 were implemented;
  CR-2 acceptance and its failed-UAT/refresh history are preserved above.
- **Owner UAT:** Pending the five approved checks: multi-select filtering;
  combined filters; clear/zero-match; Detail navigation preservation; mobile
  plus Edit navigation. No additional owner scenarios are required.
