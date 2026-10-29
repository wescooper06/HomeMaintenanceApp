# Meals controlled implementation

## Authority

1. [Requirements v0.3](Meals_Module_Product_and_Functional_Requirements_v0.3.docx): product behavior.
2. [Implementation Plan v1.0](Meals%20Implementation%20Plan%20v1.0.docx): sequencing, scope, and responsibilities.
3. [Acceptance Checklist v1.0](Meals%20Acceptance%20Checklist%20v1.0.xlsx): test/evidence ledger, owner UAT, and sign-off.
4. [Workbook Update Protocol](Acceptance%20Workbook%20Update%20Protocol.md): mandatory update and preservation rules.

Do not revise requirements to match an implementation. Update the existing workbook, not a regenerated copy.

## Phase 0A boundaries

The shared responsive shell provides top-level Meals navigation, Recipes/Shopping links, and explicit `/meals/*` routing beneath the existing exact-owner authentication boundary. `/meals` redirects to `/meals/recipes`. Recipe Library, Add Recipe, Recipe Detail, and Shopping display explicit non-data-backed placeholders. Unknown Meals paths stay in Meals; Import is not implemented.

Recipe CRUD/persistence, Shopping behavior, meal-plan persistence, Planner changes, and Import remain out of scope.

**Phase 0A Database Change: None.** No database/API authorization result for future Meals objects is implied by shell tests. Object-level security/catalog tests remain outstanding.

The shell has no dependency on the abandoned broker architecture. Broker cleanup and managed-default remediation remain separate workstreams.

## Routing and deployment

- Local development: `/meals`, `/meals/recipes`, `/meals/recipes/new`, `/meals/recipes/:id`, `/meals/shopping`.
- Existing GitHub Pages application base: `/HomeMaintenanceApp/www/trips`.
- Example hosted URL: `/HomeMaintenanceApp/www/trips/meals/recipes`.
- Existing module hash links and standalone Activity Planner navigation remain supported.
- The repository-root [404 page](../../404.html) redirects **only** missing `*/www/trips/meals` paths to the existing `index.html` entry with an encoded destination.
- [Entry recovery](../../src/router/mealsDeepLink.js) restores the same-origin, same-module path/query/hash before the router mounts. Initial relative assets load from the real entry directory; lazy imports remain relative to their built module URLs.
- Other missing paths remain 404s. This is not a global SPA fallback or a hosting redesign.
- Deployment must include the root 404 page and a fresh normal application build together. Neither deployment nor generated-asset publication was performed in this task.
- A static host must serve the root 404 page for missing paths (as GitHub Pages does). A custom host without this behavior needs equivalent Meals-scoped configuration.

Normal production build remains `npm run build`. During Phase 0A validation both configured Vite builds were directed to session-only output, and in-memory builds were used in tests, to honor the prohibition on modifying repository-generated web assets.

## Safe workbook updater

[update-meals-workbook.ps1](../../scripts/update-meals-workbook.ps1) requires Windows, Microsoft Excel COM, an explicit update-plan JSON file, and the expected current SHA-256.

```powershell
Get-FileHash -LiteralPath 'spec\meals\Meals Acceptance Checklist v1.0.xlsx' -Algorithm SHA256
powershell -NoProfile -File scripts\update-meals-workbook.ps1 `
  -UpdatesPath C:\reviewed\technical-update.json `
  -ExpectedSha256 <reviewed-current-hash>
```

Example plan:

```json
{
  "testRunId": "P0-TECH-001",
  "updates": [{
    "sheet": "Functional Acceptance",
    "id": "NAV-001-T01",
    "fields": {
      "Status": "Ready to Test",
      "Tested Date": "2026-10-28",
      "Evidence / Build Reference": "spec/meals/README.md#phase-0a-technical-evidence",
      "Defect / Notes": "Technical checks passed; owner UAT remains."
    }
  }]
}
```

Use `-ValidateOnly` to validate plan syntax/field authority without opening or editing Excel. It does not validate workbook IDs or the supplied hash against a file.

The updater:

