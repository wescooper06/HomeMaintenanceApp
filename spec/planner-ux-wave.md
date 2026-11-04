# Planner UX Wave

## Design authority

The approved direction is [Life_Manager_UX_Proposal_v2.pptx](https://1drv.ms/p/c/75085d2d82ac01f9/IQDitWOQIIHCRpi5wnhzOhifAYz1CPGBwTgnn2Davlnxqto?e=P6x101), informed by the Planner annotations in [Life_Manager_UI_UX_Review_Workbook.pptx](https://1drv.ms/p/c/75085d2d82ac01f9/IQCWi7945ULFSL2RS3DnYIqyAUETHSNeCrJwdO5gGnDA-WY?e=4pWP7n). The approved desktop design retains the weekly scan and task-type color meaning; the mobile design intentionally changes to one selected day at a time.

## Desktop Planner

- Keep seven equally framed day columns at normal zoom, with content wrapping vertically instead of changing column width or creating page-level horizontal scrolling.
- In each Morning, Afternoon, and Evening section, keep one compact warm Meals region above a distinct Tasks region.
- Group every occurrence for a meal slot in its single Meals region. Recipe titles navigate directly to the Recipe; free-text entries have compact Edit and Remove actions. Add uses a compact plus control.
- Free-text editing uses a modal or mobile sheet, saves only after confirmed persistence, and reports failures without closing or changing the displayed meal.
- Removing a meal deletes only its Planner occurrence, never the Recipe.

## Mobile Planner

- Replace the seven-column squeeze with a seven-day strip and one visible selected-day view.
- Keep Morning, Afternoon, and Evening sections in order, each with its Meals region followed by its existing task functionality.
- Provide a top-level Add entry to reveal the existing Planner assignment and creation panels. Keep task controls touch-usable and prevent page-level horizontal scrolling.

## Preservation and deferrals

Preserve task types, colors, completion, checklist interactions, task actions, and existing task drag/drop. Remove only the owner-rejected “Use this checklist for future tasks” control. Meal drag/drop rescheduling, Workbench filter Select All / Clear All, Meals page UX, and other module UX waves remain deferred.

No database, persistence-schema, RLS, grant, policy, Auth, or production-data changes are part of this UX wave.

## Owner UAT repair

- Keep the Meal and Task regions distinct without a redundant visible Tasks heading.
- Add Meal uses one form with matching Cancel and Add to Planner actions at the top and bottom; Recipe titles can be filtered case-insensitively and the selection is retained when the list is filtered.
- Mobile controls separately reveal Ad-Hoc Task, Task Parking Lot, and Task Calendar. Projects and Repeatable assignment panels remain desktop-only; their scheduled task occurrences stay visible in the selected-day view.
- Mobile task actions retain the compact action row, wrapping only when needed to preserve all controls on narrow screens. The task drag handle is hidden only on mobile. Desktop task drag/drop and all persistence behavior remain unchanged.

## Unified weekly checklist popup follow-up

The owner accepted the local Repeatable occurrence-specific checklist functionality
before this presentation follow-up. Its occurrence isolation, empty new occurrences,
reload, completion/move, recurrence and tombstone/revision contracts remain intact.
The popup, shared checklist reordering, handle-only control cleanup and
self-contained action icons passed owner UAT. The owner authorized production
release of this accepted checklist scope on 2026-11-03. It does not reopen the
accepted Planner grid, selected-day navigation or Meals treatment.

- Scheduled Project, Repeatable and Ad-Hoc cards use a wrapping title row followed
  by task actions. Checklist items never render inline or change card height.
- All supported task types expose the same checklist action. Empty lists use a
  neutral icon; populated lists use an active treatment, without a visible count.
  Accessible labels include task identity and sub-task progress.
- One central popup resolves its latest owner by stable weekly-task ID. Opening or
  closing writes no persisted visibility; reload closes it. The stored
  `checklist_open` field remains compatible without migration.
- Reuse the shared editor and existing mutations. Project, Repeatable and Ad-Hoc
  use the same captured pointer handle, viewport drop targeting and edge autoscroll.
  Only the reorder handle is visible; Arrow Up/Down on the focused handle provide
  keyboard reordering, with contextual naming and the existing saved-order status.
  No arrow-control container or reserved arrow-button spacing remains.
  Drop on the upper/lower half of an item to insert before/after its stable ID;
  the insertion line indicates placement, including the first/last positions.
  Dedicated handles alone suppress touch scrolling; mobile controls retain 44px
  targets. Empty/single lists have no reorder controls. Project template/fresh-task
  services are unchanged and the removed approval button remains absent.
- Order is the existing checklist JSON array order on the current task/occurrence.
  Raw item IDs, text, checked state and metadata remain intact. Opening/closing
  writes nothing; reorder success is announced after the revision-protected save.
  Canceled/outside drops, lost capture, owner removal and unmount clean up gesture
  state. Finish/cancel editing before reorder; Escape cancels active handle drags.
- Focus enters the named dialog, Tab/Shift+Tab remain inside, Escape and Close
  dismiss it, and focus returns to the checklist action or Planner fallback.
  Background navigation/task actions are inert while the dialog is active.
- Item text is a touch/keyboard edit action; Enter saves, editing Escape cancels,
  and mouse double-click remains supported. Checkbox/remove controls identify items.
  Controller failures are also shown as alerts in the popup; stale writes are not
  retried or silently reported as saved.
- Keep viewport-safe gutters and a dynamic-height bound, internally scroll long
  checklists, and retain a reachable touch-sized Close. Wrap unbroken text and
  constrain inputs, including reduced-height keyboard-like viewports.

### Validation and owner UAT

Planner Move Task and Checklist actions use decorative, fixed 16px inline SVGs,
not icon-font ligature text. Their named buttons and handlers are unchanged.
Investigation found that live production loads Material Icons Round from Google,
but a failed stylesheet request exposes `calendar_month`/`checklist` as raw text.
The isolated fixture deliberately blocks that request; its CSP stays unchanged.
These two local icons now render independently of external fonts. Other action
glyphs and the application's global font imports are outside this narrow repair.

Focused coverage is in `planner-react.test.cjs`, `planner-ux-wave.test.cjs` and
`planner-supabase.test.cjs`; retain the existing occurrence/template/revision tests.
Run full tests, lint, and `git diff --check`. Use
`node --test tests\planner-vite.test.cjs` for both production bundles with
`write:false`, rather than publishing over dirty generated output.

Use only the isolated synthetic fixture for browser UAT, not production-backed
normal development configuration. Test real pointer Project CRUD/reorder;
Repeatable CRUD/reorder, reload and independent dates; Ad-Hoc CRUD/reorder/reload;
neutral/active icons; touch handles, keyboard reorder,
editing/focus/close; and background drag isolation. Measure every card and neighbor
before/after popup opening. Exercise long titles, unbroken text, a 30-item list,
narrow selected-day viewports and reduced viewport height.

Release only the reviewed checklist source/tests/documentation on `dev`.
Build the exact candidate with root `npm run build` in an isolated worktree,
never over unrelated dirty generated output. Publish the resulting Pages assets
on `main`, retaining preceding hashed assets for cached clients, as in the
existing Pages release history. Keep unrelated Meals findings, SQL review files,
Android metadata and local UAT state out of the Pages release. Rollback uses a
new commit restoring the preceding verified Pages entry/assets; never rewrite
published history. No schema, migration, RLS/Auth or production-data migration
is part of this release.
