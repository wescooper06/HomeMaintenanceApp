# Meals controlled implementation

## Authority

1. [Requirements v0.3](Meals_Module_Product_and_Functional_Requirements_v0.3.docx): product behavior.
2. [Implementation Plan v1.0](Meals%20Implementation%20Plan%20v1.0.docx): sequencing, scope, and responsibilities.
3. [Acceptance Checklist v1.0](Meals%20Acceptance%20Checklist%20v1.0.xlsx): test/evidence ledger, owner UAT, and sign-off.
4. [Workbook Update Protocol](Acceptance%20Workbook%20Update%20Protocol.md): mandatory update and preservation rules.

Do not revise requirements to match an implementation. Update the existing workbook, not a regenerated copy.

## Phase 0A boundaries (historical accepted scope)

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
records the Recipe-only model and the deployed Phase 0B foundation verification
(section 28), including the exact executed LF migration hash, captured production
evidence and controlled workbook results. Reversal remains disabled. Recipe UI,
live owner Recipe application/API verification and Phase 1 acceptance remain
outside this database-foundation completion; Phase 0A acceptance is unchanged.

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

## Phase 1 Recipe Core candidate

Run: **P1-TECH-001**, 2026-10-29 UTC, branch `dev`, baseline
`86452871db7f62b5c667ef32180d27ef2fe4ab24`. This is a local application candidate,
not a deployed release, production owner/API smoke result, or Phase 1 acceptance.
The historical Phase 0A scope above remains accepted; its Recipe placeholders
are replaced only in this candidate. Shopping remains an explicit placeholder.

### Implementation and requirement mapping

| Requirements | Implementation / focused evidence |
|---|---|
| NAV-005/006; NAV-001..004/009 regression | Add, detail and edit routes; Meals routing, static-host and owner-auth tests |
| RL-UI-001..003; RL-FUNC-001..012/016..019; RL-STATE-001/002 | Compact desktop table, simplified mobile list, independent Favorite star, row navigation, selection and confirmed bulk delete; Recipe service/interaction tests and isolated browser checks |
| RD-UI-001..005; RD-FUNC-003..005 | Single-scroll detail, ordered sections, preserved text, safe HTTP(S) Source links versus plain text, Favorite/Edit/confirmed Delete; Phase 2/3 actions explicitly unavailable |
| RE-UI-001; RE-DATA-001..007; RE-FUNC-001..015; RE-VAL-001 | Shared Add/Edit, Title-only validation, reusable classifications, named multiline sections, save/cancel/retry and unsaved-change protection |
| RESP-002/003; STATE-001..005/007 | Responsive controls, loading/retry, empty versus zero results, mutation locks, retained failed drafts, explicit errors and destructive confirmation |
| ARCH-001..007/012..014; SEC-TST regression | Existing client/owner boundary, direct table access, unchanged deployed SQL, PGlite role tests and normal-build inspection; no new RPC or privileged client |

`RL-FUNC-013..015`, `RD-FUNC-001/002`, Shopping and Planner workflows are not
implemented. `RL-FUNC-020` scheduled-occurrence preservation remains a **Phase 3
integration constraint**: this database has no meal-plan domain yet. Its workbook
row is not promoted, and no Phase 3 objects or misleading preservation claim
are introduced. Recipe Import remains Decision Pending.

The [Recipe service](../../src/services/recipeService.js) uses the existing
`getSupabaseClient`. Recipes, Categories and Cuisines use ascending UUID keyset
reads of up to 500 records until an **empty** page, including when a server caps
responses below 500. The first request obtains an exact count; duplicate/out-of-
order IDs and count drift reject the load. Failed pages never produce a partial
success. Local service requests are serialized across complete loads and writes.
Cross-device reads are not a database snapshot; same-count concurrent edits may
still need a reload. No snapshot isolation is claimed.

Search runs on the complete library: literal `toLowerCase().includes()` over Title
OR section text, AND Category UUID, Cuisine UUID and Favorite. `%`, `_` and
backslash are not wildcard controls. Desktop Name/Category/Cuisine/Source headers
toggle ascending/descending order, with stable UUID ties. Mobile has no separate
A-Z control. Changing criteria clears selection to avoid deleting hidden rows.

