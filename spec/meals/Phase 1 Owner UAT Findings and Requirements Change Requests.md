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

## Recipe Core R1 - CR-3 + CR-8 owner acceptance

CR-3 + CR-8 OWNER UAT

1. Multi-select filtering: PASS
2. Combined filters: PASS
3. Clear / zero-match: PASS
4. Detail navigation preservation: PASS
5. Mobile + Edit navigation: PASS

Overall: PASS

Notes: None

Final dispositions:

**CR-3: Accepted and complete.**
**CR-8: Accepted and complete.**

Recorded 2026-10-30. Source commit:
`f13dc63a6a4bab1b17e92f759cd2fdf147ec1248`.
Pages release commit: `923d19b9a25c8edbf7bf00a49827c4f28276c9bb`.
This owner acceptance supersedes the pending-UAT disposition above without
replacing its historical technical evidence. It accompanies the CR-1
source/evidence commit, not a separate documentation-only commit.

## Recipe Core R1 - CR-1 Ingredient paste refinement

- **Technical validation:** 2026-10-30. CR-1 owner UAT pending, not accepted.
- **Scope:** Only Ingredient-section textareas handle clipboard plain-text
  paste. A pure normalizer recognizes LF/CRLF/CR, removes whitespace-only
  lines, preserves retained text/whitespace/order/duplicates, and joins with
  LF. Normalized text replaces only the selected range or inserts at the
  caret, leaving surrounding text and other sections unchanged. The caret
  follows the insertion. An all-blank paste is prevented without modifying
  the value or selection.
- **Undo:** Native insertText is used to retain the browser undo entry when
  supported, with setRangeText as the unsupported-command fallback. Native
  undo/redo passed in the tested desktop browser; fallback undo history is
  browser-dependent and is not guaranteed.
- **Preservation:** No normalization on load, Save, blur, typing, or display.
  Existing/typed blank Ingredient lines remain. Instructions and all other
  inputs have no CR-1 paste handler; no pasted HTML is parsed. No historical
  data rewrite or Shopping implementation was performed. Future Shopping
  generation must independently ignore empty Ingredient lines.
- **Focused tests:** Interaction/service/routing: 39 passed, 0 failed.
  Added coverage verifies LF/CRLF/CR, whitespace/NBSP, retained whitespace,
  duplicates, literal markup, beginning/middle/end/selection paste,
  native insertion and fallback paths, caret, all-blank no-op, targeted
  section isolation, typed/legacy preservation through Save, and unchanged
  Instructions. CR-2/CR-3/CR-8/CR-5 regression tests remain passing.
- **Full validation:** 358 passed, 0 failed, 1 optional environment-dependent
  PostgreSQL skip. Lint and production main-build/static deep-link tests
  passed. Diff whitespace check passed.
- **Isolated full-app browser:** Actual clipboard write plus Ctrl+V exercised
  the real paste handler, including a trusted mobile-width paste event.
  At 1280px desktop and 375px mobile, normalized insertion, selection
  replacement, all-blank value/selection preservation, targeted section,
  and Save/Edit round-trip passed. Regular typed blank lines, an unrelated
  edit/save of existing Ingredient text, raw Instructions paste/edit, and
  CR-2 ordered steps remained intact. Desktop undo/redo passed. No horizontal
  document overflow; mobile Save target 44px. Synthetic local transport only;
  no production Recipe data was created or changed.
- **Boundaries:** Workbook, Phase 1 acceptance, formal requirements and
  implementation-plan DOCX files, database/migrations, Supabase/RLS/policies/
  grants/Auth, Shopping, and Activity Planner are unchanged. CR-3/CR-8 owner
  acceptance above accompanies this implementation; no other CR is added.
- **Owner UAT pending:** Four approved checks only: normal multiline paste;
  paste into existing text; typing/existing-data preservation; mobile plus
  Save/Edit round-trip.

## Recipe Core R1 - CR-1 owner acceptance

CR-1 OWNER UAT

1. Normal multiline paste: PASS
2. Paste into existing text: PASS
3. Typing and existing-data preservation: PASS
4. Mobile + Save/Edit round-trip: PASS

Overall: PASS

Notes: None

Final CR-1 disposition: **Accepted and complete.**

Source commit: `3cfb3931fac49197a019d42f0d242a5fd9a1c833`.
Pages release commit: `44deb0666df1e4f881d7a554c5ec0ffc70be78b6`.
Recorded 2026-10-30. This supersedes the pending owner-UAT disposition above,
preserving all prior technical evidence. No separate CR-1 documentation-only
commit is authorized or created.

## Recipe Core R1 - CR-7 Source page-title investigation

**Status: Investigation complete; not implemented, deployed, or accepted.**
Recorded 2026-10-30. Only this findings register is changed. CR-4 remains
paused at its separate real-PostgreSQL validation gate.

### Current implementation and trust boundaries

- Source is `public.meals_recipes.source`, a non-null text column defaulting
  to the empty string. `recipeService.recipeValues` copies it verbatim.
  The Source editor directly updates the draft; no title or normalized URL
  is stored. Existing Source remains unchanged through unrelated saves.
- Recipe Detail's `Source` component calls `recipeSourceUrl`: `new URL`
  accepts HTTP/HTTPS and returns its normalized href. The visible label is
  the original Source text. Thus storage is unchanged, although the browser
  link representation can be normalized. Links open in a new tab with
  `noopener noreferrer`; non-URL Source is React plain text.
- This is a safe-link protocol check, NOT an outbound-fetch safety check.
  It does not exclude private destinations, credentials or unusual ports.
  No Recipe title lookup currently occurs.
- The entire `src/utils/resolveLinkTitle.js` was reviewed. Its caller is
  Trips `ViewTripModal`, through `TripDetailsPanel`, not Recipe Core.
  A separate same-named implementation exists in `plannerService.js`;
  it is not the shared utility and is also unsuitable for blind reuse.
  Neither unrelated implementation is changed by this investigation.

### Existing title utility mechanism classification

| Mechanism | Classification | CR-7 conclusion |
|---|---|---|
| Original-URL fallback and plain-text React label | A - acceptable concept | Preserve original destination; never render returned HTML. |
| In-memory positive cache | A - acceptable concept, implementation needs limits | Existing unbounded module Map has no TTL or logout scoping. |
| YouTube-specific canonicalization/oEmbed | B - unsuitable for arbitrary Sources; C - opt-in/provider review | Provider integration is not general HTML title retrieval. Never canonicalize the displayed Source destination. |
| noembed and r.jina.ai proxy | C - owner privacy decision required | Disclose destination URLs to extra parties; not recommended for this wave. |
| JSONP script injection | D - replace/do not reuse | Executes third-party script in the application context. |
| Direct arbitrary browser fetch | B - unsuitable | CORS, opaque responses and mixed-content restrictions prevent reliable reads. |
| URL safety and request limiting implementation | D - replace for any server resolver | Hostname/query regexes are not SSRF controls; no DNS/connect-address or redirect enforcement, streamed byte cap or overall deadline. |

The utility rejects several obvious local/credential-like URLs but does not
resolve DNS, constrain ports or validate redirect destinations. Individual
fetch attempts use 8-second timeouts; sequential fallbacks have no overall
deadline. JSONP has its own 6-second timer. The caller ignores late results on
unmount but does not pass its abort signal into the resolver. Returned title
text is parsed/decoded, and the original URL is returned with the title.
These browser assumptions must not be copied into an authenticated server
fetcher. No production Recipe Source was passed to any resolver.

### Browser-only feasibility evidence

Controlled browser probes ran from the live application's HTTPS origin,
using public test URLs only, credentials omitted and no referrer:

- Normal fetch of `https://example.com/` failed with an explicit browser CORS
  error (no Access-Control-Allow-Origin).
- The same URL with `no-cors` returned an opaque response: status 0 and
  unreadable/empty body. It cannot supply a title.
- `https://httpbingo.org/html` returned readable CORS-enabled HTML, status
  200, but no title. A same-origin public application index returned the
  title "Life Manager"; neither proves arbitrary cross-origin access.
- A public redirect to example.com failed at the destination's CORS check.
  Manual redirect mode yielded an unreadable opaqueredirect response.
  A redirect to the CORS-enabled public HTML page succeeded without a title.
- A delayed public request aborted with TimeoutError using a 700ms deadline.
- `http://example.com/` was blocked as mixed content from the HTTPS app.
- Inert local HTML parsing decoded entities in
  `Soup &amp; Bread &#8212; Test`; a missing title returned no result.

**Reject browser-only arbitrary title retrieval.** No CORS bypass, JSONP,
private Recipe URL, authenticated Recipe request or production data mutation
was used. These are networking/parsing probes, not a CR-7 production prototype.

### Backend capability and SSRF gate

The repository is a Vite static application published to GitHub Pages.
Its browser Supabase client, owner-auth controller and SQL/RPC patterns do
not constitute a server-side HTML-fetch service. No local `supabase/functions`,
Supabase CLI configuration, Edge invocation or established Edge deployment
pattern was found. Remote function inventory was not queried; this finding
does not assert that the remote project has no functions.

CR-7 would introduce a new backend deployment surface. Official Supabase
documentation describes authenticated Edge Functions, worker limits and
outbound port restrictions, but does not establish a private-network egress
boundary for this proposed feature. General Deno DNS/custom HTTP client APIs
do not prove that the hosted runtime supports vetted DNS-to-socket pinning
with correct original-host TLS SNI and certificate verification.

