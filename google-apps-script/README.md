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
