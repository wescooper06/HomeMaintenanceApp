# Google Sheets Write Endpoint (Apps Script)

This endpoint receives project edit payloads from the app and writes updates to the relevant tab.

## 1. Create Apps Script Web App

1. Open https://script.google.com
2. Create a new project.
3. Replace the default script with `Code.gs` from this folder.
4. Save the project.

## 2. Deploy as Web App

1. Click Deploy -> New deployment.
2. Type: Web app.
3. Execute as: Me.
4. Who has access: Anyone.
5. Deploy and copy the Web app URL.

## 3. Configure HomeMaintenanceApp

Create `www/js/app-config.js` with your endpoint URL:

```javascript
window.APP_CONFIG = {
  GOOGLE_SHEETS_WRITE_URL: "https://script.google.com/macros/s/REPLACE_WITH_DEPLOYMENT_ID/exec",
};
```

## 4. Include app config in shell

Ensure `www/index.html` includes:

```html
<script src="js/app-config.js?v=20260727-4"></script>
```

before the router script.

## 5. Payload shape from app

The app sends:

```json
{
  "spreadsheetId": "18la6E47KuiFWXFSIASd8QYbvxEo-ZJ7RaxnnuxIml9k",
  "tabName": "Project List_A (Home Maintenance)",
  "project": {
    "id": "...",
    "source": "home|vehicle|repeating",
    "title": "...",
    "category": "...",
    "state": "...",
    "metadata": {
      "sheetRowNumber": 123,
      "...": "..."
    }
  }
}
```

## Notes

- Home and Repeating tabs are updated using fixed column mapping and `metadata.sheetRowNumber`.
- Vehicle tab uses header-based mapping and can fallback to row matching by ID/title.
- If sheet structure changes, update `Code.gs` mappings accordingly.

## Activity application: Supabase replacement

The active React Activity application no longer uses this endpoint or
`WeeklyGrid.gs`. Those scripts remain only as legacy reference sources.
Both `/#daily` and the standalone Activity Planner load from the existing
`activity_types`, `activity_rules`, and `activity_weekly_grid` Supabase tables,
using `src/services/activityDataAccess.js` and the `useActivityData` hook in
`src/services/activityPlannerService.js`.

The data-access module exports `getActivityTypes`, `getActivityRules`,
`getWeeklyGrid`, `createActivityRule(rule)`, `updateActivityRule(id, updates)`,
`deleteActivityRule(id)`, `splitRule(rule, day)`, and `regenerateWeeklyGrid()`.
Rule editing retains stored `recurrence`; the existing weekday-based expansion
does not invent new recurrence semantics.

Regeneration reads rules from Supabase and covers 7 days by 48 half-hour slots,
00:00 through 23:30. Starts snap down to a half-hour boundary; ends are exclusive.
Unassigned slots contain explicit null activity/rule IDs, overriding the table's
random UUID default. Existing overlapping activities remain separate rows, so
there are 336 distinct day/time slots and potentially more than 336 rows.
Priority orders overlaps; it does not discard them or change allow-override
behavior. The UI uses the same full-day grid and does not render empty rows as
activity blocks.

No schema changes, new tables, RPCs, or live-data imports are included. Configure
the existing Supabase browser client with `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY`. The current role must have SELECT on all three
tables, INSERT/UPDATE/DELETE on rules, and INSERT/DELETE on the grid. No Google
account, Apps Script URL, or Activity spreadsheet ID is needed.

The supplied rules/grid tables lack primary or unique keys. Duplicate rule UUIDs
are reported explicitly before mutations. Grid replacement requires separate
DELETE and INSERT requests, so it is not transactional. Regenerations and rule
mutations are serialized within one client, but not across tabs or users.
Invalid rules are rejected before clearing the grid. Replacement failures surface
explicitly, leave rules intact, and can be retried through Refresh after a failed
save/regeneration. Reloading the grid verifies the saved rows. Split-rule writes
are also separate requests; a partial split reports the new rule UUID and requires
refreshing/resolving the two rules rather than blindly retrying.

Validation from the workspace root:

```powershell
node --test tests\activity-supabase.test.cjs tests\planner-vite.test.cjs
```

Tests use an isolated in-memory PostgreSQL engine with the supplied exact schema,
not live Supabase. Verify the UI loads without a Google prompt, displays early
and late activities, saves/edits/deletes rules, splits only the selected day,
preserves overlapping blocks, and regenerates the grid after each edit.