Actual hosted-runtime enforceability is therefore **unverified**, not assumed
safe or assumed absent. DNS prechecks followed by ordinary fetch can
re-resolve and permit rebinding. A hostname regex or allowlist alone is not
sufficient. Do not approve arbitrary server-side URL fetching at this gate.

A future fetcher must demonstrably reject loopback, private, link-local,
metadata, unspecified, multicast and other non-public IPv4/IPv6 destinations,
including IPv4-mapped IPv6, CGNAT and mixed allowed/restricted DNS answers.
It must validate DNS chains and enforce the approved connection address,
not merely inspect the initial hostname. Apply equivalent checks to every
redirect if redirects are ever enabled.

### Recommendation, privacy and caching

Keep the current raw clickable Source as the default. The least intrusive
useful optional enhancement is an owner-triggered **Resolve page title**
action, not automatic requests on Detail open or Source Save. Consider only
explicitly reviewed public hosts with demonstrably safe egress. If the hosted
runtime cannot establish that boundary, retain no title lookup, or separately
review a provider-specific integration. Do not introduce a third-party proxy.

Render Source immediately. A small adjacent status can say "Resolving title";
do not block Detail or hide the link. On success replace only its visible
label with a bounded, wrapping plain-text title. On failure retain the raw
clickable Source and show "Title unavailable" with an explicit retry after
cooldown. No-title/non-URL input does not become an error blocking the Recipe.
Cancel work on unmount and ignore stale results after Source/Recipe changes.
Never use an endpoint-returned URL as the link destination.

Lookup discloses the requested URL (including its path/query) and resolver
network metadata to the destination and potentially infrastructure logs.
Authentication goes only to the application's endpoint. Never forward browser
cookies, bearer/session tokens, authorization headers or referrers to the
destination. Do not log full Source URLs or credential-bearing values.
HTTPS-only lookup is recommended; an HTTP Source remains clickable but is
not fetched or silently upgraded. This narrower lookup policy needs approval.

Prefer authenticated-page-lifetime memory caching only: at most 50 successful
titles, 15-minute TTL, clear on logout/unmount; a 30-second failed-attempt
cooldown allows explicit retry. No browser persistent storage, Recipe title
column, database cache or server cache. Cache hits need not trigger new
destination requests. This is intentionally not a durable title guarantee.
Per-isolate server memory cannot provide a reliable global rate limit.
Propose 10 owner lookups/minute with one in flight; an enforceable shared or
platform rate-limit mechanism must be verified before endpoint approval.
Do not silently substitute a best-effort Map or introduce a database schema.

### Proposed future contract and limits - not implemented

- Proposed `POST /functions/v1/recipe-source-title`, body `{ "url": "..." }`.
  One URL per request. Verify the user JWT AND exact designated-owner identity,
  using the established owner identity contract. Auth alone is not owner
  authorization. No service-role credentials or database writes are needed.
- `200 { "status": "resolved", "title": "..." }`, or
  `200 { "status": "unavailable", "reason": "..." }`. Reasons:
  `not_allowed`, `no_title`, `timeout`, `too_large`, `not_html`, `upstream`.
  Unavailability is explicit, never a success-shaped fabricated title.
- Malformed request: 400; absent/invalid authentication: 401; non-owner: 403;
  enforced rate limit: 429 with Retry-After; unavailable safety configuration:
  503. All client outcomes retain the existing Source and usable Detail.
- Lookup URLs: HTTPS on 443 only, maximum 2048 UTF-8 bytes; reject userinfo,
  IP literals, local/special hostnames, other ports/schemes, credential/signed
  query values and unreviewed host/path combinations. Use exact reviewed
  hosts, not implicit arbitrary subdomains. Reject proxy/redirect endpoint
  paths; sensitive path values still require owner caution. Remove fragments
  from the fetch target only; never rewrite persisted Source or link href.
- **Redirect limit: zero.** Treat every 3xx as unavailable without following
  it. Supporting any redirects later requires a separate reviewed policy
  with the same host/DNS/connect-address checks at every hop.
- Total server deadline 5 seconds, including DNS, connect, headers and body;
  client endpoint deadline 6 seconds with cancellation. Bound request JSON to
  4 KiB, decompressed HTML to 512 KiB while streaming, response to 2 KiB,
  and title to 300 Unicode code points. A Content-Length header alone is not
  sufficient; abort oversized, slow or compressed expansion responses.
- Accept `text/html` with absent/UTF-8 charset only for the first version;
  reject other declared charsets/content types. Parse bounded HTML using a
  non-executing parser, decode entities once, extract title as plain text,
  normalize title whitespace/control characters and bound its length.
  No JavaScript, subresource loading, JSONP or raw HTML insertion.

### Likely future files and verification

Existing files likely to change after approval:
`src/pages/Meals/RecipeCore.jsx`, `src/pages/Meals/MealsPage.module.css`,
`tests/meals-recipe-interaction.test.cjs`, and this register.
Proposed new files: `src/services/recipeSourceTitleService.js`,
`tests/meals-recipe-source-title.test.cjs`,
`supabase/functions/recipe-source-title/index.ts`, its focused test file, and
`supabase/config.toml` only if required by the approved deployment tooling.
The existing Trips/Planner resolver is not a proposed dependency or change.

Future automated cases:

1. Approved HTTPS Source resolves a title.
2. HTTP remains clickable but lookup is refused under the approved policy.
3. Missing/blank title retains raw clickable fallback.
4. DNS/connect/body timeout aborts and falls back.
5. Public redirect is refused without a second request.
6. Redirect to private/restricted destination makes no destination request.
7. Localhost/private IPv4, alternate numeric forms, restricted DNS answers
   and rebinding attempts are blocked at the connection boundary.
8. Restricted IPv6, mapped IPv4 and mixed A/AAAA answers are blocked.
9. Userinfo, credential-bearing/signed URLs and unusual ports are refused.
10. Oversized/chunked/compressed responses abort within the streamed cap.
11. Non-HTML/unsupported charset falls back.
12. Malicious title markup/entities render only as bounded inert text.
13. Original Source storage and link destination survive lookup unchanged.
14. Non-URL Source stays plain text without a request.
15. Unavailable/network/auth/rate-limit responses never break Detail;
    stale results, cancellation, retry, cache expiry/logout and accessible
    desktop/mobile wrapping behave predictably.
16. CR-1/2/3/5/8 focused regressions remain passing.

Also test exact-owner authorization, no credential/header forwarding, no
sensitive URL logs, enforced shared rate limiting and zero subresource/script
requests. Hosted-runtime egress tests are a release gate, not replaceable by
mocked DNS alone.

### Evidence references and disposition

