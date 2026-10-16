import "../../auth.js";

const configuredClientId = (() => {
  try {
    const parentConfig = globalThis.parent !== globalThis
      ? globalThis.parent.APP_CONFIG
      : null;
    return parentConfig?.GOOGLE_CLIENT_ID
      || globalThis.APP_CONFIG?.GOOGLE_CLIENT_ID
      || import.meta.env.VITE_GOOGLE_CLIENT_ID
      || "";
  } catch {
    return import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
  }
})();

if (configuredClientId) {
  globalThis.APP_CONFIG = globalThis.APP_CONFIG || {};
  globalThis.APP_CONFIG.GOOGLE_CLIENT_ID = configuredClientId;
}

export const SPREADSHEET_ID = "18la6E47KuiFWXFSIASd8QYbvxEo-ZJ7RaxnnuxIml9k";
const SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

export function hasSheetsAccess() {
  return Boolean(globalThis.Auth.getToken(SHEETS_SCOPE));
}

export async function connectGoogleSheets() {
  return globalThis.Auth.signIn(SHEETS_SCOPE);
}

export function columnName(columnNumber) {
  let result = "";
  let column = columnNumber;
  while (column > 0) {
    const remainder = (column - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    column = Math.floor((column - 1) / 26);
  }
  return result;
}

export function sheetRange(sheetName, suffix) {
  return `'${sheetName.replace(/'/g, "''")}'!${suffix}`;
}

export async function sheetsApiRequest(spreadsheetId, path, options = {}) {
  const token = await globalThis.Auth.ensureAuthenticated(SHEETS_SCOPE);

  const response = await fetch(`${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error?.message || `Sheets API request failed (${response.status}).`);
  }
  return payload;
}