- Finds ledger rows by stable ID and columns by exact header; rejects missing/duplicate IDs, unknown fields, formulas supplied as input, and stale hashes.
- Whitelists technical fields only; never edits Summary, Coverage, IDs, intent, steps, expected results, or owner decisions.
- Permits functional/E2E status changes only from Not Built to Ready to Test. Technical security/database rows may record executed Pass/Fail/Blocked or slice-specific N/A with evidence.
- Refuses existing results and nonempty technical fields rather than overwriting prior runs/notes. A retest or change to an already populated field requires separately reviewed handling under the protocol; it is not silently reset.
- Requires evidence on every updated row; the operator remains responsible for actually executing the claimed checks.
- Creates a temporary exact recovery copy; compares protected cells/formulas/styles, worksheet identities, tables, row/column layout, panes, validation, conditional formatting, and merged layout after saving.
- Keeps updated rows at their original effective heights so wrapped technical notes cannot auto-fit the controlled layout. Excel may mark those unchanged heights as explicitly fixed (`customHeight`); this is layout-preservation metadata, not changed test content.
- Checks formula errors and Coverage pointers, normally reopens in Excel, and recalculates.
- Restores original bytes if post-save integrity verification fails. This is workbook recovery only, not production rollback.
- Emits before/after hashes and the exact cell change report. Keep that output as execution evidence.

The controlled workbook is not modified by the automated tooling tests; those tests use an isolated temporary copy. Excel-specific tests are explicitly skipped on non-Windows systems.

## Future database/security gate

The [Phase 0B Recipe Persistence Design](Phase%200B%20Recipe%20Persistence%20Design.md)
records the proposed Recipe-only model, repository-canonical LF executable migration candidate, disabled reversal, local tests and future
production verification gates. It is a review draft, not a deployed schema or
Phase 1 acceptance; it does not change the accepted Phase 0A workbook baseline.

Before any Phase 0B/1 object is implemented, prepare its justified object inventory and operation matrix. The required reusable review checklist is:

1. Source-controlled migration; expected owner normally `postgres`; no speculative future-phase objects.
2. Explicit PUBLIC/anon revocations and only required authenticated operations.
3. Explicit RLS and operation-specific policies for the exact human owner.
4. Direct table operations preferred; no unnecessary CRUD RPCs. Functions normally SECURITY INVOKER; SECURITY DEFINER needs separate review.
5. Explicit view/sequence/function security review when such objects actually exist.
6. Local anon/owner/non-owner authorization tests plus source/build secret and broker checks.
7. Read-only target/catalog preflight, prepared verification and reversal strategy, exact production authorization, execute once, and stop on error.
8. Post-deployment catalog verification, owner smoke, Security Advisor review, workbook evidence, and separate owner sign-off.

No SQL template, migration, production action, or broker cleanup is authorized by this checklist.

## Responsibilities

- **COPILOT:** implementation, repeatable technical tests, build/lint, evidence, safe workbook updates.
- **USER AUTHORIZATION:** exact future production-changing operation or deployment when separately requested.
- **MANUAL:** unavoidable direct browser sign-in if needed; never provide credentials to automation/chat.
- **VERIFY:** owner visual/usability UAT, known-issue approval, and Phase Final Decision.

## Phase 0A technical evidence

Run ID: **P0-TECH-001**, 2026-10-28. Working branch: `dev`; base commit `07fee6170fd48880d4bde57e13d05e65c3cbbc0c`. This records local, uncommitted implementation, not a production release or acceptance.

### Executed checks

- Focused Meals routing, static-host, workbook and navigation/authentication/Vite regressions: **42 passed, 0 failed, 0 skipped**.
- Full configured suite: **313 passed, 0 failed, 1 pre-existing optional real-PostgreSQL integration skip** (314 tests; `WORKBENCH_TEST_PG_BIN` is not configured).
- `npm run lint`: passed.
- Main and standalone Activity Planner production configurations: passed with session-only output; existing large-chunk warnings remain.
- In-memory real production build: required Meals routes/chunk and owner UUID present; no broker identifiers, privileged JWT, secret-key literal, or test Auth fixture bundled.
- Static HTTP fixture supplies real 404s, not a dev-server/SPA fallback. All five approved Meals path shapes recover through the canonical entry and valid JS/CSS assets.
- Browser technical checks using the real owner boundary/controller with a **test-build-only synthetic Auth transport**: logged-out and non-owner denial, designated-owner entry, `/meals` redirect, Recipes/Shopping switching, nested direct navigation/refresh, sign-out and reload denial.
- At 1280px and 375px widths: no horizontal overflow on the four shell screens, correct parent/internal active states, and 44px internal navigation targets. Desktop/mobile screenshots inspected; owner visual/usability judgment remains.
- Browser fixture blocks outbound connections via CSP. Initial browser request interception was ineffective before this fixture was introduced: synthetic invalid login attempts reached the existing Auth endpoint and failed. No real credentials were used, no application-data operation was performed, and no production configuration was changed. Do not treat those attempts as production smoke-test evidence.
- Workbook updater rejects unsafe plans and existing-result overwrites; isolated-copy Excel save/reopen and package-preservation tests passed.
- **MEALS-DEF-001 (closed):** initial updater date marshaling failed before saving; the first fully populated update was also rejected because Excel auto-fitted wrapped notes. Original workbook bytes were preserved/restored by the guard. The numeric Excel date now uses the COM VARIANT property setter, and original effective row heights are retained. The isolated-copy regression includes a tested date and long wrapped notes. Recorded on NAV-001-T01's execution evidence because these failures occurred during technical/UAT preparation, not in Meals navigation itself.