- [Browser fetch modes and opaque responses](https://developer.mozilla.org/en-US/docs/Web/API/Request/mode)
- [Supabase Edge authentication](https://supabase.com/docs/guides/functions/auth)
- [Supabase Edge architecture](https://supabase.com/docs/guides/functions/architecture)
- [Supabase Edge limits](https://supabase.com/docs/guides/functions/limits)
- [Deno runtime network permissions](https://docs.deno.com/runtime/fundamentals/security/)
- [Deno DNS API](https://docs.deno.com/api/deno/network/#Deno.resolveDns)
- [Deno HTTP client options](https://docs.deno.com/api/deno/fetch/#Deno.CreateHttpClientOptions)

No endpoint, production prototype, infrastructure installation, secret,
database/migration, RLS/policy/grant/Auth change or deployment was made.
The Acceptance Workbook and Phase 1 acceptance remain untouched.
No staging, commit or push is authorized. The unrelated
`supabase/review/owner-auth-broker-cleanup.sql` remains excluded.
Owner decision remains: keep current Source labels, or authorize a separately
scoped owner-triggered reviewed-host feature and its privacy, HTTPS-only,
new-backend and enforceable-egress/rate-limit prerequisites.

## Recipe Core R1 - CR-7 owner disposition

Recorded 2026-10-30.

**CR-7: Deferred**

Reason:
Page-title resolution would require a new network/backend trust boundary and
security controls disproportionate to the value of this personal-app
enhancement.

Current behavior retained:
Recipe Source URLs remain clickable and display the stored Source URL.

Possible future approach:
Owner-triggered title resolution for a restricted set of reviewed hosts, if a
safe backend pattern is established later.

This owner disposition supersedes the pending decision above and preserves
the investigation as history. CR-7 is not implemented or accepted. No
application, database, workbook or deployment change accompanies this record.

## Recipe Core R1 Refinement Closeout

Recorded 2026-10-30. This is the current disposition summary; earlier
proposals, pending-UAT statements and failed observations remain historical
evidence, superseded by the final owner dispositions below. Detailed owner
UAT records are not repeated.

| Refinement | Final disposition | Retained behavior / boundary |
|---|---|---|
| CR-1 | Accepted and complete; owner Overall PASS | Ingredient paste removes blank/whitespace-only pasted lines, preserving typing, existing data, retained line text, order, duplicates and Save/Edit behavior. |
| CR-2 | Accepted and complete; owner retest Overall PASS | Nonblank Instructions lines display as numbered steps; raw multiline persistence/Edit remains unchanged. Original failure and hard-refresh diagnosis remain historical evidence. |
| CR-3 | Accepted and complete; owner Overall PASS | Multiple Categories/Cuisines: OR within each group; AND across search, Category, Cuisine and Favorites. |
| CR-5 | Accepted and complete; owner Overall PASS | Referenced classification deletion is refused with a clear accessible explanation, preserving Recipe draft state. |
| CR-8 | Accepted and complete; owner Overall PASS | Library criteria survive supported Meals/Detail/Edit navigation, not full refresh/logout. |
| CR-6 | Deferred / Optional | Listing Recipes referencing a blocked classification is a nice-to-have, not required for current Recipe Core or CR-5 refusal behavior. |
| CR-7 | Deferred - Investigation Complete, Not Implemented | Browser-only arbitrary titles are unreliable; existing title utility is unsuitable for general Recipe Sources. A new backend/network trust boundary is disproportionate to the enhancement's value. |
| CR-4 | Paused - Not Implemented | Requires disposable real-PostgreSQL validation capability and separate authorization before resumption. |

### Paused CR-4 validation boundary

Atomic clearing of the current persisted Recipe's association plus
Category/Cuisine deletion requires real PostgreSQL transaction, rollback,
locking, race and multi-session concurrency validation. The current environment
does not provide the required disposable tooling: `initdb`, `pg_ctl`,
`postgres` and `psql`; `WORKBENCH_TEST_PG_BIN` is unavailable.
PGlite is not sufficient proof of these concurrency requirements.

No CR-4 application implementation, migration, database change, production
operation, commit or deployment has been performed. Resume only when suitable
disposable local PostgreSQL tooling is available and separately authorized.
Do not weaken the future validation requirement to unblock CR-4.

### Deferred CR-7 and cycle boundaries

The existing CR-7 investigation remains the single investigation record.
No established repository Edge Function deployment pattern was found;
SSRF-safe arbitrary outbound retrieval was not demonstrated. Security/privacy
complexity is disproportionate for this personal-app enhancement.
Source remains stored unchanged; valid HTTP/HTTPS values remain clickable
with the stored Source as the visible label, and non-URL values remain plain
text. A possible future direction is owner-triggered resolution for reviewed
hosts only after a safe backend pattern and egress controls are established.

- Accepted Phase 1 Recipe Core baseline remains unchanged.
- Historical Phase 1 Acceptance Workbook remains unchanged.
- No database change is part of this closeout.
- No deployment is required for this closeout.
- Historical security-ledger reconciliation remains separate technical
  governance work and does not reopen the accepted owner functional baseline.
- Only this findings register is authorized for the closeout commit and push
  to dev; source, tests, workbook, migrations, generated Pages assets and the
  excluded cleanup SQL are not part of this change.

## Phase 2 Shopping - kickoff and Wave 1 local candidate

Run **P2-TECH-001**, 2026-10-30. Baseline `dev` and `origin/dev`:
`d0620ffacd49849273f8d3603f5728a611b536ff`; index initially empty.
The R1 closeout is already committed and pushed separately. CR-1/2/3/5/8
remain accepted, CR-4 paused/not implemented, CR-6 optional/deferred and
CR-7 deferred after investigation. The excluded cleanup SQL is untouched.

Requirements v0.3, Implementation Plan v1.0, current workbook Phase 2 rows,
Update Protocol and Recipe persistence/security evidence were inspected.
The owner's explicit no-workbook-update instruction controls this kickoff:
no workbook status, formula, evidence or Phase Sign-Off change is made.

### Complete Phase 2 requirement map and bounded waves

| Area | Exact requirement IDs | Implementation wave / coverage |
|---|---|---|
| A. Navigation / entry points | NAV-007; RL-FUNC-013, RL-FUNC-014, RL-FUNC-015; RD-FUNC-001 | Shopping route Wave 1; Recipe entry actions Wave 2. |
| B. Recipe -> Shopping | SHOP-FUNC-002, SHOP-FUNC-025; RD-STATE-001; ASL-STATE-001 | Wave 2: new unchecked items, no automatic navigation. |
| C. Ingredient checklist | ASL-UI-001, ASL-UI-002; ASL-FUNC-001 through ASL-FUNC-013 | Wave 2: single Recipe, ordered section groups, independent default-selected lines, Select/Clear all, cancel, selected-only add, zero-selected guard, verbatim text and duplicates. |
| D. List presentation | SHOP-UI-001; SHOP-FUNC-001, SHOP-FUNC-009 | Wave 1: one categorized list; checked rows remain subdued. |
| E. Manual items | SHOP-FUNC-003, SHOP-FUNC-016, SHOP-FUNC-018, SHOP-FUNC-019 | Wave 1: add/edit/remove; auto assignment visible; no individual removal confirmation; no Recipe writes. |
| F. Categorization | SHOP-FUNC-004, SHOP-FUNC-005, SHOP-FUNC-006, SHOP-FUNC-015, SHOP-FUNC-017, SHOP-FUNC-020 | Shared deterministic map/override in Wave 1; Recipe ingestion uses it in Wave 2. No quantity/unit normalization. |
| G. Purchased behavior | SHOP-FUNC-008, SHOP-FUNC-009, SHOP-FUNC-010, SHOP-FUNC-013, SHOP-FUNC-014, SHOP-FUNC-026 | Wave 1: immediate persistence; sink within category; mobile auto-collapse and manual expansion; no desktop auto-collapse. |
| H. Clear operations | SHOP-FUNC-011, SHOP-FUNC-012, SHOP-FUNC-024; STATE-006 | Wave 1: Clear Checked without prompt; confirmed Clear List retains all categories. |
| I. Categories | SHOP-FUNC-007, SHOP-FUNC-021, SHOP-FUNC-022, SHOP-FUNC-023 | Wave 1: custom create/rename/delete-unused; predefined protection in UI and database. |
| J. Ordering | SHOP-FUNC-010, SHOP-FUNC-027 | Wave 1: configured predefined order, custom creation order, unchecked then checked in each group. |
| K. Desktop | ASL-UI-001; SHOP-FUNC-026; RESP-001, RESP-002 | Manual/list Wave 1; ingredient modal Wave 2. |
| L. Mobile | ASL-UI-002; SHOP-FUNC-013, SHOP-FUNC-014; RESP-001, RESP-003 | Touch/checked behavior Wave 1; ingredient bottom sheet/equivalent Wave 2. |
| M. State/errors | SHOP-STATE-001; STATE-001, STATE-002, STATE-003, STATE-004, STATE-006, STATE-007 | Wave 1 loading/retry, empty state, duplicate guard, explicit failures and retained attempted values; Wave 2 repeats for checklist. |
| N. Persistence | Section 14 Shopping Category/Item capabilities; DB-DATA-001; ARCH-013, ARCH-015 | Wave 1 additive schema only; no Planner/Import objects. |
| O. Security | ARCH-001 through ARCH-009, ARCH-012 through ARCH-015; DB-SEC-001 through DB-SEC-012; SEC-TST-001 through SEC-TST-010 | Applicable shared exact-owner/security/catalog gates. No views, sequences or browser RPCs; their positive-access checks are inapplicable. Production identity/Advisor/smoke remain future gates. |
| P. Recipe regression | RE-FUNC-006; accepted CR-1/2/3/5/8; RL/RD/RE and Phase 0 navigation/security | Existing Recipe text/persistence/filter/navigation/error contracts retained. Wave 2 independently excludes legacy/typed blank ingredient lines. |
| Q. End-to-end | E2E-03, E2E-04, E2E-11; previous-phase E2E-00, E2E-01, E2E-02, E2E-10 regression | E2E-04/11 local equivalents Wave 1; E2E-03 Wave 2. No owner acceptance claimed. |

Functional Test IDs are the corresponding controlled IDs with `-T01`
(including NAV-007-T01, RL-FUNC-013-T01 through RL-FUNC-015-T01,
RD-FUNC-001-T01, RD-STATE-001-T01, all ASL/SHOP rows and STATE-006-T01).
Shared security IDs include ARCH-*-T01 and SEC-TST-*-T01; existing database
checks include DBV-DB-SEC-001 through DBV-DB-SEC-012, DBV-DB-DATA-001,
DBV-PROJECT-001 and DBV-BROKER-001. Their historical evidence is not replaced.

Two waves are smaller practical deployable slices than splitting purchased/
category/clear/mobile requirements away from a usable manual list:

1. **Wave 1 - persistence + complete manual Shopping.** Locally implemented:
   NAV-007, SHOP-UI-001, SHOP-FUNC-001, SHOP-FUNC-003,
   SHOP-FUNC-005 through SHOP-FUNC-024, SHOP-FUNC-026, SHOP-FUNC-027,
   SHOP-STATE-001 and STATE-006, with shared security/state/regression gates.
   Service text editing supports any Shopping row independently of provenance.
   Files: Shopping service/page/CSS, Meals route, four reviewed SQL candidates,
   Shopping service/interaction/persistence tests and isolated fixtures.
   Objects: the two Shopping tables and supporting objects below.
   Tests: focused, role/catalog, full suite and desktop/mobile browser.
   Owner UAT: five checks below, only after an authorized migration/release.
   Deployment dependency: verified Shopping migration before UI release.
2. **Wave 2 - Recipe -> Shopping.** Designed, NOT implemented:
   RL-FUNC-013 through RL-FUNC-015, RD-FUNC-001, RD-STATE-001,
   ASL-UI-001/002, ASL-FUNC-001 through ASL-FUNC-013, ASL-STATE-001,
   SHOP-FUNC-002, SHOP-FUNC-004 and SHOP-FUNC-025; E2E-03.
   Expected files: RecipeCore, shared ingredient-selection component,
   responsive CSS, Shopping service batch method and focused/E2E tests.
   No additional database object is currently needed. Five owner checks:
   one-selection enablement, grouped/default selection, selected-only/cancel,
   duplicates/verbatim text, mobile sheet plus Detail-stays-open confirmation.
   Depends on accepted Wave 1 persistence; requires its own validation/release.

Wave 2 design: fetch the selected Recipe's current persisted data, split each
section on LF/CRLF/CR, ignore whitespace-only lines and preserve every retained
line/duplicate and section order. Use independent stable row identities,
initially select all, and submit one atomic bulk INSERT of selected new
unchecked rows (with stable retry IDs and reconciliation after uncertain
responses). Do not loop independent inserts and claim all-or-nothing success.
Desktop uses a modal, mobile an equivalent bottom sheet; Cancel adds nothing.
Library enables only exactly one selected Recipe. Detail stays open with
success status and optional View Shopping List. No ingredient parsing,
Recipe mutation, multi-Recipe aggregation or navigation-state rewrite.

### Wave 1 model and behavior

- One list represented by `meals_shopping_items` and
  `meals_shopping_categories`, not a speculative lists hierarchy.
- Items: UUID, verbatim nonblank text, nullable category FK, checked boolean
  default false, server-managed created_at/updated_at. Duplicates are allowed.
  No Recipe FK/provenance is needed: text copies are independent, and editing
  or deleting a Shopping row cannot affect its source Recipe.
- Categories: UUID, canonical nonblank case-insensitive unique name, nullable
  predefined_order (1..28, unique), server timestamps. All 28 predefined names
  are seeded in specification order, Baking through Wine & Spirits.
  Null category is a UI "Uncategorized" group, not an invented 29th seed.
- Ordering: configured predefined order; custom categories by created_at/id;
  items by unchecked/checked then created_at/id within category. Timestamp/ID
  ties are deterministic. No manual ordering, sequence or reorder RPC.
- OD-004 permits a technical mapping decision. A small explicit keyword/phrase
  map uses case-insensitive whole-token/phrase boundaries after punctuation
  separation. The first matching category in configured order wins. Unknown
  text remains Uncategorized; custom categories are manual overrides only.
  Matching never rewrites the stored text. The same helper is reserved for
  Wave 2. Ambiguous phrases can require manual override; this is best effort,
  not semantic interpretation (for example flour wins in "rice flour").
- The manual input visibly previews automatic assignment. Overrides persist
  immediately; editing text does not silently reassign an overridden category.
  Each add is new/unchecked; retries retain the draft UUID and reconcile a
  previously committed identical insert rather than duplicate it.
- Service uses injected Supabase client, complete keyset pagination with exact
  counts, explicit field mapping and direct table operations. No generic RPC,
  external request, durable browser store or cache replaces database loading.
- List shows only populated groups, full retained text and subdued checked
  rows. Purchased changes persist immediately and sink within the category.
  Only mobile auto-collapses a fully checked group; it remains expandable.
- Individual removal and Clear Checked require no confirmation. Clear List
  uses a native modal dialog, Cancel/Escape, contained keyboard focus and
  explicit confirmation; both category kinds are preserved.
- Failed loads offer retry, not a misleading empty list. Mutations block
  duplicate submission, retain current/draft values on failure and offer
  explicit retry. Reliable validation/auth/FK/unique/network codes receive
  distinct safe messages; unknown results are not presented as success.
  Uncertain failures explicitly say the change could not be confirmed.
  Single-row deletions require an exact affected count of one; zero-row
  deletes are not presented as success. Reload Shopping reconciles uncertain
  persisted state without resubmitting a mutation.

### Exact local migration and security authorization package

**Candidate:** `supabase/review/202610300001_meals_shopping.sql`.
Execution guard remains false. Candidate SHA-256:
`f7d436dd8b4102c9a57a3dbf9b81abfdf3c5d3b85ea616aa9321df08cb75e768`.
The LF copy with only the single execution guard changed to true has SHA-256:
`d42fe15d0f187fffd4376af50371577d8bcfabf82e3d08d154f7c1d674ea3ea9`.
Neither production execution nor that gate change has occurred.

Object inventory (all schema public, postgres-owned):

- Tables `meals_shopping_categories`, `meals_shopping_items`.
- Five indexes: `meals_shopping_categories_pkey`,
  `meals_shopping_items_pkey`,
  `meals_shopping_categories_predefined_order_key`,
  `meals_shopping_categories_name_key`,
  `meals_shopping_items_category_id_idx`.
- One SECURITY INVOKER internal trigger function
  `meals_shopping_before_write()` with empty search_path, no browser EXECUTE.
  It assigns timestamps, preserves created_at and identity, canonicalizes
  category names and blocks predefined category insert/change/delete.
- Three triggers: `meals_shopping_before_write` on each table (INSERT/UPDATE)
  and `meals_shopping_before_delete` on categories.
- Eight permissive operation-specific policies:
  `meals_shopping_categories_owner_select/insert/update/delete` and
  `meals_shopping_items_owner_select/insert/update/delete`.
  Roles: authenticated only; every applicable USING/WITH CHECK is
  `(SELECT auth.uid()) = 'e72bccd9-ec2b-4822-bb5c-b7c1f39dcf60'::uuid`.
- Both tables explicitly ENABLE ROW LEVEL SECURITY. No generic authenticated
  policy or anon access. Table ACLs are explicitly reset, not inherited.
- Exact authenticated grants: SELECT, DELETE on both tables;
  categories INSERT(id,name), UPDATE(name);
  items INSERT(id,text,category_id,checked), UPDATE(text,category_id,checked).
  No authenticated timestamp/predefined_order/identity UPDATE.
- Exact service_role table grants: SELECT, INSERT, UPDATE, DELETE, consistent
  with reviewed Recipe conventions; no service-role material in browser code.
  PUBLIC/anon have no table privileges; PUBLIC/anon/authenticated/service_role
  have no EXECUTE on the internal trigger function.
- Constraints: PKs, nonblank text/name, canonical unique category names,
  unique/range-constrained predefined position, NOT NULLs and
  `category_id` FK with ON UPDATE/DELETE RESTRICT. FK enforcement, not a
  race-prone application count check, protects in-use custom categories.
  Named CHECK/FK constraints:
  `meals_shopping_categories_name_check`,
  `meals_shopping_categories_predefined_order_check`,
  `meals_shopping_items_text_check`,
  `meals_shopping_items_category_id_fkey`; PK/unique constraints share their
  corresponding index names above.
- No views, sequences, extensions, browser RPCs, new roles, default-privilege
  changes, Recipe object changes or abandoned-broker dependency.

Prepared read-only `meals_shopping_preflight.sql` inventories project-confirmation
gate, executor/owner identity, Recipe table ownership/RLS/ACLs, browser roles/
inheritance and Shopping name collisions. Production preflight was NOT run;
confirm home-maintenance-app / tawvchmjtkgykwwvnnnn, exact owner, safe roles,
expected Recipe baseline and no collisions before requesting execution.
`meals_shopping_postflight.sql` inventories relations/owners/ACLs, columns,
column grants, all policy roles/commands/expressions, function definition/
security/config/ACL, triggers, constraints, indexes and exact seed order.
Compare against this inventory; stop on drift.

Reversal: `meals_shopping_reversal_DISABLED.sql`, separately guarded and never
automatically executed. Locks both tables, refuses existing items/custom
categories, then drops only Shopping tables/function without CASCADE.
If used data exists, export/retention review and a new authorization are
required; prepared reversal does not authorize data deletion.

Data impact: forward migration creates empty Shopping storage and 28 category
seeds only. No existing Recipe/Planner/Shopping data is modified. Direct CRUD/
clear operations are single PostgreSQL statements; no custom multi-statement
race/locking protocol analogous to paused CR-4 is introduced. PGlite validates
single-session PostgreSQL semantics, not multi-session concurrency. No real
PostgreSQL concurrency proof or production catalog result is claimed.

### Local validation and remaining release gate

- Shopping persistence tests: 5 passed, covering disabled/identity/collision
  gates, exact catalogs/ACLs/policies/seeds, anon/non-owner/missing-JWT denial,
  owner lifecycle, immutable predefined categories, FK refusal, raw text/
  duplicates/timestamps, unchanged Recipe/default ACL and guarded reversal.
- Shopping service and interaction tests exercise mapping, full pagination,
  stable retry IDs after lost insert response, overrides/edit/remove/clear,
  draft retention, duplicate-submit guard, mobile collapse and keyboard dialog
  cancellation. Existing Recipe tests are not weakened.
- Isolated production-build browser, 1280px desktop and 375px mobile:
  actual add/edit/remove, automatic category preview, overrides, custom
  create/rename/in-use refusal/unused delete, purchased ordering/subdued paint,
  mobile collapse/expand/uncheck, Clear Checked, Clear List cancel/confirm,
  failed add/load retry and uncertain committed-insert reconciliation passed.
  No horizontal overflow; tested button/select/summary targets >=44px.
  Modal Tab containment and Escape cancellation passed. Long mobile text wraps.
  Recipe search/Favorites survived Shopping navigation. Test transport only;
  CSP blocks external connections. Fixture servers are stopped after testing.
- Final aggregate test/lint/build counts are recorded below after the final
  validation run. Main production/static-host build is in memory only, with
  no generated Pages/Activity Planner publication.

Proposed source commit after separately authorized successful migration:
`Meals Phase 2: add manual Shopping List and persistence`.
Do not stage/commit/push/release this migration-dependent candidate now.
After read-only preflight and explicit authorization of the exact gate-enabled
SQL: execute once, stop on any error without retry/automatic reversal, inspect
postflight/owner API denial-allow results and Security Advisor, then authorize
the source commit/dev push and established main-only Pages release. Verify
live assets/deep links and safe smoke before the five owner checks:

1. Add manual items, see automatic/unknown category, and override a category.
2. Edit/remove an item without affecting Recipes.
3. Create/rename a custom category; verify in-use refusal then unused deletion.
4. Check/uncheck, verify sinking and mobile collapse/expansion.
5. Clear Checked; cancel/confirm Clear List and verify categories remain.

No owner UAT has been performed. Wave 2/E2E-03 and overall Phase 2 acceptance
remain outstanding. Later workbook updates require separate authorization;
no initial Shopping row is marked Pass or Ready to Test in this task.

### P2-TECH-001 final local results and file manifest

- Focused Shopping/Recipe service, interaction, routing and actual
  production-build/static-host checks: **58 passed, 0 failed, 0 skipped**.
- Full configured suite: **376 passed, 0 failed, 1 optional pre-existing
  WORKBENCH_TEST_PG_BIN-dependent skip** (377 total). No real PostgreSQL
  multi-session claim is made. A final reload-status clarification was
  subsequently covered by the focused suite/build/browser smoke above.
- Shopping-only coverage: **18 passed** (5 persistence/security, 6 service,
  7 interaction). Lint: passed with no errors/warnings. Git whitespace check:
  passed. Main production build and Meals deep-link recovery passed in memory;
  no generated application or Activity Planner assets were published.
- Final browser smoke additionally verified failed deletion retains the row,
  Reload Shopping reconciles persisted state, desktop Escape cancels, and
  mobile checking/collapse/expand/Clear Checked works at 375px without overflow.
  Earlier desktop/mobile lifecycle, custom-category, layout and keyboard
  evidence above remains applicable. All local fixture processes are stopped.
- Test logs are session evidence `files/p2-wave1-full-tests.txt` and
  `files/p2-wave1-focused-tests.txt`, not production/owner acceptance evidence.

Exact source files changed:

- `src/pages/Meals/MealsPage.jsx`
- `src/pages/Meals/ShoppingPage.jsx` (new)
- `src/pages/Meals/ShoppingPage.module.css` (new)
- `src/services/shoppingService.js` (new)

Exact test/fixture files changed:

- `tests/meals-shopping-persistence.test.cjs` (new)
- `tests/meals-shopping-service.test.cjs` (new)
- `tests/meals-shopping-interaction.test.cjs` (new)
- `tests/fixtures/shopping-memory-client.js` (new, test-only)
- `tests/fixtures/meals-synthetic-auth.js`
- `tests/meals-routing.test.cjs`
- `tests/meals-static-host.test.cjs`

Exact database candidate files (new, all under `supabase/review`):

- `202610300001_meals_shopping.sql`
- `meals_shopping_preflight.sql`
- `meals_shopping_postflight.sql`
- `meals_shopping_reversal_DISABLED.sql`

Exact findings-register change: this single Phase 2 kickoff/Wave 1 section;
prior R1 evidence and closeout are preserved. No other controlled document,
workbook, Recipe application/service or deployed Recipe SQL was changed.
Workbook baseline SHA-256 remains
`A5033EFC216EDAE9F640B6E8D1B2AEBB5DA1B82D545C8562717620F131E4915B`.

**STOPPED before production authorization.** No production database operation,
migration application, owner UAT, staging, commit, push or deployment occurred.
Production preflight, exact migration execution authorization, postflight/
owner API/security verification and release authorization remain outstanding.
Only Wave 1 is a locally validated candidate; Phase 2 is not complete.

### Wave 1 production verification and owner release authorization

Run **P2-TECH-002**, 2026-10-30, exact project
home-maintenance-app / tawvchmjtkgykwwvnnnn. This supersedes the historical
pre-execution gate above, not any prior Recipe acceptance evidence.

- Exact migration execution: **1**, normal HTTP 201 `[]` success. The editor
  matched authorized SHA-256
  `d42fe15d0f187fffd4376af50371577d8bcfabf82e3d08d154f7c1d674ea3ea9`,
  7,207 UTF-8 bytes, no BOM, 124 CRLF endings and final newline. The owner
  explicitly approved one "Run without RLS" confirmation; no supplemental
  Dashboard RLS rewriting was selected.
- Exact Shopping postflight comparator: **PASS**, before authorization
  fixtures and after rollback/cleanup. Verified 2 tables, 5 indexes, 8 policies,
  3 triggers, 1 internal SECURITY INVOKER function, exact columns/defaults/
  nullability/constraints/FK/grants/revokes, 28 predefined categories,
  zero items and zero custom categories.
- Exact rollback fixture execution: **1**, enabled SHA-256
  `f149bc49f947a978a4cedfccdc64fe13bde055bca2a598f2a60e558ffb0846c1`.
  Owner SQL/RLS CRUD and anonymous/non-owner/null/malformed-subject denial
  passed. Browser direct internal-function EXECUTE was denied. The whole
  BEGIN-through-ROLLBACK request succeeded; fresh independent cleanup and
  repeated postflight confirmed zero fixture rows/items/custom categories,
  with all 28 predefined categories intact. This is SQL-role/auth.uid()/RLS
  evidence, not proof of JWT/PostgREST transport or owner UI acceptance.
- Generic preservation after-snapshot: all **139 pre-existing fingerprints**
  covered, 12 exact authorized new Shopping exclusions, zero uncovered objects.
  Recipe and Planner/Project preservation passed. Both Trips catalogs and all
  other pre-existing catalogs remained unchanged.
- **Strict preservation exception:** public.trips rows 11 -> 12 and
  public.trips_workflow_metadata rows 3 -> 4, with changed data fingerprints.
  The comparator remains **FAIL** for these two pre-existing tables only.
  Verification stopped for owner review; no production repair was attempted.
- One authorized read-only investigation confirmed saved after-fingerprints.
  It identified the added workflow row by restoring its before-fingerprint
  on exclusion, but no single Trip exclusion restored the Trips fingerprint.
  The workflow's referenced Trip was not proven to be the new Trip. Neither
  table appears in Shopping migration SQL; no triggers or foreign keys
  touching either were found. No private Trip content is recorded here.
- Refreshed Security Advisor: **0 errors, 1 unchanged Auth warning, 10
  unchanged informational findings, no new Shopping-related findings**.
  The Auth warning is Leaked Password Protection Disabled; informational
  findings are existing RLS Enabled No Policy entries on pre-existing tables.

**Owner disposition / release authorization, 2026-10-30:** accept the Trips
preservation mismatch as **unrelated, unattributed concurrent production
activity** and proceed with the reviewed Wave 1 source commit/dev push,
established Pages deployment and read-only live login/asset/route smoke.
This is the owner's accepted exception, **not an established cause**, and
does not convert the strict preservation failure into a pass.
No further migration, reversal, fixtures, production-data modification or
Wave 2 is authorized. Owner UAT remains pending; Phase 2 is not complete.

The complete review package also includes the disabled authorization fixture,
independent cleanup SQL, generic preservation SQL, exact expected catalog,
offline comparator, verification tests and
[completed verification runbook](../../supabase/review/meals_shopping_verification_runbook.md).
The narrow Git attribute rule preserves reviewed SQL bytes without text
normalization. Both execution guards remain disabled; the excluded
owner-auth-broker-cleanup.sql remains outside staging/release.
The Acceptance Workbook is unchanged at SHA-256
`a5033efc216edae9f640b6e8d1b2aebb5da1b82d545c8562717620f131e4915b`.

Release validation rerun after recording this disposition: **69 passed, 0
failed, 0 skipped**, covering the verification package, Shopping persistence/
service/interaction, routing/static-host production build and Recipe service/
interaction regressions. Scoped ESLint (including the review comparator/tests)
and whitespace checks passed. The earlier full-suite result remains 376
passed, 0 failed and 1 optional pre-existing native-PostgreSQL skip.

### Shopping Wave 1 owner UAT and acceptance

Owner report, 2026-10-30, for deployed Shopping Wave 1:

1. Manual items + categorization: **PASS**
2. Edit + remove: **PASS**
3. Custom categories: **PASS**
4. Purchased behavior + mobile: **PASS**
5. Clear Checked + Clear List: **PASS**

**Overall: PASS. Remaining functional issues: None.**

**Final owner disposition: Shopping Wave 1 accepted and complete.**

Release traceability: source commit
`3038a61c46ac841ed30e2787b3faf2482edc5846` pushed to dev; Pages release
`0308c7b7871841a9393a5d3639e7fc59924f8425` deployed successfully through
[Pages run 41097250688](https://github.com/wescooper06/HomeMaintenanceApp/actions/runs/41097250688).
Technical release smoke verified all 19 main-app publication files and root
404 against release bytes, Shopping deep-link recovery and the normal owner
login boundary. This owner report supplies the subsequent functional UAT.
The recorded Trips preservation failure and owner-accepted, unattributed
exception remain intact; acceptance does not establish a cause.

**Deferred UX follow-up:** Shopping functionality works as expected, but the
current interaction flow is not especially efficient. Defer UX optimization
until the remaining Meals pages and functional workflows are complete.
This is a deferred improvement, not an open Wave 1 functional defect.

Wave 2 and overall Phase 2 acceptance remain outstanding; neither is started
or accepted by this closeout. No cleanup result was supplied in this owner
report, so none is inferred. No repeat owner UAT, migration/fixture execution,
reversal, production change or deployment is part of recording this result.
Both repository SQL execution guards remain disabled. The Acceptance Workbook
is unchanged; no workbook status or sign-off is updated.

### Shopping Wave 2 - Recipe to Shopping

Run **P2-TECH-003**, 2026-10-30. Owner authorized the streamlined Wave 2
implementation, validation and established source/Pages release process.
The Wave 1 acceptance and deferred UX note immediately above are preserved
once, not replaced: Shopping works correctly; revisit overall UX efficiency
only after the remaining Meals pages and functional workflows are complete.
No Shopping UX redesign, CR-4/6/7 resumption or Planner implementation is
included.

Baseline verified: dev/origin/dev
`3038a61c46ac841ed30e2787b3faf2482edc5846`; deployed main/Pages
`0308c7b7871841a9393a5d3639e7fc59924f8425`; index empty. The only existing
tracked modification was the owner-authorized Wave 1 acceptance record above.
Wave 1 production health evidence is the completed P2-TECH-002 checks and
subsequent five-check owner PASS, with no remaining functional issues.
No production SQL, fixtures, baseline discovery or database governance cycle
was repeated merely to reuse the existing Shopping tables.

Implemented:

- Library Add to Shopping List requires exactly one selected Recipe; zero or
  multiple selections disable it. Existing multi-select/delete/filter/Favorite
  behavior is retained.
- Detail offers Add to Shopping List, stays open after success, displays the
  confirmed added count and an explicit View Shopping List link. No automatic
  navigation or source Recipe mutation.
- Shared accessible native modal with responsive bottom-sheet positioning,
  labelled title, section fieldsets/legends, labelled checkbox rows, native
  keyboard focus containment, explicit Escape/Cancel and restored opener focus.
  The selected Recipe is freshly loaded when opening the picker.
- LF/CRLF/CR ingredient lines: omit whitespace-only lines, preserve every
  retained line verbatim, keep duplicate lines and section/line order, select
  all initially. Individual selection, Select all/Clear all and a disabled
  zero-selected Add are implemented. Cancel performs no Shopping write.
- Reuse Wave 1 categorization and existing Shopping storage. Each selected
  ingredient gets a distinct stable UUID and creates one new unchecked row;
  no merging/deduplication/reactivation of existing items.
- One array INSERT creates the complete selected batch atomically under the
  existing grants/RLS. No loop of independently committed inserts. Local
  PostgreSQL validation proves an invalid row rejects the complete batch and
  valid duplicate-text rows can be inserted as distinct unchecked items.
- The attempted UUID/text/category manifest is retained after submission.
  Failure reports no success, retains selection, freezes edits to that attempt
  and offers explicit retry. Existing UUIDs are reconciled through complete,
  count-checked keyset reads before inserting; a lost committed response
  resolves without another insert. Partial/different existing manifests fail
  closed. A duplicate-submit lock prevents simultaneous UI submissions.
  Cancelling an uncertain attempt warns to check Shopping before starting
  another addition; a new explicit addition is not treated as a retry.

Validation:

- Focused component/service/persistence/interaction/routing/production-static
  tests: **57 passed, 0 failed, 0 skipped**.
- Full configured suite: **383 passed, 0 failed, 1 optional pre-existing
  native-PostgreSQL skip** (384 total).
- Repository-wide ESLint, production main-app build and whitespace checks passed.
  Production build retains the existing large-chunk advisory.
- Actual isolated production-build browser at 1280px desktop and 375px mobile:
  zero/one/multiple Library selection, grouped five nonblank candidates,
  initial/individual/all/none selection, zero-selected guard, Cancel/Escape
  with no writes, focus return and forward/reverse Tab containment passed.
  An explicit Escape key handler was added after the initial browser check.
- Desktop Detail added only three selected lines (`  eggs ` and two `salt`
  rows), preserved raw whitespace/duplicates, applied categories, kept an
  existing checked item checked, stayed on Detail and confirmed success.
  View Shopping List navigated explicitly. The source Recipe remained exactly
  unchanged.
- Browser-injected failed request and committed-but-lost response retained
  selection/UUIDs. Retry added no duplicates: desktop three new rows used one
  batch INSERT; mobile five new rows used one additional batch INSERT.
  Mobile displayed no horizontal overflow with 44px minimum row/button targets,
  bottom-aligned responsive dialog and working zero-selection protection.
  Wave 1 Clear Checked still removed only the existing checked row.
- Browser transport was isolated synthetic data with external connections
  blocked; no production owner UAT or production-data mutation was performed.
  The local browser fixture was stopped after validation.

**Database Changes: None.** Existing Shopping migration/schema untouched.
Both SQL guards remain disabled and byte-identical; excluded cleanup SQL
untouched. Acceptance Workbook remains unchanged at SHA-256
`a5033efc216edae9f640b6e8d1b2aebb5da1b82d545c8562717620f131e4915b`.
Wave 2 owner acceptance and overall Phase 2 acceptance remain pending.

### Shopping Wave 2 owner UAT and acceptance

Owner report, 2026-10-30, for deployed Shopping Wave 2:

1. Recipe Library action: **PASS**
2. Ingredient selection: **PASS**
3. Add selected ingredients: **PASS**
4. Recipe Detail workflow: **PASS**
5. Mobile behavior: **PASS**

**Overall: PASS. Remaining functional issues: None.**

**Final owner disposition: Shopping Wave 2 accepted and complete.**

Release traceability: source commit
`3d453a6c62cce8071fcbaf96bc8cb4f4b767002c` pushed to dev; Pages release
`0e3b394c804e2fe2be6ae93c8514614d61f4bd4a` pushed to main.
All 19 live main-app publication files and root 404 matched the exact release
bytes. Recipe Library, Detail and Shopping deep links reached the normal owner
login boundary with valid assets and no runtime errors in technical smoke.
[Pages run 41101089251](https://github.com/wescooper06/HomeMaintenanceApp/actions/runs/41101089251)
still reported waiting at the last technical check; a final workflow success
conclusion is not inferred from live propagation or this owner report.

**UX follow-up:** Deferred until Meals functional pages are complete.
No Shopping UX redesign is initiated by this acceptance.

This report supersedes the pending Wave 2 owner-acceptance status above.
Wave 1 acceptance and its recorded preservation exception remain intact.
The owner's fifth result is recorded exactly as Mobile behavior; retry
protection retains P2-TECH-003 technical evidence and is not represented as a
separately reported owner retry test. No cleanup result was supplied, so none
is inferred. Overall Phase 2 workbook sign-off is not inferred.

No repeat UAT, schema/migration/fixture execution, production change,
deployment, Planner implementation or CR-4/6/7 work is part of recording this
result. Both SQL execution guards remain disabled. The Acceptance Workbook
is unchanged; no workbook status or sign-off is updated.

### Phase 3 Meal Planner Wave 1 - database authorization gate

Run **P3-DB-001**, 2026-10-30. Owner authorized Phase 3 kickoff and local
additive database preparation; stop before production SQL, commit or deployment.

**Shopping Wave 2 remains owner PASS, accepted and complete**, as recorded once
above. Additional owner note for the later Meals improvement pass:
Shopping works functionally, but cross-page UX/efficiency optimization is
deferred until the remaining Meals functionality is complete.
No Shopping UX work is included here.

#### Controlled scope and baseline

Read the current controlled Requirements v0.3, Implementation Plan v1.0,
Acceptance Checklist v1.0, update protocol and applicable findings history.
Requirements SHA-256:
`477dd50089025ad226554bd4d6d335f62f80d982caa10814d602cf600bedac68`.
Implementation Plan SHA-256:
`f900f2e6ba82af2687ca441103de1b5d5f301090717a2cc5b6d46614bd95d7e6`.

Remote heads verified: dev
`3d453a6c62cce8071fcbaf96bc8cb4f4b767002c`, main/Pages
`0e3b394c804e2fe2be6ae93c8514614d61f4bd4a`; the Wave 2 source is an
ancestor of main. Index empty. Application source matched the accepted release;
the sole starting tracked change was the pending Wave 2 acceptance record,
preserved without reset or commit. The starting worktree was not literally clean.

All **46 Phase 3 requirements** were extracted, including the architecture
gate. The workbook has **45 Phase 3 Functional Acceptance rows**, all Not Built,
and five Phase 3 E2E rows, all Not Built:

| Requirement IDs (inclusive ranges) | Controlled acceptance mapping |
|---|---|
| ARCH-011 | Coverage row 12, Implementation Review gate; no standalone functional Test ID |
| RD-FUNC-002; RD-STATE-002 | RD-FUNC-002-T01; RD-STATE-002-T01, Functional Acceptance rows 43 and 49 |
| PLAN-FUNC-001 through PLAN-FUNC-011; PLAN-DATA-001; PLAN-STATE-001 | Each corresponding `-T01` Test ID, Functional Acceptance rows 120-132 |
| WP-UI-001 through WP-UI-004; WP-FUNC-001 through WP-FUNC-012; WP-DATA-001; WP-VAL-001 | Each corresponding `-T01` Test ID, Functional Acceptance rows 133-150 |
| PM-FUNC-001 through PM-FUNC-012 | Each corresponding `-T01` Test ID, Functional Acceptance rows 151-162 |
| Recipe scheduling, Planner-first entry, occurrence management, Recipe deletion, Recipe rename | E2E-05, E2E-06, E2E-07, E2E-08, E2E-09 respectively |

Carry forward the tightly coupled RL-FUNC-020 / RL-FUNC-020-T01 scheduled-Recipe
delete warning (previously unbuilt), ARCH-010/012-015, DB-SEC-001 through
DB-SEC-012, DB-DATA-001, SEC-TST-001 through SEC-TST-010 and applicable responsive,
loading/error, duplicate-submit and mutation-retry requirements.
No workbook cells were changed.

#### Wave decision before application implementation

Select one coherent **Recipe/Weekly Planner meal-occurrence workflow**:
Recipe Detail scheduling and stay-on-Detail confirmation/View in Planner;
always-visible mapped meal rows; direct Recipe/free-text entry and title-only
picker; insertion-ordered mixed entries; occurrence View/Edit/Remove; Recipe
rename reflection and deleted-Recipe preservation. Defaults, date/meal choices,
duplicates, picker ordering/Favorite stars and validation follow the controlled
requirements above. Compact free-text editing is essential for preserved
occurrences; direct free-text entry reuses it instead of creating a micro-wave.

Reuse owner Auth, Recipe service/detail, Planner local date keys/week navigation,
PlannerProvider and WeeklyGrid/DaySlot. The repository and saved complete
production catalog have no meal-plan domain table; no fresh production
inspection is claimed. **A separate meal-entry table is required** by
ARCH-010/011 and WP-DATA-001. Task/project persistence cannot be repurposed.
No new calendar, duplicate Planner model or broker dependency.

Current changed files are this register, the narrow byte-preservation rule in
`.gitattributes`, four Planner SQL/review files and the new local persistence
test. After database authorization/verification, expected application surfaces
are RecipeCore, shared compact meal-entry controls, WeeklyGrid/Planner context,
a dedicated Meals persistence service, and their service/component/browser
fixtures. None is changed before this database gate.

#### Additive migration and local verification

Candidate: `supabase/review/202610300002_meals_planner.sql`.

- One `public.meals_planner_entries` table: UUID identity, local SQL date,
  Breakfast/Lunch/Dinner value, optional Recipe FK, preserved raw display text,
  database-managed timestamps and immutable identity-backed insertion order.
- Four indexes including PK, unique insertion order, week/meal/order lookup and
  Recipe FK lookup; one identity sequence, with all browser/service-role direct
  sequence privileges revoked. Owner INSERT with generated identity works;
  failed/rolled-back inserts may leave harmless sequence gaps.
- Four exact designated-owner CRUD RLS policies; anon/PUBLIC table access
  revoked; authenticated SELECT/DELETE plus only approved INSERT columns and
  UPDATE(display_text). No browser updates to identity/date/type/ordering or
  writes to operational timestamps.
- Two postgres-owned internal SECURITY INVOKER functions with empty search_path
  and no PUBLIC/anon/authenticated/service_role EXECUTE grants.
- Two new triggers: meal metadata/title snapshot validation, and a BEFORE DELETE
  trigger on existing Recipes. Capture current title before FK ON DELETE SET
  NULL preserves all occurrences atomically as editable text. Future linked
  display joins current Recipe title; deletion preserves the final renamed title.
- No migration-time Recipe/Shopping/task/project/Trips data changes; no new
  view, RPC, extension or default-privilege alteration. Existing Recipe functions
  are unchanged; the additive delete trigger/FK is the deliberate integration.

Local validation in PGlite/PostgreSQL:

- **22 focused tests passed**, including eight new Planner database tests and
  existing Recipe/Shopping persistence regression.
- Guards/collisions, exact catalog/ACL/RLS, owner CRUD, duplicates/order/dates,
  raw/nonblank text, atomic invalid batches, immutable metadata, occurrence-only
  removal and renamed-Recipe deletion preservation passed.
- Anonymous/nonowner/null/malformed-subject denial, internal EXECUTE/sequence
  denial and exact guarded fixture ROLLBACK passed. Independent postflight:
  zero fixture Recipes/entries and zero total meal entries. Existing local
  Recipe/Shopping data, unrelated sentinel rows and default ACLs unchanged.
  This is SQL-role/auth.uid()/RLS evidence, not JWT transport, fresh production
  preservation or native multi-session concurrency.
- Full configured suite: **391 passed, 0 failed, 1 pre-existing optional native
  PostgreSQL skip** (392 total). Repository-wide ESLint, main-app production
  build and `git diff --check` passed; existing large-bundle advisory only.
- Desktop/mobile browser fixtures, Planner UI/navigation/retry and owner UAT
  pending, not passed by database tests. Recipe/Shopping source/routing unchanged.

#### Exact production authorization package - NOT EXECUTED

Target only **home-maintenance-app / tawvchmjtkgykwwvnnnn**.
Execution attempt count for this new migration: **0**.

| Artifact | Disabled repository SHA-256 | In-memory enabled SHA-256 |
|---|---|---|
| `202610300002_meals_planner.sql` | `dbbb08ee673901b2f1a2fb937a2a0d9055fa37bc682aff4fb2024269c1f05604` | `28d061167d91fb7c8afe9ac8d9cd40c1230211210a33aa3ba6c4cc01120fe719` |
| `meals_planner_authorization_DISABLED.sql` | `3b97f4a10d698243dc971c11f083b961ff115614d3e7574a5c40d72dd1152c93` | `39e98792364dd3031b2687016ff68a98e19c0345c2ffdc8748c5ebc960ba4fb4` |

Both representations are UTF-8 without BOM, 116 CRLF line endings and a final
newline. Migration: 6,932 disabled / 6,931 enabled bytes. Fixture: 5,567 disabled /
5,566 enabled bytes. Enable only the single respective false-to-true guard in
memory; do not save an enabled copy. The narrow `.gitattributes` addition
preserves these review SQL bytes across future Git staging, as for Shopping.

Requested next authorization is bounded:

1. Confirm exact Dashboard project; run `meals_planner_preflight.sql` read-only.
   Require postgres, confirmed owner, expected postgres-owned RLS Recipe table/
   trigger, ordinary browser roles without memberships and zero collisions.
2. Load/verify and execute the exact enabled migration once via the established
   Dashboard UI; no blind retry or automatic reversal on error/ambiguity.
3. Capture `meals_planner_postflight.sql`; compare the complete catalog to the
   exact local contract above, including function definitions, policy expressions,
   effective grants/sequence denial, unchanged Recipe ACL/original trigger,
   added preservation trigger and zero initial meal entries.
4. Execute the exact enabled rollback-controlled fixture once. Require every
   assertion and final ROLLBACK to succeed; independently rerun read-only
   postflight for zero fixture/total meal entries and zero fixture Recipes.
5. Verify the narrowly affected Recipe behavior/catalog and unchanged Shopping/
   Planner/project surfaces; review new Meals-related Security Advisor findings.
   Stop on unexpected differences, uncertain rollback/cleanup, execution/catalog
   errors, material security findings or the owner's storage/Git-object monitor.
   No Shopping migration re-verification, Shopping fixture rerun or automatic repair.

Production execution/inspection was not performed for this kickoff. Migration
and fixture guards remain false. Existing Shopping migration and fixture remain
byte-identical and disabled; excluded cleanup SQL untouched. Index remains
empty; **no source commit, push or deployment**. Acceptance Workbook SHA-256
remains `a5033efc216edae9f640b6e8d1b2aebb5da1b82d545c8562717620f131e4915b`.
No CR-4/6/7, Recipe Import or UX redesign. Owner UAT and application
implementation/validation/release remain pending after database authorization;
no next Planner wave has started and no Final Decision is changed.

### Phase 3 Meal Planner Wave 1 - production database verified

Run **P3-DB-002**, 2026-10-30. Owner authorized the exact migration and
rollback-controlled fixture against **home-maintenance-app /
tawvchmjtkgykwwvnnnn**, stopping before application implementation, commit or
deployment. This supersedes the pending production execution status in
P3-DB-001, not its controlled scope or application/owner-UAT pending status.

- **Preflight PASS:** Dashboard project identity confirmed; postgres executor,
  confirmed designated owner, ordinary anon/authenticated roles without
  memberships, expected postgres-owned RLS Recipe table and original trigger,
  zero Planner namespace collisions.
- **Migration PASS, one execution:** exactly one active editor model, 6,931
  UTF-8 bytes without BOM, 116 CRLF endings/final newline, byte equality and
  authorized enabled SHA-256
  `28d061167d91fb7c8afe9ac8d9cd40c1230211210a33aa3ba6c4cc01120fe719`
  verified before invoking the existing Run control once. Dashboard returned
  **Success. No rows returned**. No RLS confirmation dialog appeared.
  No execution retry, SQL supplementation, repair or reversal.
- **Postflight/RLS PASS:** HTTP 201; every prepared catalog field matched an
  independently generated local contract, normalizing only ACL privilege
  character ordering and CRLF in catalog strings. Exactly one table, four
  indexes, four exact-owner policies, one ordering sequence, two internal
  SECURITY INVOKER functions, two triggers and zero initial meal entries.
  Ownership, columns, constraints, index state, function definitions/ACL/config,
  sequence/effective grants, existing Recipe ACL/original trigger and the
  approved additive Recipe-delete trigger all matched.
- **Fixture authorization PASS, one execution:** editor and actual Dashboard
  request both matched enabled SHA-256
  `39e98792364dd3031b2687016ff68a98e19c0345c2ffdc8748c5ebc960ba4fb4`
  (5,566 UTF-8 bytes, 116 CRLF endings/final newline). The existing destructive
  operation warning was confirmed with Run query once; no SQL rewrite.
  HTTP 201 returned `PASS - ROLLBACK follows` for the exact full BEGIN-through-
  ROLLBACK request. Owner CRUD/duplicate ordering, anonymous denial,
  non-owner/null/malformed-subject denial, renamed Recipe deletion and editable
  preserved occurrences passed. Claims are SQL-role/auth.uid()/RLS, not JWT
  transport or native multi-session concurrency.
- **Independent cleanup PASS:** a separate postflight request returned HTTP 201,
  zero fixture Recipes, zero fixture meal entries and zero total meal entries.
  The complete postflight catalog was unchanged after the fixture.
- **Targeted preservation PASS:** identical repeatable-read read-only snapshots
  before migration and after fixture rollback matched count and complete
  sorted row fingerprints for all 14 targeted Recipe/classification, Shopping,
  Planner task/profile/parking and project/registry tables. Existing six Recipes,
  28 Shopping categories and eight Shopping items were unchanged; no private
  row content was exported. Auth instances, database-role configuration and
  auth.uid() definition hashes were unchanged. The exact executed migration
  contains no Auth-configuration write and no Auth settings were changed.
  This is targeted preservation, not a broad Auth audit or the old generic
  139-object comparison.
- **Fresh Security Advisor PASS:** Refresh and Rerun linter completed; zero
  errors, the same one pre-existing leaked-password-protection Auth warning
  and the same ten pre-existing no-policy informational rows. No new Shopping
  or Meal Planner finding. No unrelated security remediation.

Production evidence summary is retained in session file
`planner-wave1-production-20261030T1847.json`. Repository migration and fixture
remain disabled at their P3-DB-001 hashes. Both Shopping SQL hashes and the
Acceptance Workbook hash remain unchanged; excluded cleanup SQL untouched.
Index empty; no commit, push, deployment or application implementation.

**Production meal-entry schema ready: YES. Application deployed: NO.**
Next authorization: implement the controlled Planner Wave 1 application,
desktop/mobile validation and subsequent source/Pages release. Owner UAT
remains pending; no next wave, UX redesign or workbook Final Decision change.

### Meal Planner follow-up - drag/drop rescheduling

Owner-requested post-Wave-1 enhancement, 2026-10-30:

In the Weekly Planner, drag and drop a scheduled meal from one day to another,
similar to the existing task drag/drop interaction. The same Recipe-backed or
free-text occurrence remains; only its scheduled date changes. Persist after
a successful drop; failed persistence must not leave a false move displayed.
Desktop drag/drop and an appropriate touch-accessible mobile rescheduling
interaction are required.

**Deferred beyond Wave 1; requirements/schema review required.** The verified
Wave 1 schema is unchanged, with no date-update grant or rescheduling UI.
Wave 1 owner UAT check is **Edit / remove occurrence**, not move.
This functional enhancement is separate from the later cross-page Meals
UX/efficiency pass, which remains deferred until Meals functional pages are
complete. No next Planner wave or UX redesign is authorized by this note.

### Phase 3 Meal Planner Wave 1 - application validation / owner UAT pending

Run **P3-TECH-001**, 2026-10-30. Owner authorized application implementation
against the P3-DB-002 verified schema, explicit source commit/dev push and the
established main-app Pages publication after validation. This supersedes the
application-implementation authorization pending status above, not owner UAT.
Shopping Wave 2 remains **owner PASS, accepted and complete**; its later
cross-page Meals efficiency/UX pass remains separately deferred.

**Controlled scope implemented:** ARCH-011 gate; RD-FUNC-002, RD-STATE-002;
PLAN-FUNC-001 through 011, PLAN-DATA-001, PLAN-STATE-001; WP-UI-001 through 004,
WP-FUNC-001 through 012, WP-DATA-001, WP-VAL-001; PM-FUNC-001 through 012;
coupled RL-FUNC-020 scheduled-entry deletion warning. This is the previously
extracted 46-requirement Phase 3 scope / 45 Functional Acceptance rows and
E2E-05 through E2E-09, with inherited responsive/security/data/error controls.
No workbook statuses or Final Decision have been changed.

- Recipe Detail Plan Meal defaults to local today / Dinner, accepts past and
  future dates and all three meals, allows distinct duplicate occurrences,
  stays on Detail after adding and confirms date/meal. Explicit View in Planner
  opens the correct week through existing routing and date navigation.
- Always-visible Breakfast/Lunch/Dinner rows map to Morning/Afternoon/Evening.
  Recipe-backed and verbatim nonblank free-text meals share persisted insertion
  order; task cards/storage remain separate. Direct slot entry offers Recipe
  and Free text without an intermediate choice menu. Recipe picker is
  alphabetical, title-only case-insensitive substring search, with Favorite
  indicators but no Favorite-first ordering.
- Linked occurrences show current Recipe titles and View Recipe / Remove.
  Plain-text occurrences offer Edit / Save / Cancel / Remove. Remove affects
  only that occurrence, with no confirmation. Recipe deletion warning applies
  to shared Library/Detail deletion; the verified database trigger preserves
  current titles as editable text with no Recipe link.
- Stable UUID additions reconcile uncertain responses without duplicate
  inserts; edit/delete use updated-at guards and retry reconciliation.
  Failed writes retain displayed entries/drafts; failed reads are explicit,
  retryable and never shown as a successful empty list.
- Reused existing week/date/grid, navigation, task drag/drop, Recipe CRUD,
  complete Recipe loading, owner boundary, Supabase client and native dialogs.
  Shared date helpers now preserve four-digit years 0001-0099 instead of
  JavaScript's constructor remapping them into 1900-1999.

**Validation evidence:** focused Planner/persistence/Recipe/Shopping/routing
selection passed (97 tests before the additional early-year regression).
Final full configured suite: **401 passed, 0 failed, 1 pre-existing optional
native PostgreSQL skip (402 total)**. Lint, production main-app build and
whitespace checks passed; release hashes are retained with the session release
evidence. The existing optional native PostgreSQL test is skipped when
its configured binary is absent; the existing large-chunk build warning remains.

Actual production-build desktop (final 1440x1000) and 390x844 mobile fixtures exercised real
Planner/Recipe UI, service paths and isolated persisted test transport:
today/Dinner defaults; past/future scheduling; explicit correct-week navigation;
all meal rows; mixed entries and duplicate ordering; title-only picker/Favorite
indicator; free-text edit/cancel/remove; current renamed title; deleted Recipe
occurrences becoming editable unlinked text; reload persistence; failed
edit/remove retention and retry; lost-insert-response retry yielding one meal;
failed initial load with no false empty and successful Retry; week navigation;
native modal focus trap/Escape/opener restoration; 44px meal-action targets.
The final build additionally scheduled 0001-01-01, opened that exact Planner
week and retained a direct mobile meal after reload, without application alerts.
Existing task row stayed byte-identical beside meals; task drag/drop regression
coverage passed. Mobile page-width overflow was unchanged with meal rows
removed (existing Planner layout); meal controls wrap and the existing grid
retains its horizontal scroll. This is no Shopping/Planner UX redesign.
Recipe-to-Shopping ingredient selection/add/navigation also passed in the
mobile fixture. Isolated CSP intentionally blocks external fonts/Google/weather;
no production Auth session or data mutation was used for browser validation.

**Database changes: None during application implementation; previously verified
Planner Wave 1 schema reused.** No production SQL/fixture rerun or migration
modification. Both Planner SQL guards remain disabled; both Shopping guards,
the controlled workbook and excluded cleanup SQL remain untouched.

Owner UAT is **pending** after publication: Recipe scheduling; Weekly Planner
meal display; Free-text / direct meal entry; **Edit / remove occurrence**;
Mobile + Recipe-link behavior. No owner migration/security/failure-injection
retest. Drag/drop/touch rescheduling remains the separate post-Wave-1
requirements/schema-review enhancement above. No next wave, Recipe Import,
CR-4/6/7 or UX redesign.