Recipe content is never trimmed, parsed or deduplicated. JSONB section order and
blank lines are preserved; removing every section stores `[]`. No unrequested
section-reordering interface is added. Only classification names use
`String.trim()`, matching the deployed canonicalization. Renames retain lookup
IDs; referenced deletion reports the FK failure, without reassigning Recipes.
Classification changes save immediately and can leave valid unused lookup values
if a subsequent Recipe save is canceled or fails.

Each Recipe save is one complete row INSERT/UPDATE. New editors retain one UUID
through retries and reconcile an existing identical row before another INSERT,
preventing duplicate Recipes after an uncertain response. Conflicting content
under that UUID fails explicitly. No upsert, client timestamp write, silent
failure or success-shaped fallback is used. Favorite persists independently.
One DELETE statement handles the selected IDs, verifies the exact affected count
and returned-ID membership (including server-capped RETURNING data), and does not
delete classifications. Failed deletion remains visible inside its
confirmation dialog; cancel/reload permits reconciliation if another device
already removed a selected record.

The root router now uses React Router's data-router equivalent beneath the
unchanged owner boundary so `useBlocker` can protect links and browser Back/Forward.
Its basename, module resolution and lazy routing are unchanged. Router creation
itself occurs only after the owner boundary mounts its children; the page-lifetime
router is reused across StrictMode initializer replays. The editor also
registers native `beforeunload` protection. Staying retains the draft; discard is
explicit. Pending writes prevent duplicate submission and deliberate discard
until the request settles. Owner logout/session revocation still takes precedence.

### Phase 1 technical evidence and limitations

Focused command:

```powershell
node --test tests\meals-recipe-service.test.cjs tests\meals-recipe-interaction.test.cjs tests\meals-routing.test.cjs tests\owner-auth.test.cjs tests\meals-recipe-persistence.test.cjs tests\owner-rls.test.cjs
```

Result: **45/45 passed**. The service tests use the exact deployed migration
inside disposable PGlite and an explicit Supabase-shaped adapter; they are not
live PostgREST/JWT tests. They exercise owner CRUD, exact text/JSONB round trips,
lookup lifecycle, referenced-delete refusal, capped pagination, drift/failure
propagation, non-owner denial, literal search, AND filters and sorting. Existing
persistence tests retain all collision, RLS/ACL, canonicalization, timestamp,
catalog and disabled/empty-reversal assertions. Reversal tests run locally only.

Component-handler tests execute actual compiled Recipe components with isolated
hook/service adapters, following the repository's existing test conventions.
They cover validation, section editing, failed-save retention/retry, synchronous
duplicate-submit prevention, dirty/clean navigation decisions, Favorite event
propagation, confirmation callbacks, loading, failure/retry and zero results.
These are not a claim of full DOM rendering or owner usability acceptance.

The isolated production-build browser fixture uses synthetic Auth and session-only
Recipe storage with `connect-src 'none'`. Desktop and 390px mobile checks exercised
create/view/edit, preserved blank lines, Source link, classification create/rename,
referenced-delete refusal, unused deletion, Favorite without navigation/reload
persistence, combined literal search/filters, empty/zero results, failed-save
retry, unsaved link/Back stay/discard, deep refresh, confirmed bulk deletion,
and deletion-error visibility/retry. All fixture records were removed; no live
Recipe data was created. Expected fixture CSP blocks of external fonts/Google
scripts are not production authentication evidence. Hidden browser-tab stability
timeouts were resolved with DOM-targeted activation for the final incremental
checks; these do not constitute mobile touch usability sign-off.

The normal main and standalone Activity Planner production builds are written
only to session output, not published into tracked web assets. Both builds pass
secret/broker/synthetic-fixture inspection. Existing >500kB chunk warnings remain
informational. Full configured suite: **337 tests, 336 passed, 1 skipped, 0 failed**.
The existing optional native PostgreSQL deployment test requires
`WORKBENCH_TEST_PG_BIN`; its skip is unrelated to Meals. Full lint passes.
Full-suite/lint output, artifact hashes and exact workbook changes are retained
in the session `phase1-*` evidence.

