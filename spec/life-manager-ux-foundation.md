# Life Manager UX Foundation

## Design authority and scope

The approved visual direction is [Life_Manager_UX_Proposal_v2.pptx](https://1drv.ms/p/c/75085d2d82ac01f9/IQDitWOQIIHCRpi5wnhzOhifAYz1CPGBwTgnn2Davlnxqto?e=c94uJT). The supporting owner context is [Life_Manager_UI_UX_Review_Workbook.pptx](https://1drv.ms/p/c/75085d2d82ac01f9/IQCWi7945ULFSL2RS3DnYIqyAUETHSNeCrJwdO5gGnDA-WY?e=Mhmx6c). Proposal v1 is superseded.

The v2 deck guides shared appearance; this implementation foundation does not turn its page mockups into authorization for page-specific redesigns. It standardizes the navigation shell and shared page-header hierarchy across Life Manager destinations; representative surface and workflow styling remains limited to Dashboard, Workbench, and the existing Workbench Project Editor overlay.

Preserve all route, account, task, project, Recipe, Shopping, Planner, Meals, Trips, and persistence behavior. This foundation does not change database/Auth configuration, the Acceptance Workbook, production data, or SQL guards. The separately authorized Planner UX wave is documented in [planner-ux-wave.md](./planner-ux-wave.md); the Meals page and other redesign waves remain separate work.

## Shared design tokens

`src/components/layout/lifeManagerFoundation.css` is the canonical token and shared primitive layer. It is imported by the modern application shell and standalone Activity Planner so shared navigation and controls have the same token values in both entry points.

| Purpose | Token | Value |
| --- | --- | --- |
| Navigation | `--lm-color-navigation` | `#17324D` |
| Primary action / focus | `--lm-color-primary`, `--lm-color-focus` | `#0F766E` |
| Main text | `--lm-color-text` | `#1F2933` |
| Secondary text | `--lm-color-text-secondary` | `#667085` |
| Muted/decorative only | `--lm-color-text-muted` | `#98A2B3` |
| Canvas | `--lm-color-canvas` | `#F7F8FA` |
| Destructive action | `--lm-color-danger` | `#B42318` |
| Meals accent | `--lm-color-meals` | `#9A3412` |
| Mobile control target | `--lm-control-mobile` | `44px` |

Use the shared spacing, radii, shadow, typography, and control-size tokens for new common surfaces. `#98A2B3` is reserved for decorative boundaries and non-text indicators; use the accessible secondary-text token for important or small text. Maintain semantic status/type colors where they already convey meaning.

Companion shades are centralized in the same `:root` layer and used only for the indicated state or surface:

| Purpose | Value |
| --- | --- |
| Navigation hover and readable nav labels | `#244765`, `#F2F4F7`, `#D0D5DD` |
| Neutral/subtle/disabled surface and standard border | `#FFFFFF`, `#F2F4F7`, `#D0D5DD` |
| Selected and primary subtle surfaces | `#CCFBF1`, `#F0FDFA` |
| Primary hover/pressed and selected text | `#115E59`, `#134E4A` |
| Destructive hover/subtle/error border | `#912018`, `#FEF3F2`, `#FECDCA` |
| Meals subtle surface | `#FFF7ED` |
| Success text/surface/border | `#067647`, `#ECFDF3`, `#ABEFC6` |
| Informational text/surface/border | `#175CD3`, `#EFF8FF`, `#B2DDFF` |
| Skeleton base | `#E4E7EC` |

Overlay scrims use translucent `rgb(16 24 40 / 48%)`; overlay shadows use translucent `rgb(16 24 40 / 18%)`. These are layering effects, not text colors. Status text colors and surfaces have automated WCAG AA contrast checks. In particular, never use muted text `#98A2B3` for normal-size content.

The token hierarchy uses a 4/8/12/16/24/32px spacing scale; 6px controls, 10px cards, 12px overlays, and pill radii; restrained borders and overlay-only elevation; Segoe UI with page, section, card, body, secondary, metadata, and label levels; and 40px desktop, 32px compact, and 44px mobile/icon control targets.

The page header, button variants, form fields, tabs, dense-list rows, badges, feedback/state classes, overlays, and popover classes are reusable CSS primitives. Shared classes express hierarchy and state without replacing module-specific behavior. Primary, secondary, quiet, and destructive actions remain visually distinct; destructive actions also carry an explicit action label and a visible × marker. Icon-only controls must have an accessible name. Retain native button/link semantics and module-specific state colors where they communicate real meaning.

Correct usage: use a token or shared primitive for a common control, surface, or state and keep its existing behavior. Prohibited: invent per-page palette/spacing values, flatten semantic module colors, remove controls merely absent from the mockup, add unlabelled consequential icons, or redesign excluded page workflows during this foundation wave.

## Interaction and accessibility

- Keep all destinations, labels, selected routes, and account controls intact.
- Navigation stays on one line and scrolls horizontally on narrow screens rather than wrapping into an ambiguous second row.
- Keep navigation position, height, alignment, and account controls independent of route content. Use the same `PageHeader` hierarchy and page-content inset across modules and Trips subpages; let each page retain only the subtitle and actions it needs.
- Workbench filter checklists remain open during interaction inside the checklist, close on outside pointer/tap or Escape, and preserve selected values when closed and reopened. Opening one checklist closes the previously open checklist without reflowing page content.
- Show keyboard focus with a high-contrast visible outline. Honor reduced-motion preferences.
- Keep disabled states distinct and non-interactive.
- The Planner uses the separate desktop/mobile compositions in [planner-ux-wave.md](./planner-ux-wave.md); this does not authorize changes to other modules.
- Use at least 44px touch targets on mobile for controls, including modal actions and multi-select options.
- Keep the existing Project Editor focus-on-open and focus-restoration behavior; constrain Tab navigation to the dialog; Escape closes it; prevent background scrolling while it is open.
- Preserve the existing create-overlay backdrop dismissal and the edit-overlay behavior. Do not change project save/delete workflows.
- At narrow widths, stack page headers/forms, allow dense rows and action groups to wrap, and present the Project Editor as a bottom sheet with safe-area spacing.
- Pair destructive color with the explicit destructive action text and marker; do not rely on color alone.

## Release and rollback record

The pre-change branch and validation evidence, Pages release reference, Android identity, and Acceptance Workbook digest are recorded in private session evidence outside the repository; this evidence is not application content and is not committed.

Keep the UX Foundation in one isolated source commit. Roll back source by creating a `git revert` commit; do not rewrite published history. Restore the preceding Pages release by using the existing release process to republish the previously verified clean Pages `main` commit recorded in the private baseline. No database rollback is applicable.
