// ADD PROJECT FEATURE — Copilot context anchor
// This file handles Google Sheets API calls, ID generation (scan + increment),
// createProject POST payloads, and metadata dropdown retrieval.
(function () {
  const SPREADSHEET_ID = "18la6E47KuiFWXFSIASd8QYbvxEo-ZJ7RaxnnuxIml9k";

  function getAppConfig() {
    return window.APP_CONFIG || {};
  }

  function getGoogleSheetsApiKey() {
    const config = getAppConfig();
    return (config.GOOGLE_SHEETS_API_KEY || "").trim();
  }

  function getGoogleSheetsWriteUrl() {
    const config = getAppConfig();
    return (config.GOOGLE_SHEETS_WRITE_URL || config.GOOGLE_APPS_SCRIPT_WEB_APP_URL || "").trim();
  }

  const TABS = {
    home: "Project List_A (Home Maintenance)",
    vehicle: "Project List_B (Vehicle/Small Engine)",
    repeating: "Project List_C (Repeating Household)",
  };
  const TAB_GIDS = {
    home: "128609528",
    vehicle: "1524661812",
    repeating: "280063195",
  };

  function buildCsvUrlForTab(tabName) {
    const gid = tabName === TABS.home
      ? TAB_GIDS.home
      : tabName === TABS.vehicle
        ? TAB_GIDS.vehicle
        : tabName === TABS.repeating
          ? TAB_GIDS.repeating
          : "";

    if (gid) {
      const url = new URL(`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export`);
      url.searchParams.set("format", "csv");
      url.searchParams.set("gid", gid);
      return url;
    }

    const url = new URL(`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq`);
    url.searchParams.set("sheet", tabName);
    url.searchParams.set("tqx", "out:csv");
    return url;
  }

  function sanitizeHeader(value, index) {
    const text = String(value == null ? "" : value).trim();
    return text || `Column_${index + 1}`;
  }

  function cleanCell(value) {
    if (value == null) {
      return "";
    }

    return String(value).replace(/^\uFEFF/, "").trim();
  }

  function fetchJsonp(url, timeoutMs) {
    const timeout = Number.isFinite(timeoutMs) ? timeoutMs : 10000;

    return new Promise((resolve, reject) => {
      const callbackName = `__hm_jsonp_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
      const script = document.createElement("script");
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Timed out while loading sheet dropdown metadata."));
      }, timeout);

      function cleanup() {
        clearTimeout(timer);
        if (script.parentNode) {
          script.parentNode.removeChild(script);
        }

        try {
          delete window[callbackName];
        } catch (error) {
          window[callbackName] = undefined;
        }
      }

      window[callbackName] = (payload) => {
        cleanup();
        resolve(payload);
      };

      script.onerror = () => {
        cleanup();
        reject(new Error("Unable to load sheet dropdown metadata script."));
      };

      const requestUrl = new URL(url);
      requestUrl.searchParams.set("callback", callbackName);
      script.src = requestUrl.toString();
      document.body.appendChild(script);
    });
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      const next = text[i + 1];

      if (char === '"') {
        if (inQuotes && next === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (char === "," && !inQuotes) {
        row.push(field);
        field = "";
        continue;
      }

      if ((char === "\n" || char === "\r") && !inQuotes) {
        if (char === "\r" && next === "\n") {
          i += 1;
        }

        row.push(field);
        rows.push(row);
        row = [];
        field = "";
        continue;
      }

      field += char;
    }

    if (field.length > 0 || row.length > 0) {
      row.push(field);
      rows.push(row);
    }

    return rows;
  }

  function rowsToObjects(rows) {
    if (!rows.length) {
      return {
        headers: [],
        records: [],
      };
    }

    const headerRow = rows[0];
    const headers = headerRow.map((header, index) => sanitizeHeader(cleanCell(header), index));
    const records = [];

    for (let i = 1; i < rows.length; i += 1) {
      const rawRow = rows[i];

      if (!rawRow || rawRow.every((cell) => cleanCell(cell) === "")) {
        continue;
      }

      const rowObject = {};

      for (let j = 0; j < headers.length; j += 1) {
        rowObject[headers[j]] = cleanCell(rawRow[j]);
      }

      rowObject._rowNumber = i + 1;

      records.push(rowObject);
    }

    return {
      headers,
      records,
    };
  }

  function stripHeaderPrefix(value, header) {
    const cell = cleanCell(value);
    const label = cleanCell(header);

    if (!cell || !label) {
      return cell;
    }

    const lowerCell = cell.toLowerCase();
    const lowerLabel = label.toLowerCase();

    if (lowerCell === lowerLabel) {
      return "";
    }

    if (lowerCell.startsWith(`${lowerLabel} `)) {
      return cell.slice(label.length).trim();
    }

    return cell;
  }

  function rowsToObjectsWithHeaders(rows, headers, options) {
    const opts = options || {};
    const startRowNumber = Number.isFinite(opts.startRowNumber) ? opts.startRowNumber : 2;
    const stripPrefixedHeaders = Boolean(opts.stripPrefixedHeaders);
    const cleanedHeaders = headers.map((header, index) => sanitizeHeader(header, index));
    const records = [];

    for (let i = 0; i < rows.length; i += 1) {
      const rawRow = rows[i];

      if (!rawRow || rawRow.every((cell) => cleanCell(cell) === "")) {
        continue;
      }

      const rowObject = {};

      for (let j = 0; j < cleanedHeaders.length; j += 1) {
        const value = stripPrefixedHeaders
          ? stripHeaderPrefix(rawRow[j], cleanedHeaders[j])
          : cleanCell(rawRow[j]);

        rowObject[cleanedHeaders[j]] = value;
      }

      rowObject._rowNumber = i + startRowNumber;

      records.push(rowObject);
    }

    return {
      headers: cleanedHeaders,
      records,
    };
  }

  async function fetchWithDiagnostics(url) {
    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      const shortBody = cleanCell(bodyText).slice(0, 160);

      if (response.status === 401 || response.status === 403) {
        throw new Error(
          "Google Sheet access denied (401/403). Make the sheet readable by your app (publish/share) or use an authenticated server proxy."
        );
      }

      throw new Error(`Google Sheet request failed (${response.status}). ${shortBody}`);
    }

    return response;
  }

  function valuesToObjects(values) {
    if (!Array.isArray(values) || values.length === 0) {
      return {
        headers: [],
        records: [],
      };
    }

    const headers = (values[0] || []).map((header, index) => sanitizeHeader(cleanCell(header), index));
    const records = [];

    for (let i = 1; i < values.length; i += 1) {
      const row = values[i] || [];
      if (row.every((cell) => cleanCell(cell) === "")) {
        continue;
      }

      const record = {};
      for (let j = 0; j < headers.length; j += 1) {
        record[headers[j]] = cleanCell(row[j]);
      }

      record._rowNumber = i + 1;

      records.push(record);
    }

    return {
      headers,
      records,
    };
  }

  async function fetchTabViaCsv(tabName) {
    const url = buildCsvUrlForTab(tabName);

    const response = await fetchWithDiagnostics(url.toString());
    const csvText = await response.text();
    return rowsToObjects(parseCsv(csvText));
  }

  async function fetchTabViaCsvWithFixedSchema(tabName, headers) {
    const url = buildCsvUrlForTab(tabName);

    const response = await fetchWithDiagnostics(url.toString());
    const csvText = await response.text();
    const rows = parseCsv(csvText);

    if (!rows.length) {
      return rowsToObjectsWithHeaders([], headers);
    }

    const firstRow = rows[0] || [];
    const normalizedHeaders = headers.map((header) => cleanCell(header).toLowerCase());

    let exactHeaderMatches = 0;
    let prefixedHeaderMatches = 0;

    for (let i = 0; i < normalizedHeaders.length; i += 1) {
      const header = normalizedHeaders[i];
      const cell = cleanCell(firstRow[i]).toLowerCase();

      if (!cell) {
        continue;
      }

      if (cell === header) {
        exactHeaderMatches += 1;
      } else if (cell.startsWith(`${header} `)) {
        prefixedHeaderMatches += 1;
      }
    }

    const hasExplicitHeaderRow = exactHeaderMatches >= Math.max(3, normalizedHeaders.length - 2);
    const useRows = hasExplicitHeaderRow ? rows.slice(1) : rows;
    const startRowNumber = hasExplicitHeaderRow ? 2 : 1;
    const stripPrefixedHeaders = prefixedHeaderMatches >= Math.ceil(normalizedHeaders.length / 2);

    return rowsToObjectsWithHeaders(useRows, headers, {
      startRowNumber,
      stripPrefixedHeaders,
    });
  }

  async function fetchTabViaApi(tabName) {
    const googleSheetsApiKey = getGoogleSheetsApiKey();
    const range = `'${tabName.replace(/'/g, "''")}'!A:ZZ`;
    const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}`);
    url.searchParams.set("key", googleSheetsApiKey);

    const response = await fetchWithDiagnostics(url.toString());
    const payload = await response.json();
    return valuesToObjects(payload.values || []);
  }

  async function fetchTab(tabName) {
    const googleSheetsApiKey = getGoogleSheetsApiKey();
    let parsed;

    try {
      if (tabName === TABS.home) {
        const fixedHeaders = [
          "ID",
          "Property",
          "Area",
          "Category",
          "Task Description",
          "Priority",
          "Order",
          "ResourceLinks",
          "Cost ($)",
          "State",
          "Date Completed",
        ];

        parsed = await fetchTabViaCsvWithFixedSchema(tabName, fixedHeaders);
      } else {
        // Repeating is intentionally read through CSV by gid to avoid sheet-name ambiguity.
        if (tabName === TABS.repeating) {
          parsed = await fetchTabViaCsv(tabName);
        } else {
          parsed = googleSheetsApiKey ? await fetchTabViaApi(tabName) : await fetchTabViaCsv(tabName);
        }
      }
    } catch (error) {
      throw new Error(`Failed to load \"${tabName}\": ${error.message}`);
    }

    return {
      spreadsheetId: SPREADSHEET_ID,
      tabName,
      headers: parsed.headers,
      rows: parsed.records,
    };
  }

  function fetchHomeSheet() {
    return fetchTab(TABS.home);
  }

  function fetchVehicleSheet() {
    return fetchTab(TABS.vehicle);
  }

  function fetchRepeatingSheet() {
    return fetchTab(TABS.repeating);
  }

  async function fetchAllSheets() {
    const [home, vehicle, repeating] = await Promise.all([
      fetchHomeSheet(),
      fetchVehicleSheet(),
      fetchRepeatingSheet(),
    ]);

    return {
      home,
      vehicle,
      repeating,
    };
  }

  function sourceToTabName(source) {
    const normalized = cleanCell(source).toLowerCase();

    if (normalized.includes("list_a") || normalized.includes("home")) {
      return TABS.home;
    }

    if (normalized.includes("list_b") || normalized.includes("vehicle")) {
      return TABS.vehicle;
    }

    if (normalized.includes("list_c") || normalized.includes("repeating")) {
      return TABS.repeating;
    }

    return TABS.home;
  }

  async function fetchProjectDropdownOptions() {
    const googleSheetsWriteUrl = getGoogleSheetsWriteUrl();

    if (!googleSheetsWriteUrl) {
      throw new Error(
        "Sheet write endpoint is not configured. Set window.APP_CONFIG.GOOGLE_SHEETS_WRITE_URL (or GOOGLE_APPS_SCRIPT_WEB_APP_URL)."
      );
    }

    const url = new URL(googleSheetsWriteUrl);
    url.searchParams.set("action", "projectDropdownOptions");
    url.searchParams.set("spreadsheetId", SPREADSHEET_ID);

    const payload = await fetchJsonp(url.toString());
    if (!payload || payload.ok === false) {
      throw new Error(cleanCell(payload && payload.error) || "Dropdown metadata request failed.");
    }

    if (!payload.options || typeof payload.options !== "object") {
      const endpointVersion = cleanCell(payload && payload.version);
      const endpointMethods = Array.isArray(payload && payload.methods) ? payload.methods.join(",") : "";
      throw new Error(
        `Dropdown metadata action is unavailable in deployed Apps Script${endpointVersion ? ` (version ${endpointVersion})` : ""}${endpointMethods ? `; methods: ${endpointMethods}` : ""}.`
      );
    }

    return payload.options || {};
  }

  async function updateProjectInSheet(project) {
    const googleSheetsWriteUrl = getGoogleSheetsWriteUrl();

    if (!googleSheetsWriteUrl) {
      throw new Error(
        "Sheet write endpoint is not configured. Set window.APP_CONFIG.GOOGLE_SHEETS_WRITE_URL (or GOOGLE_APPS_SCRIPT_WEB_APP_URL)."
      );
    }

    const payload = {
      spreadsheetId: SPREADSHEET_ID,
      tabName: sourceToTabName(project && project.source),
      project,
    };

    // Apps Script web apps do not expose CORS response headers for browser fetch reads.
    // Use no-cors so the POST is still delivered; the response will be opaque in the browser.
    const response = await fetch(googleSheetsWriteUrl, {
      method: "POST",
      mode: "no-cors",
      body: JSON.stringify(payload),
    });

    if (response.type === "opaque") {
      return { ok: true, transport: "no-cors" };
    }

    if (!response.ok) {
      const reason = await response.text().catch(() => "");
      throw new Error(`Failed to write to Google Sheets (${response.status}). ${cleanCell(reason)}`);
    }

    try {
      return await response.json();
    } catch (error) {
      return { ok: true };
    }
  }

  async function deleteProject(projectOrId) {
    const googleSheetsWriteUrl = getGoogleSheetsWriteUrl();

    if (!googleSheetsWriteUrl) {
      throw new Error(
        "Sheet write endpoint is not configured. Set window.APP_CONFIG.GOOGLE_SHEETS_WRITE_URL (or GOOGLE_APPS_SCRIPT_WEB_APP_URL)."
      );
    }

    const project = typeof projectOrId === "object" && projectOrId != null ? projectOrId : null;
    const id = cleanCell(project ? project.id : projectOrId);

    if (!id) {
      throw new Error("deleteProject requires a project id.");
    }

    const payload = {
      action: "deleteProject",
      spreadsheetId: SPREADSHEET_ID,
      id,
      source: project ? cleanCell(project.source) : "",
      tabName: project ? sourceToTabName(project.source) : "",
      sheetRowNumber: project && project.metadata ? Number(project.metadata.sheetRowNumber || project.metadata.rownumber || project.metadata._rownumber || 0) : 0,
      title: project ? cleanCell(project.title) : "",
    };

    const response = await fetch(googleSheetsWriteUrl, {
      method: "POST",
      mode: "no-cors",
      body: JSON.stringify(payload),
    });

    if (response.type === "opaque") {
      return { ok: true, id, transport: "no-cors" };
    }

    if (!response.ok) {
      const reason = await response.text().catch(() => "");
      throw new Error(`Failed to delete from Google Sheets (${response.status}). ${cleanCell(reason)}`);
    }

    try {
      return await response.json();
    } catch (error) {
      return { ok: true, id };
    }
  }

  window.SheetsService = {
    SPREADSHEET_ID,
    TABS,
    fetchTab,
    fetchHomeSheet,
    fetchVehicleSheet,
    fetchRepeatingSheet,
    fetchAllSheets,
    fetchProjectDropdownOptions,
    updateProjectInSheet,
    deleteProject,
  };
})();
