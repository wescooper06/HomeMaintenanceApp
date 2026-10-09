const SPREADSHEET_ID = "18la6E47KuiFWXFSIASd8QYbvxEo-ZJ7RaxnnuxIml9k";
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
    // Cross-origin standalone development needs a Vite environment value.
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

function columnName(columnNumber) {
  let result = "";
  let column = columnNumber;
  while (column > 0) {
    const remainder = (column - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    column = Math.floor((column - 1) / 26);
  }
  return result;
}

function sheetRange(sheetName, suffix) {
  return `'${sheetName.replace(/'/g, "''")}'!${suffix}`;
}

async function sheetsRequest(path, options = {}) {
  const token = getStoredToken();
  if (!token) throw new Error("Connect your Google account to access Trips data.");

  const response = await fetch(`${SHEETS_API_BASE}/${SPREADSHEET_ID}${path}`, {
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

async function readSheet(sheetName) {
  const range = encodeURIComponent(sheetRange(sheetName, "A:ZZ"));
  const renderOptions = sheetName === "Trips" ? "?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER" : "";
  const payload = await sheetsRequest(`/values/${range}${renderOptions}`);
  const values = payload.values || [];
  return { headers: values[0] || [], rows: values.slice(1) };
}

function rowsToObjects(headers, rows) {
  return rows.filter((row) => row.some((value) => value !== "" && value != null)).map((row) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = row[index] ?? "";
    });
    return record;
  });
}

async function appendSheetRow(sheetName, headers, row) {
  const range = encodeURIComponent(sheetRange(sheetName, "A:ZZ"));
  return sheetsRequest(`/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ majorDimension: "ROWS", values: [headers.map((header) => row[header] ?? "")] }),
  });
}

export async function getTrips() {
  const { headers, rows } = await readSheet("Trips");
  return rowsToObjects(headers, rows).map((row) => ({
    ...row,
    tripId: String(row.tripId ?? row.id ?? ""),
    destination: row.destination || "",
    startDate: tripDateValue(row.startDate),
    endDate: tripDateValue(row.endDate),
    tripType: row.tripType || "",
    status: row.status || "",
    priorityRank: row.priorityRank || "",
    timelineMonth: row.timelineMonth || "",
    timelineYear: row.timelineYear || "",
    notes: row.notes || "",
  }));
}

function tripDateValue(value) {
  if (typeof value === "number") {
    return new Date(Date.UTC(1899, 11, 30) + value * 86400000).toISOString().slice(0, 10);
  }
  return value || "";
}

export async function getTripById(tripId) {
  const trips = await getTrips();
  return trips.find((trip) => trip.tripId === tripId) || null;
}

export async function createTrip(tripData) {
  const { headers } = await readSheet("Trips");
  const sheetTrip = tripFieldsForHeaders(headers, tripData);
  validateTripColumns(headers, sheetTrip);
  if ((await getTrips()).some((trip) => trip.tripId === tripData.tripId)) {
    throw new Error(`Trip already exists: ${tripData.tripId}`);
  }
  const result = await appendSheetRow("Trips", headers, sheetTrip);
  return { tripId: tripData.tripId, result };
}

function validateTripColumns(headers, fields) {
  const missing = Object.keys(fields).filter((field) =>
    fields[field] !== "" && fields[field] != null && !headers.includes(field)
  );
  if (missing.length) {
    throw new Error(`Trips sheet is missing columns: ${missing.join(", ")}. Add these exact headers before saving.`);
  }
}

function tripFieldsForHeaders(headers, fields) {
  if (headers.includes("tripId")) return fields;
  if (!headers.includes("id")) throw new Error("Trips sheet is missing its tripId or id header.");
  const { tripId, ...values } = fields;
  return tripId == null ? values : { ...values, id: tripId };
}

export async function updateTrip(tripId, updates) {
  const { headers, rows } = await readSheet("Trips");
  const idColumn = headers.indexOf(headers.includes("tripId") ? "tripId" : "id");
  if (idColumn < 0) throw new Error("Trips sheet is missing its tripId or id header.");
  const rowIndex = rows.findIndex((row) => String(row[idColumn]) === String(tripId));
  if (rowIndex < 0) throw new Error(`Trip not found: ${tripId}`);
  const sheetUpdates = tripFieldsForHeaders(headers, updates);
  validateTripColumns(headers, sheetUpdates);
  const data = Object.keys(sheetUpdates).filter((field) => field !== "tripId" && field !== "id" && headers.includes(field)).map((field) => {
    const column = columnName(headers.indexOf(field) + 1);
    return {
      range: sheetRange("Trips", `${column}${rowIndex + 2}`),
      values: [[sheetUpdates[field] ?? ""]],
    };
  });
  if (!data.length) return { ok: true, tripId };
  await sheetsRequest("/values:batchUpdate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ valueInputOption: "RAW", data }),
  });
  return { ok: true, tripId, ...updates };
}

export async function deleteTrip(tripId) {
  if (!String(tripId ?? "").trim()) throw new Error("Missing trip id for deletion.");
  const metadata = await sheetsRequest("?fields=sheets(properties(sheetId,title))");
  const sheet = metadata.sheets?.find((item) => item.properties.title === "Trips");
  if (!sheet) throw new Error("Trips sheet not found.");
  const { headers, rows } = await readSheet("Trips");
  const idColumn = headers.indexOf(headers.includes("tripId") ? "tripId" : "id");
  if (idColumn < 0) throw new Error("Trips sheet is missing its tripId or id header.");
  const matches = rows.map((row, index) => String(row[idColumn]) === String(tripId) ? index : -1).filter((index) => index >= 0);
  if (matches.length !== 1) throw new Error(matches.length ? "Duplicate trip ids found; deletion cancelled." : "Trip not found; refresh the list before deleting.");
  await sheetsRequest(":batchUpdate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requests: [{ deleteDimension: { range: {
      sheetId: sheet.properties.sheetId,
      dimension: "ROWS",
      startIndex: matches[0] + 1,
      endIndex: matches[0] + 2,
    } } }] }),
  });
}

let priorityColumnSetup = null;

export function ensureTripPriorityColumn() {
  if (priorityColumnSetup) return priorityColumnSetup;
  priorityColumnSetup = (async () => {
    const { headers, rows } = await readSheet("Trips");
    if (headers.includes("priority")) return;
    const columnCount = rows.reduce((count, row) => Math.max(count, row.length), headers.length) + 1;
    const metadata = await sheetsRequest("?fields=sheets(properties(sheetId,title,gridProperties(columnCount)))");
    const sheet = metadata.sheets?.find((item) => item.properties.title === "Trips");
    if (!sheet) throw new Error("Trips sheet not found.");
    const availableColumns = sheet.properties.gridProperties.columnCount;
    if (columnCount > availableColumns) {
      await sheetsRequest(":batchUpdate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requests: [{ appendDimension: {
          sheetId: sheet.properties.sheetId, dimension: "COLUMNS", length: columnCount - availableColumns,
        } }] }),
      });
    }
    const range = encodeURIComponent(sheetRange("Trips", `${columnName(columnCount)}1`));
    await sheetsRequest(`/values/${range}?valueInputOption=RAW`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values: [["priority"]] }),
    });
  })().finally(() => { priorityColumnSetup = null; });
  return priorityColumnSetup;
}

export async function getWorkflowMetadata(tripId) {
  const { headers, rows } = await readSheet("Workflow Metadata");
  const workflow = rowsToObjects(headers, rows).find((row) => row.tripId === tripId);
  if (!workflow) return { tripId, stage: "Define", stageNotes: "" };
  return {
    ...workflow,
    stage: workflow.stageStatus || workflow.stage || "Define",
    stageNotes: workflow.stageNotes || "",
  };
}

export async function updateWorkflowMetadata(tripId, updates) {
  const { headers, rows } = await readSheet("Workflow Metadata");
  const tripIdColumn = headers.indexOf("tripId");
  const stageColumn = headers.indexOf("stageStatus") >= 0
    ? headers.indexOf("stageStatus")
    : headers.indexOf("stage");
  const notesColumn = headers.indexOf("stageNotes");
  if (tripIdColumn < 0 || stageColumn < 0 || notesColumn < 0) {
    throw new Error("Workflow Metadata sheet is missing required headers.");
  }

  const recordIndex = rows.findIndex((row) => row[tripIdColumn] === tripId);
  const rowNumber = recordIndex < 0 ? rows.length + 2 : recordIndex + 2;
  const row = recordIndex < 0 ? Array(headers.length).fill("") : [...rows[recordIndex]];
  while (row.length < headers.length) row.push("");
  row[tripIdColumn] = tripId;
  row[stageColumn] = updates.stageStatus || updates.stage || "Define";
  row[notesColumn] = updates.stageNotes || "";

  if (recordIndex < 0) return appendSheetRow("Workflow Metadata", headers, Object.fromEntries(headers.map((header, index) => [header, row[index]])));

  const range = encodeURIComponent(sheetRange("Workflow Metadata", `A${rowNumber}:${columnName(headers.length)}${rowNumber}`));
  return sheetsRequest(`/values/${range}?valueInputOption=USER_ENTERED`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ majorDimension: "ROWS", values: [row] }),
  });
}
