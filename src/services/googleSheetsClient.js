export const SPREADSHEET_ID = "18la6E47KuiFWXFSIASd8QYbvxEo-ZJ7RaxnnuxIml9k";
const SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const TOKEN_KEY = "trips_sheets_access_token";
const TOKEN_EXPIRY_KEY = "trips_sheets_access_token_expires_at";

function getStoredToken() {
  const token = localStorage.getItem(TOKEN_KEY) || "";
  const expiresAt = Number(localStorage.getItem(TOKEN_EXPIRY_KEY) || 0);
  if (!token || expiresAt <= Date.now() + 30000) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_EXPIRY_KEY);
    return "";
  }
  return token;
}

export function hasSheetsAccess() {
  return Boolean(getStoredToken());
}

function googleClientId() {
  try {
    const parentConfig = window.parent !== window ? window.parent.APP_CONFIG : null;
    const clientId = parentConfig?.GOOGLE_CLIENT_ID || window.APP_CONFIG?.GOOGLE_CLIENT_ID;
    if (clientId) return clientId;
  } catch {
    return import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
  }
  return import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
}

async function waitForGoogleIdentityServices() {
  const deadline = Date.now() + 10000;
  while (!(window.google && window.google.accounts && window.google.accounts.oauth2)) {
    if (Date.now() >= deadline) {
      throw new Error("Google Identity Services did not load.");
    }
    await new Promise((resolve) => window.setTimeout(resolve, 100));
  }
}

export async function connectGoogleSheets() {
  const clientId = googleClientId();
  if (!clientId) throw new Error("Google OAuth client ID is not configured.");
  await waitForGoogleIdentityServices();

  return new Promise((resolve, reject) => {
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SHEETS_SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(response.error_description || response.error || "Google authorization failed."));
          return;
        }
        const expiresAt = Date.now() + (Number(response.expires_in) || 3600) * 1000;
        localStorage.setItem(TOKEN_KEY, response.access_token);
        localStorage.setItem(TOKEN_EXPIRY_KEY, String(expiresAt));
        resolve(response.access_token);
      },
      error_callback: (error) => reject(new Error(error.message || "Google authorization was cancelled.")),
    });
    tokenClient.requestAccessToken({ prompt: getStoredToken() ? "" : "consent" });
  });
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
  const token = getStoredToken();
  if (!token) throw new Error("Connect your Google account to access Sheets data.");

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