Detailed runner logs, browser observations, workbook baseline/cell-change output and before/after hashes are retained in the session evidence directory, not mixed into source or private incident exports.

### Acceptance disposition

- Ready to Test: NAV-001-T01, NAV-002-T01, NAV-003-T01, NAV-004-T01, NAV-009-T01, RESP-001-T01-D, RESP-001-T01-M, E2E-00.
- Technical Pass: ARCH-001-T01, ARCH-006-T01, ARCH-007-T01, ARCH-008-T01, SEC-TST-006-T01, SEC-TST-009-T01 (source/build scope; no new catalog objects).
- Other object-level/database/post-release tests remain Not Built/outstanding. Shell denial tests do not establish future data-layer RLS.
- No Pass with Known Issue or owner Final Decision assigned. No persistent Phase 0A defect remains.
- Persisted update: 14 rows / 70 technical cells; all 892 formulas, five tables, existing validation, Coverage pointers and owner fields preserved. Workbook SHA-256 before: `dd68f00a29d6926cb28670068af5b5007ecdaf74e7766e1dbc954245338264d7`; after: `78b87fd17c0fcbc49cd5e65fdb25407993042599d8fc89cb394890e5074b2d69`. Calculated supporting counts change automatically; owner-controlled Sign-Off values do not.

### Owner UAT

Use a reviewed local build or separately authorized deployment. Check the seven functional rows and E2E-00 on desktop/mobile, including direct refresh beneath the actual deployment base. Confirm placeholder clarity, navigation, focus/touch behavior, existing module regression, logged-out/non-owner denial and logout/refresh. No Meals test data requires cleanup; sign out of the test session.

Actual owner credentials must be entered directly in the browser, never in task JSON, commands, environment variables, chat, source, or evidence. The synthetic browser transport is only enabled by the test fixture CLI (`node scripts\meals-static-fixture.cjs 5197 --synthetic-auth`), never by a production app setting.

Phase 0A is **not accepted** until the owner completes applicable UAT and records Phase Sign-Off.

## Web release validation

The authorized Phase 0A web release reran the P0-TECH-001 technical checks before committing: focused tests 42 passed; full suite 313 passed, no failures, one existing optional PostgreSQL skip; lint passed. The normal `npm run build` produced both production entries and published the main output locally. No mobile/Capacitor or database action is included.

The exact generated output was inspected for privileged secrets, broker references, private/unrelated files and synthetic Auth inclusion. Main published files matched the main build byte-for-byte; entry and lazy-asset references resolved. All five Meals path shapes recovered through the exact root fallback and generated entry on a 404-only static HTTP fixture, retaining the repository prefix, query/hash and valid relative assets.

An isolated native Edge browser also loaded these exact disk files through the real 404 recovery flow. All five routes and nested refreshes retained the logged-out owner boundary. With local-only synthetic session responses and every external request intercepted or blocked, the same unchanged output rendered the approved owner placeholders, canonical redirect, Recipes/Shopping links and existing Trips navigation. Removing the synthetic local session hid the private UI. This is isolated technical testing, not production owner authentication.

Release validation evidence is retained as `meals-release-focused.log`, `meals-release-full.log`, `meals-release-lint.log`, `meals-release-build.log`, `meals-release-manifest.json`, `meals-release-static-result.json`, and `meals-release-native-browser-result.json` in the session evidence archive. The six passing technical security rows append this section to their existing evidence references without changing statuses, prior evidence, notes, or owner UAT decisions.

This section records pre-publication technical evidence, not successful live deployment or owner acceptance. Actual commit IDs, Pages deployment results and live smoke outcomes belong in the release handoff evidence after publication. Owner UAT rows remain Ready to Test.