The controlled workbook update retains 7 sheets, 5 tables and 892 unchanged
formulas. It changes 324 approved literal cells across 81 rows:
68 functional rows, 10 security rows and E2E-01/02/10. Eighty rows are
**Ready to Test**, not owner Pass; the sole new technical Pass is **ARCH-014-T01**
(executed local source/invoker/no-new-callable-function evidence). Nine composite
security/application/API rows await later verification. `RL-FUNC-020` and all
database rows are unchanged. 165 Summary/Coverage caches recalculate without
formula changes; effective row heights, styles and protected structure are
preserved through normal Excel reopen. Phase 0A Accepted, every Phase 0B
database result, all prior owner results/notes and Phase 1 Final Decision remain
unchanged. The disposable guard initially rejected an attempt to populate the
already-existing E2E-10 cleanup note; the revised plan leaves that note untouched,
and both disposable and controlled preservation checks passed.

Workbook before SHA-256:
`563ac8035cbe7418f9da37b0b1c67061ffcbb00094533eebc6af92edfa719e6b`.
Workbook after SHA-256:
`0b31ac9abc0017ddaafa266097dfc23900e64350da3a940ef90d9475dcf9a247`.
Post-update workbook tooling regressions: **5/5 passed**.

Live **existing Phase 0A release** read-only checks covered `/meals`, the library,
new Recipe, a synthetic detail URL and Shopping, including refresh. All recovered
their exact deep links and showed the owner login boundary. No credentials were
entered, no live Recipe API call was exercised, and this does not prove deployment
of the local Phase 1 candidate.

### Phase 1 E2E preparation and deterministic cleanup

Execute both desktop and mobile UAT after authorized deployment. Use a unique
`P1-UAT-<run>` prefix; record the exact created Recipe and lookup IDs. Do not select
or delete pre-existing owner data. Never clear the production library.

| Scenario | Steps / expected result |
|---|---|
| E2E-01 | Create a manual Recipe with Title, ordinary-text Source, two named ingredient blocks including a blank line and repeated lines, and multiline Instructions. Search/open it, toggle Favorite without leaving Library, reload, open Detail, edit/save, confirm exact text/order, then cancel and confirm Recipe deletion. Repeat with an HTTP(S) Source and confirm safe link presentation. Also force a local fixture save error, verify retained input and successful retry, and exercise stay/discard on a dirty editor. |
| E2E-02 | Create three prefixed Recipes with contrasting Category/Cuisine/Favorite values and literal `%`, `_`, backslash ingredient text. Search by mixed-case Title and ingredient substrings; verify excluded fields do not match. Apply all criteria together and verify AND; clear one at a time, verify zero results versus true empty, and exercise all desktop sort headers in both directions. Verify the mobile list has no desktop table or A-Z control. |
| E2E-10 | Create uniquely prefixed Category and Cuisine in the editor, save a Recipe using both, verify availability in another editor, rename each and verify existing Recipe display changes. Referenced deletion must fail visibly; reassign both to None/save, then delete the unused values. Repeat duplicate/blank-name failure checks without losing Recipe text. |

Cleanup in dependency order: remove only the run's confirmed Recipe IDs, then
its now-unused Category/Cuisine IDs. Verify every created ID is absent, clear
filters/selection and record the result. Do not remove a lookup that another
Recipe now references; stop and report that cleanup conflict. No Shopping or
meal-plan cleanup should be needed because these scenarios do not create them.
For local synthetic reruns, stop the fixture and clear only
`meals-recipe-synthetic-data`, `meals-recipe-test-control`, and
`meals-synthetic-test-user` on its loopback origin, never production storage.

### Phase 1 release boundary

No schema, grants, RLS, configuration or production data change is performed.
The deployed migration remains byte-identical:
`5a741e8ccd0a0a74078fb07890af47ed0d2a74f2aeaafbc608559231f3959c27`.
It must **not** be rerun. Reversal remains **NOT AUTHORIZED**.

Source changes remain unstaged; no commit, push or deployment is performed.
Review the explicit source/test/document/workbook allowlist before any release.
A later authorized release must rebuild/publish normal assets (never the
synthetic fixture), review the exact output, deploy through the existing
workflow, and then perform live owner Recipe CRUD/API smoke and owner UAT.
Production security/composite smoke rows cannot be inferred from local fixtures.
Phase 0A Accepted and all Phase 0B evidence are protected; Phase 1 Final Decision
remains owner-controlled and unchanged.

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
