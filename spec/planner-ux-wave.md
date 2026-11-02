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
- Mobile task actions stay on one row, and the task drag handle is hidden only on mobile. Desktop task drag/drop and all persistence behavior remain unchanged.
