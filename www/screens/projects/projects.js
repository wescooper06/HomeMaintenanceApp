// ADD PROJECT FEATURE — Copilot context anchor
// This file contains dynamic modal logic, dropdown population, field switching,
// submit handlers, validation dialog behavior, and integration with ProjectsService.
function initProjectsScreen() {
  const SERVICE_VERSION = "20260802-8";
  const RETRY_QUEUE_KEY = "hm_sheet_write_retry_queue";
  const state = {
    allProjects: [],
    filteredProjects: [],
    activeProjectKey: "",
    filters: {
      source: [],
      category: [],
      projectState: [],
    },
    sortBy: "order",
    retryQueue: [],
    retryInProgress: false,
    sheetCounts: { home: 0, vehicle: 0, repeating: 0 },
    sheetDropdowns: {
      home: {},
      vehicle: {},
      repeating: {},
    },
    addProjectOptions: {
      properties: [],
      vehicles: [],
      recurrences: [],
    },
    addProjectDraft: {
      property: "",
      vehicle: "",
      addToRepeating: false,
      recurrence: "",
    },
    addProjectResultNeedsRefresh: false,
    pendingDeleteProjectKey: "",
    isDeleting: false,
  };

  const elements = {
    source: document.getElementById("projectsFilterSource"),
    sourceSummary: document.getElementById("projectsFilterSourceSummary"),
    category: document.getElementById("projectsFilterCategory"),
    categorySummary: document.getElementById("projectsFilterCategorySummary"),
    projectState: document.getElementById("projectsFilterState"),
    projectStateSummary: document.getElementById("projectsFilterStateSummary"),
    sortBy: document.getElementById("projectsSortBy"),
    list: document.getElementById("projectsList"),
    summary: document.getElementById("projectsSummary"),
    syncStatus: document.getElementById("projectsSyncStatus"),
    duplicateBanner: document.getElementById("projectsDuplicateBanner"),
    modal: document.getElementById("projectEditModal"),
    modalForm: document.getElementById("projectEditForm"),
    modalFields: document.getElementById("projectEditFields"),
    modalMessage: document.getElementById("projectEditMessage"),
    modalClose: document.getElementById("projectEditClose"),
    modalCancel: document.getElementById("projectEditCancel"),
    modalSave: document.getElementById("projectEditSave"),
    deleteModal: document.getElementById("projectDeleteModal"),
    deleteMessage: document.getElementById("projectDeleteMessage"),
    deleteStatus: document.getElementById("projectDeleteStatus"),
    deleteClose: document.getElementById("projectDeleteClose"),
    deleteCancel: document.getElementById("projectDeleteCancel"),
    deleteConfirm: document.getElementById("projectDeleteConfirm"),
    addBtn: document.getElementById("projectsAddBtn"),
    addModal: document.getElementById("projectAddModal"),
    addForm: document.getElementById("projectAddForm"),
    addClose: document.getElementById("projectAddClose"),
    addCancel: document.getElementById("projectAddCancel"),
    addSubmit: document.getElementById("projectAddSubmit"),
    addProperty: document.getElementById("projectAddProperty"),
    addVehicle: document.getElementById("projectAddVehicle"),
    addDynamicFields: document.getElementById("projectAddDynamicFields"),
    addMessage: document.getElementById("projectAddMessage"),
    addResultModal: document.getElementById("projectAddResultModal"),
    addResultCloseTop: document.getElementById("projectAddResultCloseTop"),
    addResultClose: document.getElementById("projectAddResultClose"),
    addResultTitle: document.getElementById("projectAddResultTitle"),
    addResultMessage: document.getElementById("projectAddResultMessage"),
  };

  if (!elements.source || !elements.sourceSummary || !elements.category || !elements.categorySummary || !elements.projectState || !elements.projectStateSummary || !elements.sortBy || !elements.list || !elements.summary || !elements.syncStatus || !elements.duplicateBanner
    || !elements.modal || !elements.modalForm || !elements.modalFields || !elements.modalMessage
    || !elements.modalClose || !elements.modalCancel || !elements.modalSave
    || !elements.deleteModal || !elements.deleteMessage || !elements.deleteStatus
    || !elements.deleteClose || !elements.deleteCancel || !elements.deleteConfirm
    || !elements.addBtn || !elements.addModal || !elements.addForm || !elements.addClose
    || !elements.addCancel || !elements.addSubmit || !elements.addProperty || !elements.addVehicle
    || !elements.addDynamicFields || !elements.addMessage || !elements.addResultModal
    || !elements.addResultCloseTop || !elements.addResultClose || !elements.addResultTitle || !elements.addResultMessage) {
    return;
  }

  const controller = new AbortController();
  const isStillActive = () => window.location.hash.replace("#", "") === "projects";

  async function ensureProjectServicesLoaded() {
    await loadScriptFresh("js/services/sheets.service.js");
    await loadScriptFresh("js/services/projects.service.js");

    if (typeof window.loadAllProjects !== "function") {
      throw new Error("Project services failed to load.");
    }
  }

  function loadScriptFresh(src) {
    const versionedSrc = `${src}?v=${SERVICE_VERSION}`;

    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-module-src=\"${src}\"]`);
      if (existing) {
        existing.remove();
      }

      const script = document.createElement("script");
      script.src = versionedSrc;
      script.dataset.moduleSrc = src;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
      document.body.appendChild(script);
    });
  }

  function cleanText(value, fallback) {
    const text = value == null ? "" : String(value).trim();
    return text || fallback;
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function sourceTag(source) {
    const text = cleanText(source, "unknown").toLowerCase();

    if (text.includes("list_a") || text.includes("home")) {
      return "home";
    }

    if (text.includes("list_b") || text.includes("vehicle")) {
      return "vehicle";
    }

    if (text.includes("list_c") || text.includes("repeating")) {
      return "repeating";
    }

    return text;
  }

  function firstDefined(obj, keys) {
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] != null && String(obj[key]).trim() !== "") {
        return obj[key];
      }
    }

    return null;
  }

  function parseNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    const text = value == null ? "" : String(value).trim();
    if (!text) {
      return null;
    }

    const numeric = Number(text.replace(/[$,]/g, ""));
    return Number.isFinite(numeric) ? numeric : null;
  }

  function normalizeFieldKey(value) {
    return String(value == null ? "" : value)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
  }

  function loadRetryQueue() {
    try {
      const parsed = JSON.parse(localStorage.getItem(RETRY_QUEUE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function saveRetryQueue() {
    localStorage.setItem(RETRY_QUEUE_KEY, JSON.stringify(state.retryQueue));
  }

  function queueIdForProject(project) {
    return cleanText(project.uiKey, `${cleanText(project.source, "unknown")}::${cleanText(project.id, "unknown")}`);
  }

  function upsertQueuedWrite(project, errorMessage) {
    const queueId = queueIdForProject(project);
    const now = new Date().toISOString();
    const existingIndex = state.retryQueue.findIndex((item) => item.queueId === queueId);
    const existing = existingIndex >= 0 ? state.retryQueue[existingIndex] : null;

    const queued = {
      queueId,
      project,
      title: cleanText(project.title, "Untitled Project"),
      lastError: cleanText(errorMessage, "Unable to save."),
      attempts: existing ? Number(existing.attempts || 0) + 1 : 1,
      updatedAt: now,
    };

    if (existingIndex >= 0) {
      state.retryQueue[existingIndex] = queued;
    } else {
      state.retryQueue.push(queued);
    }

    saveRetryQueue();
    renderSyncStatus();
  }

  function removeQueuedWrite(project) {
    const queueId = queueIdForProject(project);
    const before = state.retryQueue.length;
    state.retryQueue = state.retryQueue.filter((item) => item.queueId !== queueId);

    if (state.retryQueue.length !== before) {
      saveRetryQueue();
      renderSyncStatus();
    }
  }

  function renderSyncStatus() {
    const pending = state.retryQueue.length;

    if (!pending) {
      elements.syncStatus.classList.add("hidden");
      elements.syncStatus.innerHTML = "";
      return;
    }

    const retryLabel = state.retryInProgress ? "Retrying..." : "Retry Failed Saves";
    const disabledAttr = state.retryInProgress ? "disabled" : "";

    elements.syncStatus.innerHTML = `
      <span>${pending} change${pending === 1 ? "" : "s"} pending sync to Google Sheets.</span>
      <button type="button" data-retry-sync ${disabledAttr}>${retryLabel}</button>
    `;
    elements.syncStatus.classList.remove("hidden");
  }

  function renderSummary(primaryText) {
    const home = Number(state.sheetCounts.home || 0);
    const vehicle = Number(state.sheetCounts.vehicle || 0);
    const repeating = Number(state.sheetCounts.repeating || 0);

    elements.summary.innerHTML = `
      <div>${escapeHtml(cleanText(primaryText, ""))}</div>
      <div class="projects-summary-meta">Home: ${home} | Vehicle: ${vehicle} | Repeating: ${repeating}</div>
    `;
  }

  function deriveCountsFromProjects(projects) {
    const counts = { home: 0, vehicle: 0, repeating: 0 };

    (projects || []).forEach((project) => {
      const key = sourceTag(project.source);
      if (Object.prototype.hasOwnProperty.call(counts, key)) {
        counts[key] += 1;
      }
    });

    return counts;
  }

  function getSheetRowNumber(project) {
    const row = firstDefined(project.metadata || {}, ["sheetRowNumber", "rownumber", "_rownumber"]);
    const parsed = parseNumber(row);
    return parsed == null ? null : parsed;
  }

  function collectDuplicateGroups(projects) {
    const grouped = new Map();

    (projects || []).forEach((project) => {
      const source = cleanText(project.source, "unknown").toLowerCase();
      const id = cleanText(project.id, "");
      if (!id || id === "unknown") {
        return;
      }

      const key = `${source}::${id}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          source,
          id,
          items: [],
        });
      }

      grouped.get(key).items.push(project);
    });

    return [...grouped.values()]
      .filter((group) => group.items.length > 1)
      .map((group) => {
        const items = [...group.items].sort((a, b) => {
          const rowA = getSheetRowNumber(a) || Number.MAX_SAFE_INTEGER;
          const rowB = getSheetRowNumber(b) || Number.MAX_SAFE_INTEGER;
          return rowA - rowB;
        });

        return {
          source: group.source,
          id: group.id,
          items,
        };
      })
      .sort((a, b) => b.items.length - a.items.length || a.id.localeCompare(b.id));
  }

  function renderDuplicateBanner() {
    const duplicateGroups = collectDuplicateGroups(state.allProjects);

    if (!duplicateGroups.length) {
      elements.duplicateBanner.classList.add("hidden");
      elements.duplicateBanner.innerHTML = "";
      return;
    }

    const maxGroupsToShow = 6;
    const visibleGroups = duplicateGroups.slice(0, maxGroupsToShow);
    const hiddenCount = duplicateGroups.length - visibleGroups.length;

    const groupHtml = visibleGroups
      .map((group) => {
        const rowsText = group.items
          .map((item) => {
            const row = getSheetRowNumber(item);
            const rowLabel = row == null ? "row ?" : `row ${row}`;
            return `${rowLabel}: ${escapeHtml(cleanText(item.title, "Untitled Project"))}`;
          })
          .join(" | ");

        return `<li><strong>${escapeHtml(group.source)} / ID ${escapeHtml(group.id)}</strong> (${group.items.length} rows) - ${rowsText}</li>`;
      })
      .join("");

    const moreText = hiddenCount > 0
      ? `<p class="hm-muted">+ ${hiddenCount} more duplicate group${hiddenCount === 1 ? "" : "s"}.</p>`
      : "";

    elements.duplicateBanner.innerHTML = `
      <strong>Duplicate project IDs detected. Review these rows in Google Sheets before bulk edits.</strong>
      <ul class="projects-duplicate-list">${groupHtml}</ul>
      ${moreText}
    `;
    elements.duplicateBanner.classList.remove("hidden");
  }

  async function retryQueuedWrites() {
    if (state.retryInProgress || !state.retryQueue.length) {
      return;
    }

    if (!window.SheetsService || typeof window.SheetsService.updateProjectInSheet !== "function") {
      renderSummary("Sync retry unavailable: sheet update service is not loaded.");
      return;
    }

    state.retryInProgress = true;
    renderSyncStatus();

    const nextQueue = [];
    let recovered = 0;

    for (let i = 0; i < state.retryQueue.length; i += 1) {
      const entry = state.retryQueue[i];

      try {
        const result = await window.SheetsService.updateProjectInSheet(entry.project);
        if (result && result.ok === false) {
          throw new Error(cleanText(result.error, "Remote save rejected."));
        }

        recovered += 1;
        state.allProjects = state.allProjects.map((item) => (item.uiKey === entry.project.uiKey ? entry.project : item));
      } catch (error) {
        const reason = error && error.message ? error.message : "Unable to save.";
        nextQueue.push({
          ...entry,
          attempts: Number(entry.attempts || 0) + 1,
          lastError: reason,
          updatedAt: new Date().toISOString(),
        });
      }
    }

    state.retryQueue = nextQueue;
    saveRetryQueue();
    state.retryInProgress = false;
    renderSyncStatus();

    if (recovered > 0) {
      await refreshProjectsFromSheet();
    }

    if (!state.retryQueue.length) {
      renderSummary(`Recovered ${recovered} queued change${recovered === 1 ? "" : "s"}.`);
      return;
    }

    renderSummary(`${state.retryQueue.length} queued change${state.retryQueue.length === 1 ? "" : "s"} still pending sync.`);
  }

  function toViewModel(project) {
    const metadata = {
      ...(project.metadata || {}),
    };
    const source = sourceTag(project.source);

    const priority = firstDefined(metadata, ["priority", "rank", "urgency"]);
    const order = firstDefined(metadata, ["order", "sortorder", "sequence", "displayorder"]);
    const recurrence = firstDefined(metadata, ["recurrence", "frequency", "interval"]);
    const asset = firstDefined(metadata, ["asset", "vehicle", "equipment", "assetname"]);
    const mileage = firstDefined(metadata, ["mileage", "odometer"]);
    const cost = firstDefined(metadata, ["actualCost", "estimatedCost", "cost", "budget"]);
    const sourceTabId = cleanText(metadata._sourceTabId, "");
    const sheetRowNumber = firstDefined(metadata, ["sheetRowNumber", "rownumber", "_rownumber"]);
    const keyPart = sheetRowNumber == null ? cleanText(project.id, "unknown") : cleanText(sheetRowNumber, "unknown");
    const uiKey = `${source}::${keyPart}`;

    if (sheetRowNumber != null && String(sheetRowNumber).trim() !== "") {
      const parsedRow = parseNumber(sheetRowNumber);
      if (parsedRow != null) {
        metadata.sheetRowNumber = parsedRow;
      }
    }

    // Keep immutable fingerprints to validate row targeting on the write endpoint.
    metadata._originalTitle = cleanText(metadata._originalTitle, cleanText(project.title, ""));
    metadata._originalId = cleanText(metadata._originalId, cleanText(project.id, ""));

    return {
      uiKey,
      id: cleanText(project.id, "unknown"),
      sourceTabId,
      title: cleanText(project.title, "Untitled Project"),
      source,
      category: cleanText(project.category, "uncategorized"),
      state: cleanText(project.state, "unknown"),
      priority,
      order,
      recurrence: recurrence == null ? null : cleanText(recurrence, ""),
      asset: asset == null ? null : cleanText(asset, ""),
      mileage: mileage == null ? null : cleanText(mileage, ""),
      cost: parseNumber(cost),
      metadata,
      raw: project,
    };
  }

  function getEditableFields(project) {
    const base = [
      { key: "title", label: "Title", target: "core", type: "text" },
      { key: "category", label: "Category", target: "core", type: "select" },
      { key: "state", label: "State", target: "core", type: "select" },
      { key: "priority", label: "Priority", target: "metadata", type: "select" },
      { key: "order", label: "Order", target: "metadata", type: "number" },
      { key: "recurrence", label: "Recurrence", target: "metadata", type: "select" },
      { key: "area", label: "Area", target: "metadata", type: "select" },
      { key: "actualCost", label: "Cost", target: "metadata", type: "number" },
      { key: "resourceLinks", label: "Resource Links", target: "metadata", type: "textarea" },
      { key: "notes", label: "Notes", target: "metadata", type: "textarea" },
    ];

    if (project.source === "home" || project.source === "repeating") {
      base.push(
        { key: "property", label: "Property", target: "metadata", type: "text" },
        { key: "dateCompleted", label: "Date Completed", target: "metadata", type: "text" }
      );
    }

    if (project.source === "vehicle") {
      base.push(
        { key: "vehicle", label: "Vehicle / Small Engine", target: "metadata", type: "select" },
        { key: "mileage", label: "Mileage", target: "metadata", type: "number" },
        { key: "engineHours", label: "Engine Hours", target: "metadata", type: "number" }
      );
    }

    const seen = new Set(base.map((item) => item.key));
    const nonEditableMetadataKeys = new Set(["sources", "sheetRowNumber", "rownumber", "_rowNumber", "_rownumber", "_originalTitle", "_originalId", "_sourceTabId", "_sourceGeneratedId"]);
    Object.keys(project.metadata || {}).forEach((key) => {
      if (nonEditableMetadataKeys.has(key) || seen.has(key)) {
        return;
      }

      base.push({
        key,
        label: key,
        target: "metadata",
        type: typeof project.metadata[key] === "string" && String(project.metadata[key]).length > 80 ? "textarea" : "text",
      });
      seen.add(key);
    });

    return base;
  }

  function getFieldValue(project, field) {
    if (field.target === "core") {
      return project[field.key] == null ? "" : String(project[field.key]);
    }

    const value = (project.metadata || {})[field.key];
    if (Array.isArray(value)) {
      return value.join("\n");
    }

    return value == null ? "" : String(value);
  }

  function sortDropdownValues(values) {
    const deduped = [];
    const seen = new Set();

    [...values].forEach((value) => {
      const normalized = String(value == null ? "" : value).trim();
      if (!normalized) {
        return;
      }

      const key = normalized.toLowerCase();
      if (seen.has(key)) {
        return;
      }

      seen.add(key);
      deduped.push(normalized);
    });

    return deduped.sort((a, b) => {
      const left = String(a == null ? "" : a).trim();
      const right = String(b == null ? "" : b).trim();
      const leftNumber = parseNumber(left);
      const rightNumber = parseNumber(right);

      if (leftNumber != null && rightNumber != null) {
        return leftNumber - rightNumber;
      }

      if (leftNumber != null) {
        return -1;
      }

      if (rightNumber != null) {
        return 1;
      }

      return left.localeCompare(right, undefined, { sensitivity: "base", numeric: true });
    });
  }

  function getRepeatingRecurrenceOptions(repeatingSource) {
    const recurrance = Array.isArray(repeatingSource.recurrance) ? repeatingSource.recurrance : [];
    const recurrence = Array.isArray(repeatingSource.recurrence) ? repeatingSource.recurrence : [];

    if (recurrance.length) {
      return sortDropdownValues(recurrance);
    }

    if (recurrence.length) {
      return sortDropdownValues(recurrence);
    }

    return [];
  }

  function getDefaultRecurrenceOptions() {
    const configured = window.APP_CONFIG && Array.isArray(window.APP_CONFIG.DEFAULT_RECURRENCE_OPTIONS)
      ? window.APP_CONFIG.DEFAULT_RECURRENCE_OPTIONS
      : [];

    const builtIn = [
      "Daily",
      "Weekly",
      "Bi-Weekly",
      "Monthly",
      "Quarterly",
      "Semi-Annual",
      "Annual",
    ];

    return sortDropdownValues([...configured, ...builtIn]);
  }

  function getAllSheetDropdownValues(fieldKey) {
    const values = [];
    ["home", "vehicle", "repeating"].forEach((source) => {
      const sourceDropdowns = (state.sheetDropdowns && state.sheetDropdowns[source]) || {};
      const fieldValues = Array.isArray(sourceDropdowns[fieldKey]) ? sourceDropdowns[fieldKey] : [];
      values.push(...fieldValues);
    });

    return sortDropdownValues(values);
  }

  function getAllProjectFieldValues(fieldKey) {
    const values = [];

    (state.allProjects || []).forEach((item) => {
      if (!item) {
        return;
      }

      if (fieldKey === "category") {
        values.push(item.category);
        return;
      }

      if (fieldKey === "state") {
        values.push(item.state);
        return;
      }

      if (fieldKey === "recurrence") {
        values.push(item.recurrence);
      }
    });

    return sortDropdownValues(values);
  }

  function buildMergedRecurrenceOptions() {
    const repeatingSource = (state.sheetDropdowns && state.sheetDropdowns.repeating) || {};
    const fromRepeating = getRepeatingRecurrenceOptions(repeatingSource);
    const fromAnySource = sortDropdownValues([
      ...getAllSheetDropdownValues("recurrence"),
      ...getAllSheetDropdownValues("recurrance"),
    ]);
    const fromProjects = getAllProjectFieldValues("recurrence");
    const defaults = getDefaultRecurrenceOptions();

    return sortDropdownValues([
      ...fromRepeating,
      ...fromAnySource,
      ...fromProjects,
      ...defaults,
    ]);
  }

  function extractDistinctColumnValues(rows, aliases) {
    const normalizedAliases = new Set((aliases || []).map((alias) => normalizeFieldKey(alias)));
    const values = new Set();

    (rows || []).forEach((row) => {
      if (!row || typeof row !== "object") {
        return;
      }

      const keys = Object.keys(row);
      for (let i = 0; i < keys.length; i += 1) {
        const key = keys[i];
        if (!normalizedAliases.has(normalizeFieldKey(key))) {
          continue;
        }

        const normalized = cleanText(row[key], "");
        if (normalized) {
          values.add(normalized);
        }
      }
    });

    return sortDropdownValues(values);
  }

  function getDropdownValues(project, field) {
    const fieldKey = cleanText(field && field.key, "");
    if (!fieldKey) {
      return [];
    }

    const values = new Set();

    const sourceDropdowns = state.sheetDropdowns[project.source] || {};
    const sourceValues = Array.isArray(sourceDropdowns[fieldKey]) ? sourceDropdowns[fieldKey] : [];
    sourceValues.forEach((value) => {
      const normalized = cleanText(value, "");
      if (normalized) {
        values.add(normalized);
      }
    });

    if (!sourceValues.length) {
      ["home", "vehicle", "repeating"].forEach((source) => {
        const fromSource = (((state.sheetDropdowns || {})[source] || {})[fieldKey]) || [];
        (Array.isArray(fromSource) ? fromSource : []).forEach((value) => {
          const normalized = cleanText(value, "");
          if (normalized) {
            values.add(normalized);
          }
        });
      });
    }

    state.allProjects.forEach((item) => {
      let raw = null;

      if (fieldKey === "category") {
        if (item.source === project.source) {
          raw = item.category;
        }
      } else if (fieldKey === "state") {
        if (item.source === project.source) {
          raw = item.state;
        }
      } else if (fieldKey === "priority") {
        raw = item.priority;
      } else if (fieldKey === "recurrence") {
        raw = item.recurrence;
      } else if (fieldKey === "vehicle") {
        if (item.source === "vehicle") {
          raw = item.asset || firstDefined(item.metadata || {}, ["vehicle", "asset"]);
        }
      } else if (fieldKey === "area") {
        raw = firstDefined(item.metadata || {}, ["area"]);
      }

      const normalized = cleanText(raw, "");
      if (normalized) {
        values.add(normalized);
      }
    });

    const currentValue = cleanText(getFieldValue(project, field), "");
    if (currentValue) {
      values.add(currentValue);
    }

    return sortDropdownValues(values);
  }

  async function refreshSheetDropdowns() {
    if (!window.SheetsService || typeof window.SheetsService.fetchProjectDropdownOptions !== "function") {
      state.sheetDropdowns = { home: {}, vehicle: {}, repeating: {} };
      return;
    }

    try {
      const options = await window.SheetsService.fetchProjectDropdownOptions();
      const next = { home: {}, vehicle: {}, repeating: {} };

      ["home", "vehicle", "repeating"].forEach((source) => {
        const sourceOptions = options && typeof options === "object" ? options[source] : null;
        if (!sourceOptions || typeof sourceOptions !== "object") {
          return;
        }

        Object.keys(sourceOptions).forEach((fieldKey) => {
          const rawValues = Array.isArray(sourceOptions[fieldKey]) ? sourceOptions[fieldKey] : [];
          const cleaned = sortDropdownValues(
            rawValues
              .map((value) => cleanText(value, ""))
              .filter(Boolean)
          );

          next[source][fieldKey] = cleaned;
        });
      });

      state.sheetDropdowns = next;
    } catch (error) {
      console.warn("Unable to load sheet dropdown metadata.", error);
      state.sheetDropdowns = { home: {}, vehicle: {}, repeating: {} };
    }
  }

  function setSelectValues(selectEl, values, placeholder, selectedValue) {
    const safeValues = Array.isArray(values) ? values : [];
    const optionsHtml = safeValues
      .map((value) => {
        const normalized = cleanText(value, "");
        if (!normalized) {
          return "";
        }

        const selected = normalized === cleanText(selectedValue, "") ? " selected" : "";
        const escaped = escapeHtml(normalized);
        return `<option value="${escaped}"${selected}>${escaped}</option>`;
      })
      .join("");

    selectEl.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>${optionsHtml}`;
  }

  function getAddProjectSourceType() {
    if (cleanText(elements.addProperty.value, "")) {
      return "home";
    }

    if (cleanText(elements.addVehicle.value, "")) {
      return "vehicle";
    }

    return "";
  }

  function resetAddProjectModal() {
    state.addProjectDraft = {
      property: "",
      vehicle: "",
      addToRepeating: false,
      recurrence: "",
    };

    elements.addForm.reset();
    elements.addDynamicFields.innerHTML = "";
    elements.addMessage.textContent = "";
    elements.addSubmit.disabled = false;

    setSelectValues(elements.addProperty, state.addProjectOptions.properties, "Select property", "");
    setSelectValues(elements.addVehicle, state.addProjectOptions.vehicles, "Select vehicle/engine", "");
    elements.addProperty.disabled = false;
    elements.addVehicle.disabled = false;
  }

  function openAddProjectModal() {
    resetAddProjectModal();
    renderAddProjectDynamicFields();
    elements.addModal.classList.remove("hidden");
  }

  function closeAddProjectModal() {
    elements.addModal.classList.add("hidden");
    resetAddProjectModal();
  }

  function openValidationResultDialog(message, ok) {
    elements.addResultTitle.textContent = ok ? "Validation" : "Validation Error";
    elements.addResultMessage.innerHTML = escapeHtml(cleanText(message, ok ? "Project created successfully." : "Unable to create project.")).replace(/\n/g, "<br>");
    state.addProjectResultNeedsRefresh = Boolean(ok);
    elements.addResultModal.classList.remove("hidden");
  }

  async function closeValidationResultDialog() {
    elements.addResultModal.classList.add("hidden");
    if (state.addProjectResultNeedsRefresh) {
      state.addProjectResultNeedsRefresh = false;
      await refreshProjectsFromSheet();
      renderSummary("Projects refreshed after create.");
    }
  }

  function snapshotAddProjectDraft() {
    const draft = {
      ...state.addProjectDraft,
      property: cleanText(elements.addProperty.value, ""),
      vehicle: cleanText(elements.addVehicle.value, ""),
    };

    const controls = elements.addDynamicFields.querySelectorAll("[data-add-key]");
    controls.forEach((control) => {
      const key = control.getAttribute("data-add-key");
      if (!key) {
        return;
      }

      if (control.type === "checkbox") {
        draft[key] = Boolean(control.checked);
      } else {
        draft[key] = cleanText(control.value, "");
      }
    });

    state.addProjectDraft = draft;
    return draft;
  }

  function handlePropertySelection() {
    snapshotAddProjectDraft();
    const selectedProperty = cleanText(elements.addProperty.value, "");
    if (selectedProperty) {
      elements.addVehicle.value = "";
      state.addProjectDraft.vehicle = "";
      elements.addVehicle.disabled = true;
    } else {
      elements.addVehicle.disabled = false;
    }

    state.addProjectDraft.property = selectedProperty;
    renderAddProjectDynamicFields();
  }

  function handleVehicleSelection() {
    snapshotAddProjectDraft();
    const selectedVehicle = cleanText(elements.addVehicle.value, "");
    if (selectedVehicle) {
      elements.addProperty.value = "";
      state.addProjectDraft.property = "";
      elements.addProperty.disabled = true;
    } else {
      elements.addProperty.disabled = false;
    }

    state.addProjectDraft.vehicle = selectedVehicle;
    renderAddProjectDynamicFields();
  }

  function handleRepeatingCheckbox() {
    snapshotAddProjectDraft();
    renderAddProjectDynamicFields();
  }

  function buildAddField(field) {
    const key = field.key;
    const label = escapeHtml(field.label);
    const currentValue = cleanText(state.addProjectDraft[key], "");

    if (field.type === "checkbox") {
      const checked = state.addProjectDraft[key] ? " checked" : "";
      return `
        <label class="project-add-checkbox">
          <input type="checkbox" data-add-key="${escapeHtml(key)}"${checked} />
          <span>${label}</span>
        </label>
      `;
    }

    if (field.type === "textarea") {
      return `
        <div class="project-edit-field">
          <label>${label}</label>
          <textarea data-add-key="${escapeHtml(key)}">${escapeHtml(currentValue)}</textarea>
        </div>
      `;
    }

    if (field.type === "select") {
      const options = (field.options || [])
        .map((value) => cleanText(value, ""))
        .filter(Boolean);
      const optionsHtml = options
        .map((value) => {
          const selected = value === currentValue ? " selected" : "";
          const escaped = escapeHtml(value);
          return `<option value="${escaped}"${selected}>${escaped}</option>`;
        })
        .join("");

      return `
        <div class="project-edit-field">
          <label>${label}</label>
          <select data-add-key="${escapeHtml(key)}">
            <option value=""></option>
            ${optionsHtml}
          </select>
        </div>
      `;
    }

    const inputType = field.type === "number" ? "number" : (field.type === "date" ? "date" : "text");
    return `
      <div class="project-edit-field">
        <label>${label}</label>
        <input type="${inputType}" data-add-key="${escapeHtml(key)}" value="${escapeHtml(currentValue)}" />
      </div>
    `;
  }

  function renderAddProjectDynamicFields() {
    const sourceType = getAddProjectSourceType();
    const draft = state.addProjectDraft;
    const isRepeatingChecked = Boolean(draft.addToRepeating);

    if (!sourceType) {
      elements.addDynamicFields.innerHTML = '<p class="project-add-hint">Select Property or Vehicle / Engine to continue.</p>';
      return;
    }

    const sourceDropdowns = state.sheetDropdowns[sourceType] || {};
    const fallbackProject = { source: sourceType, metadata: {} };
    const resolveOptions = (fieldKey, targetKey) => {
      const fromMetadata = sortDropdownValues(sourceDropdowns[fieldKey] || []);
      const fromProjectFallback = getDropdownValues(fallbackProject, {
        key: fieldKey,
        target: targetKey || fieldKey,
      });

      let merged = sortDropdownValues([...fromMetadata, ...fromProjectFallback]);

      // Vehicle lists are commonly sparse in row values; widen from all known dropdown/project values.
      if (sourceType === "vehicle" && (fieldKey === "state" || fieldKey === "category")) {
        merged = sortDropdownValues([
          ...merged,
          ...getAllSheetDropdownValues(fieldKey),
          ...getAllProjectFieldValues(fieldKey),
        ]);
      }

      return merged;
    };
    const baseFields = sourceType === "home"
      ? [
        { key: "title", label: "Title", type: "text" },
        { key: "area", label: "Area", type: "select", options: resolveOptions("area", "area") },
        { key: "category", label: "Category", type: "select", options: resolveOptions("category", "category") },
        { key: "priority", label: "Priority", type: "select", options: sourceDropdowns.priority || [] },
        { key: "order", label: "Order", type: "number" },
        { key: "resourceLinks", label: "ResourceLinks", type: "textarea" },
        { key: "cost", label: "Cost", type: "number" },
        { key: "state", label: "State", type: "select", options: resolveOptions("state", "state") },
        { key: "dateCompleted", label: "Date Completed", type: "date" },
        { key: "addToRepeating", label: "Add to Repeating List", type: "checkbox" },
      ]
      : [
        { key: "title", label: "Title", type: "text" },
        { key: "state", label: "State", type: "select", options: resolveOptions("state", "state") },
        { key: "category", label: "Category", type: "select", options: resolveOptions("category", "category") },
        { key: "dateCompleted", label: "Date Completed", type: "date" },
        { key: "hours", label: "Hours", type: "number" },
        { key: "mileage", label: "Mileage", type: "number" },
        { key: "mechanic", label: "Mechanic", type: "text" },
        { key: "resourceLinks", label: "ResourceLinks", type: "textarea" },
        { key: "order", label: "Order", type: "number" },
        { key: "addToRepeating", label: "Add to Repeating List", type: "checkbox" },
      ];

    const repeatingSource = ((state.sheetDropdowns || {}).repeating || {});
    let repeatingOptions = sortDropdownValues([
      ...(Array.isArray(state.addProjectOptions.recurrences) ? state.addProjectOptions.recurrences : []),
      ...buildMergedRecurrenceOptions(),
    ]);
    if (!repeatingOptions.length) {
      repeatingOptions = sortDropdownValues([
        ...getRepeatingRecurrenceOptions(repeatingSource),
        ...getDropdownValues({ source: "repeating", metadata: {} }, {
          key: "recurrence",
          target: "recurrence",
        }),
      ]);
    }

    const allFields = isRepeatingChecked
      ? [...baseFields, { key: "recurrence", label: "Recurrance", type: "select", options: repeatingOptions }]
      : baseFields;

    elements.addDynamicFields.innerHTML = allFields.map(buildAddField).join("");

    const repeatingCheckbox = elements.addDynamicFields.querySelector('input[data-add-key="addToRepeating"]');
    if (repeatingCheckbox) {
      repeatingCheckbox.addEventListener("change", handleRepeatingCheckbox, { signal: controller.signal });
    }
  }

  async function refreshAddProjectOptions() {
    try {
      const [homeSheet, vehicleSheet] = await Promise.all([
        window.SheetsService.fetchHomeSheet(),
        window.SheetsService.fetchVehicleSheet(),
      ]);

      const homeRows = homeSheet && Array.isArray(homeSheet.rows) ? homeSheet.rows : [];
      const vehicleRows = vehicleSheet && Array.isArray(vehicleSheet.rows) ? vehicleSheet.rows : [];
      const recurrenceOptions = buildMergedRecurrenceOptions();

      state.addProjectOptions = {
        properties: extractDistinctColumnValues(homeRows, ["Property"]),
        vehicles: extractDistinctColumnValues(vehicleRows, ["Vehicle/Small Engine", "Vehicle"]),
        recurrences: recurrenceOptions,
      };
    } catch (error) {
      console.warn("Unable to load add-project source options.", error);
      state.addProjectOptions = {
        properties: [],
        vehicles: [],
        recurrences: [],
      };
    }
  }

  function validateNewProjectDraft(draft) {
    if (!cleanText(draft.property, "") && !cleanText(draft.vehicle, "")) {
      return "Select Property or Vehicle / Engine.";
    }

    if (!cleanText(draft.title, "")) {
      return "Title is required.";
    }

    if (!cleanText(draft.category, "")) {
      return "Category is required.";
    }

    if (!cleanText(draft.state, "")) {
      return "State is required.";
    }

    if (draft.addToRepeating && !cleanText(draft.recurrence, "")) {
      return "Recurrance is required when Add to Repeating List is checked.";
    }

    return "";
  }

  async function submitNewProject() {
    if (elements.addSubmit.disabled) {
      return;
    }

    const draft = snapshotAddProjectDraft();
    const validationError = validateNewProjectDraft(draft);
    if (validationError) {
      elements.addMessage.textContent = validationError;
      openValidationResultDialog(validationError, false);
      return;
    }

    elements.addSubmit.disabled = true;
    elements.addMessage.textContent = "Submitting...";

    try {
      if (!window.ProjectsService || typeof window.ProjectsService.createProject !== "function") {
        throw new Error("ProjectsService.createProject is unavailable.");
      }

      const result = await window.ProjectsService.createProject({
        property: cleanText(draft.property, ""),
        vehicle: cleanText(draft.vehicle, ""),
        title: cleanText(draft.title, ""),
        area: cleanText(draft.area, ""),
        category: cleanText(draft.category, ""),
        priority: cleanText(draft.priority, ""),
        order: cleanText(draft.order, ""),
        resourceLinks: cleanText(draft.resourceLinks, ""),
        cost: cleanText(draft.cost, ""),
        state: cleanText(draft.state, ""),
        dateCompleted: cleanText(draft.dateCompleted, ""),
        hours: cleanText(draft.hours, ""),
        mileage: cleanText(draft.mileage, ""),
        mechanic: cleanText(draft.mechanic, ""),
        addToRepeating: Boolean(draft.addToRepeating),
        recurrence: cleanText(draft.recurrence, ""),
      });

      if (!result || result.ok === false) {
        throw new Error(cleanText(result && result.error, "Unable to create project."));
      }

      elements.addMessage.textContent = "Project created successfully.";
      closeAddProjectModal();
      const detailMessage = [
        "Project created successfully.",
        result.id ? `ID: ${result.id}` : "",
        result.tabName ? `Sheet: ${result.tabName}` : "",
        (result.rowNumber != null && result.rowNumber !== "") ? `Row: ${result.rowNumber}` : "",
      ].filter(Boolean).join("\n");
      openValidationResultDialog(detailMessage, true);
    } catch (error) {
      const reason = error && error.message ? error.message : "Unable to create project.";
      elements.addMessage.textContent = reason;
      openValidationResultDialog(reason, false);
    } finally {
      elements.addSubmit.disabled = false;
    }
  }

  function openEditModal(project) {
    state.activeProjectKey = project.uiKey;
    const fields = getEditableFields(project);
    const sourceTabId = cleanText(project.sourceTabId || firstDefined(project.metadata || {}, ["_sourceTabId"]), "");
    const displayId = sourceTabId || cleanText(project.id, "");
    const modalTitle = document.getElementById("projectEditTitle");
    if (modalTitle) {
      const suffix = displayId ? ` (ID: ${displayId})` : "";
      modalTitle.textContent = `Edit Project Details${suffix}`;
    }

    elements.modalFields.innerHTML = fields
      .map((field) => {
        const value = escapeHtml(getFieldValue(project, field));
        const label = escapeHtml(field.label);
        const key = escapeHtml(field.key);
        const target = escapeHtml(field.target);

        if (field.type === "textarea") {
          return `
            <div class="project-edit-field">
              <label>${label}</label>
              <textarea data-field-key="${key}" data-field-target="${target}">${value}</textarea>
            </div>
          `;
        }

        if (field.type === "select") {
          const options = getDropdownValues(project, field);
          const selectedValue = cleanText(getFieldValue(project, field), "");
          const optionHtml = options
            .map((option) => {
              const escapedOption = escapeHtml(option);
              const selectedAttr = cleanText(option, "") === selectedValue ? " selected" : "";
              return `<option value="${escapedOption}"${selectedAttr}>${escapedOption}</option>`;
            })
            .join("");

          return `
            <div class="project-edit-field">
              <label>${label}</label>
              <select data-field-key="${key}" data-field-target="${target}">
                <option value=""></option>
                ${optionHtml}
              </select>
            </div>
          `;
        }

        const inputType = field.type === "number" ? "number" : "text";
        return `
          <div class="project-edit-field">
            <label>${label}</label>
            <input type="${inputType}" data-field-key="${key}" data-field-target="${target}" value="${value}" />
          </div>
        `;
      })
      .join("");

    elements.modalMessage.textContent = "";
    elements.modal.classList.remove("hidden");
  }

  function closeEditModal() {
    state.activeProjectKey = "";
    const modalTitle = document.getElementById("projectEditTitle");
    if (modalTitle) {
      modalTitle.textContent = "Edit Project Details";
    }
    elements.modal.classList.add("hidden");
    elements.modalFields.innerHTML = "";
    elements.modalMessage.textContent = "";
  }

  function openDeleteModal(project) {
    state.pendingDeleteProjectKey = project.uiKey;
    elements.deleteStatus.textContent = "";
    elements.deleteMessage.textContent = "Are you sure you want to delete this project? This cannot be undone.";
    elements.deleteConfirm.disabled = false;
    elements.deleteCancel.disabled = false;
    elements.deleteClose.disabled = false;
    elements.deleteModal.classList.remove("hidden");
  }

  function closeDeleteModal() {
    state.pendingDeleteProjectKey = "";
    elements.deleteStatus.textContent = "";
    elements.deleteConfirm.disabled = false;
    elements.deleteCancel.disabled = false;
    elements.deleteClose.disabled = false;
    elements.deleteModal.classList.add("hidden");
  }

  function removeProjectFromState(project) {
    state.allProjects = state.allProjects.filter((item) => item.uiKey !== project.uiKey);
    state.filteredProjects = state.filteredProjects.filter((item) => item.uiKey !== project.uiKey);
    removeQueuedWrite(project);

    if (state.activeProjectKey === project.uiKey) {
      closeEditModal();
    }

    state.sheetCounts = deriveCountsFromProjects(state.allProjects);
    renderDuplicateBanner();
    updateFilters();
    applyFiltersAndSort();
  }

  function restoreProjectInState(project, previousAllProjects) {
    const restored = [...previousAllProjects];
    const exists = restored.some((item) => item.uiKey === project.uiKey);
    if (!exists) {
      restored.push(project);
    }

    state.allProjects = restored;
    state.sheetCounts = deriveCountsFromProjects(state.allProjects);
    renderDuplicateBanner();
    updateFilters();
    applyFiltersAndSort();
  }

  async function confirmDeleteProject() {
    if (state.isDeleting) {
      return;
    }

    const project = state.allProjects.find((item) => item.uiKey === state.pendingDeleteProjectKey);
    if (!project) {
      closeDeleteModal();
      return;
    }

    const previousAllProjects = [...state.allProjects];
    state.isDeleting = true;

    // Close quickly and remove locally so the UI does not wait on network latency.
    closeDeleteModal();
    removeProjectFromState(project);
    renderSummary(`Deleting \"${project.title}\"...`);

    try {
      if (!window.SheetsService || typeof window.SheetsService.deleteProject !== "function") {
        throw new Error("Sheet delete service is unavailable.");
      }

      const result = await window.SheetsService.deleteProject(project);
      if (result && result.ok === false) {
        throw new Error(cleanText(result.error, "Remote delete rejected."));
      }

      if (window.ProjectsService && typeof window.ProjectsService.deleteProject === "function") {
        window.ProjectsService.deleteProject(project);
      }

      console.log("Project deleted successfully.", {
        id: project.id,
        source: project.source,
        uiKey: project.uiKey,
      });

      renderSummary(`Deleted \"${project.title}\".`);
      state.isDeleting = false;
    } catch (error) {
      const reason = error && error.message ? error.message : "Unable to delete project.";
      console.error("Project deletion failed.", {
        id: project.id,
        source: project.source,
        uiKey: project.uiKey,
        error: reason,
      });

      restoreProjectInState(project, previousAllProjects);
      openDeleteModal(project);
      elements.deleteStatus.textContent = reason;
      elements.deleteConfirm.disabled = false;
      elements.deleteCancel.disabled = false;
      elements.deleteClose.disabled = false;
      renderSummary("Delete failed. Project restored.");
      state.isDeleting = false;
    }
  }

  function applyFormValues(project) {
    const updated = {
      ...project,
      metadata: {
        ...(project.metadata || {}),
      },
    };

    // Preserve stable identity fields so writes keep targeting the original sheet row.
    const originalSheetRowNumber = firstDefined(project.metadata || {}, ["sheetRowNumber", "rownumber", "_rownumber"]);
    const originalRowNumber = (project.metadata || {}).rownumber;
    const originalTitle = (project.metadata || {})._originalTitle;
    const originalId = (project.metadata || {})._originalId;

    const controls = elements.modalFields.querySelectorAll("[data-field-key]");
    controls.forEach((control) => {
      const key = control.getAttribute("data-field-key");
      const target = control.getAttribute("data-field-target");
      const raw = String(control.value == null ? "" : control.value).trim();

      let parsed = raw;
      if (key === "actualCost" || key === "estimatedCost" || key === "mileage" || key === "engineHours" || key === "order") {
        const num = parseNumber(raw);
        parsed = num == null ? raw : num;
      }

      if (key === "resourceLinks") {
        parsed = raw
          .split(/[\n,;|]+/g)
          .map((item) => item.trim())
          .filter(Boolean);
      }

      if (target === "core") {
        updated[key] = raw;
      } else {
        updated.metadata[key] = parsed;
      }
    });

    updated.priority = firstDefined(updated.metadata, ["priority", "rank", "urgency"]);
    updated.order = firstDefined(updated.metadata, ["order", "sortorder", "sequence", "displayorder"]);
    updated.recurrence = firstDefined(updated.metadata, ["recurrence", "frequency", "interval"]);
    updated.asset = firstDefined(updated.metadata, ["asset", "vehicle", "equipment", "assetname"]);
    updated.mileage = firstDefined(updated.metadata, ["mileage", "odometer"]);
    updated.cost = parseNumber(firstDefined(updated.metadata, ["actualCost", "estimatedCost", "cost", "budget"]));

    if (originalSheetRowNumber != null && String(originalSheetRowNumber).trim() !== "") {
      const parsedRow = parseNumber(originalSheetRowNumber);
      updated.metadata.sheetRowNumber = parsedRow == null ? originalSheetRowNumber : parsedRow;
    }

    if (originalRowNumber != null && String(originalRowNumber).trim() !== "") {
      updated.metadata.rownumber = originalRowNumber;
    }

    if (originalTitle != null && String(originalTitle).trim() !== "") {
      updated.metadata._originalTitle = originalTitle;
    }

    if (originalId != null && String(originalId).trim() !== "") {
      updated.metadata._originalId = originalId;
    }

    return updated;
  }

  async function saveProjectDetails() {
    const activeProject = state.allProjects.find((item) => item.uiKey === state.activeProjectKey);
    if (!activeProject) {
      return;
    }

    const updated = applyFormValues(activeProject);
    elements.modalMessage.textContent = "Saving changes...";
    elements.modalSave.disabled = true;

    try {
      if (!window.SheetsService || typeof window.SheetsService.updateProjectInSheet !== "function") {
        throw new Error("Sheet update service is unavailable.");
      }

      const result = await window.SheetsService.updateProjectInSheet(updated);
      if (result && result.ok === false) {
        throw new Error(cleanText(result.error, "Remote save rejected."));
      }

      await refreshProjectsFromSheet();
      removeQueuedWrite(updated);

      const refreshedProject = state.allProjects.find((item) => item.uiKey === updated.uiKey);
      const refreshedTitle = cleanText(refreshedProject && refreshedProject.title, "");
      const expectedTitle = cleanText(updated.title, "");

      if (refreshedProject && refreshedTitle === expectedTitle) {
        renderSummary(`Saved changes for \"${updated.title}\".`);
      } else {
        renderSummary("Save request sent and data reloaded from Google Sheets.");
      }

      closeEditModal();
    } catch (error) {
      const reason = error && error.message ? error.message : "Unable to save.";
      upsertQueuedWrite(updated, reason);
      elements.modalMessage.textContent = `${reason} Change queued locally; use \"Retry Failed Saves\" to sync later.`;
      renderSummary("Save failed. Change queued for retry.");
    } finally {
      elements.modalSave.disabled = false;
    }
  }

  function normalizeArrayValues(values) {
    const unique = [];
    const seen = new Set();

    (values || []).forEach((value) => {
      const cleaned = cleanText(value, "");
      if (!cleaned) {
        return;
      }

      const key = cleaned.toLowerCase();
      if (seen.has(key)) {
        return;
      }

      seen.add(key);
      unique.push(cleaned);
    });

    return unique;
  }

  function defaultSelectedValues(filterKey, availableValues) {
    const available = normalizeArrayValues(availableValues);
    if (filterKey === "projectState") {
      const nonCompleted = available.filter((value) => normalizeFieldKey(value) !== "completed");
      return nonCompleted.length ? nonCompleted : available;
    }

    return available;
  }

  function normalizeSelectedValues(filterKey, selectedValues, availableValues) {
    const available = normalizeArrayValues(availableValues);
    const availableSet = new Set(available.map((value) => value.toLowerCase()));
    const selected = normalizeArrayValues(selectedValues).filter((value) => availableSet.has(value.toLowerCase()));

    if (selected.length) {
      return selected;
    }

    return defaultSelectedValues(filterKey, available);
  }

  function sourceLabel(value) {
    const key = cleanText(value, "").toLowerCase();
    if (key === "home") {
      return "Home";
    }

    if (key === "vehicle") {
      return "Vehicle";
    }

    if (key === "repeating") {
      return "Repeating";
    }

    return cleanText(value, "");
  }

  function filterOptionLabel(filterKey, value) {
    if (filterKey === "source") {
      return sourceLabel(value);
    }

    return cleanText(value, "");
  }

  function renderFilterOptions(filterKey, containerEl, availableValues, selectedValues) {
    const available = normalizeArrayValues(availableValues);
    const selected = normalizeSelectedValues(filterKey, selectedValues, available);
    const selectedSet = new Set(selected.map((value) => value.toLowerCase()));

    const optionRows = available.map((value) => {
      const checked = selectedSet.has(value.toLowerCase()) ? " checked" : "";
      const optionId = `projectsFilter${filterKey}_${normalizeFieldKey(value)}`;
      const escapedValue = escapeHtml(value);
      const label = escapeHtml(filterOptionLabel(filterKey, value));

      return `
        <label class="projects-filter-option" for="${optionId}">
          <input id="${optionId}" type="checkbox" data-filter-key="${filterKey}" data-filter-value="${escapedValue}" value="${escapedValue}"${checked} />
          <span>${label}</span>
        </label>
      `;
    }).join("");

    containerEl.innerHTML = `
      <div class="projects-filter-actions">
        <button type="button" class="projects-filter-action-btn" data-filter-key="${escapeHtml(filterKey)}" data-filter-action="all">Select all</button>
        <button type="button" class="projects-filter-action-btn" data-filter-key="${escapeHtml(filterKey)}" data-filter-action="clear">Clear</button>
      </div>
      ${optionRows}
    `;

    return selected;
  }

  function getFilterContainer(filterKey) {
    if (filterKey === "source") {
      return elements.source;
    }

    if (filterKey === "category") {
      return elements.category;
    }

    return elements.projectState;
  }

  function getFilterSummaryElement(filterKey) {
    if (filterKey === "source") {
      return elements.sourceSummary;
    }

    if (filterKey === "category") {
      return elements.categorySummary;
    }

    return elements.projectStateSummary;
  }

  function getFilterAvailableValues(filterKey) {
    if (filterKey === "source") {
      return ["home", "vehicle", "repeating"];
    }

    const container = getFilterContainer(filterKey);
    return Array.from(container.querySelectorAll("input[data-filter-value]"))
      .map((input) => cleanText(input.value, ""));
  }

  function applyFilterCheckboxSelection(filterKey, selectedValues, availableValues) {
    const container = getFilterContainer(filterKey);
    const summary = getFilterSummaryElement(filterKey);
    const normalized = normalizeSelectedValues(filterKey, selectedValues, availableValues);

    state.filters[filterKey] = renderFilterOptions(filterKey, container, availableValues, normalized);
    updateFilterSummary(filterKey, summary, state.filters[filterKey], availableValues);
    applyFiltersAndSort();
  }

  function handleFilterContainerChange(filterKey) {
    const container = getFilterContainer(filterKey);
    const availableValues = getFilterAvailableValues(filterKey);
    const selectedValues = Array.from(container.querySelectorAll("input[data-filter-value]:checked"))
      .map((input) => cleanText(input.value, ""));

    applyFilterCheckboxSelection(filterKey, selectedValues, availableValues);
  }

  function handleFilterActionClick(filterKey, action) {
    const availableValues = getFilterAvailableValues(filterKey);
    if (action === "all") {
      applyFilterCheckboxSelection(filterKey, availableValues, availableValues);
      return;
    }

    if (action === "clear") {
      if (filterKey === "projectState") {
        const noCompleted = availableValues.filter((value) => normalizeFieldKey(value) !== "completed");
        applyFilterCheckboxSelection(filterKey, noCompleted, availableValues);
        return;
      }

      applyFilterCheckboxSelection(filterKey, availableValues, availableValues);
    }
  }

  function sameSet(left, right) {
    const a = new Set((left || []).map((value) => cleanText(value, "").toLowerCase()));
    const b = new Set((right || []).map((value) => cleanText(value, "").toLowerCase()));

    if (a.size !== b.size) {
      return false;
    }

    for (const value of a) {
      if (!b.has(value)) {
        return false;
      }
    }

    return true;
  }

  function updateFilterSummary(filterKey, summaryEl, selectedValues, availableValues) {
    const available = normalizeArrayValues(availableValues);
    const selected = normalizeArrayValues(selectedValues);

    if (!available.length) {
      summaryEl.textContent = "No options";
      return;
    }

    if (filterKey === "projectState") {
      const defaultStateSet = defaultSelectedValues("projectState", available);
      if (sameSet(selected, defaultStateSet)) {
        summaryEl.textContent = "All states except Completed";
        return;
      }
    }

    if (sameSet(selected, available)) {
      summaryEl.textContent = filterKey === "source"
        ? "All sources"
        : filterKey === "category"
          ? "All categories"
          : "All states";
      return;
    }

    if (selected.length <= 2) {
      summaryEl.textContent = selected.map((value) => filterOptionLabel(filterKey, value)).join(", ");
      return;
    }

    summaryEl.textContent = `${selected.length} selected`;
  }

  function updateFilters() {
    const sources = ["home", "vehicle", "repeating"];
    const categories = [...new Set(state.allProjects.map((p) => p.category).filter(Boolean))].sort();
    const states = [...new Set(state.allProjects.map((p) => p.state).filter(Boolean))].sort();

    state.filters.source = renderFilterOptions("source", elements.source, sources, state.filters.source);
    state.filters.category = renderFilterOptions("category", elements.category, categories, state.filters.category);
    state.filters.projectState = renderFilterOptions("projectState", elements.projectState, states, state.filters.projectState);

    updateFilterSummary("source", elements.sourceSummary, state.filters.source, sources);
    updateFilterSummary("category", elements.categorySummary, state.filters.category, categories);
    updateFilterSummary("projectState", elements.projectStateSummary, state.filters.projectState, states);
  }

  function applySort(items) {
    const sorted = [...items];

    sorted.sort((a, b) => {
      if (state.sortBy === "priority") {
        const pa = parseNumber(a.priority);
        const pb = parseNumber(b.priority);
        if (pa != null && pb != null) return pa - pb;
        if (pa != null) return -1;
        if (pb != null) return 1;
        return a.title.localeCompare(b.title);
      }

      if (state.sortBy === "order") {
        const oa = parseNumber(a.order);
        const ob = parseNumber(b.order);
        if (oa != null && ob != null) return oa - ob;
        if (oa != null) return -1;
        if (ob != null) return 1;
        return a.title.localeCompare(b.title);
      }

      return a.category.localeCompare(b.category) || a.title.localeCompare(b.title);
    });

    return sorted;
  }

  function applyFiltersAndSort() {
    const { source, category, projectState } = state.filters;
    const sourceSet = new Set(source || []);
    const categorySet = new Set(category || []);
    const stateSet = new Set(projectState || []);

    const filtered = state.allProjects.filter((project) => {
      if (sourceSet.size && !sourceSet.has(project.source)) {
        return false;
      }

      if (categorySet.size && !categorySet.has(project.category)) {
        return false;
      }

      if (stateSet.size && !stateSet.has(project.state)) {
        return false;
      }

      return true;
    });

    state.filteredProjects = applySort(filtered);
    renderProjects();
  }

  function formatCost(cost) {
    if (cost == null || Number.isNaN(cost)) {
      return "-";
    }

    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(cost);
  }

  function renderProjects() {
    const items = state.filteredProjects;
    renderSummary(`${items.length} of ${state.allProjects.length} projects shown`);

    if (!items.length) {
      elements.list.innerHTML = '<div class="projects-empty">No projects match the selected filters.</div>';
      return;
    }

    const html = items
      .map((project) => {
        const sourceDisplay = cleanText(project.source, "unknown");
        const recurrence = project.recurrence ? cleanText(project.recurrence, "") : "-";
        const priority = project.priority != null && String(project.priority).trim() !== "" ? project.priority : "-";
        const displayId = project.sourceTabId || "-";
        const explicitOrder = firstDefined(project.metadata || {}, ["order"]);
        const orderText = explicitOrder != null && String(explicitOrder).trim() !== ""
          ? cleanText(explicitOrder, "")
          : "";
        const title = escapeHtml(project.title);
        const titleId = escapeHtml(displayId);
        const orderBadgeClass = orderText ? "project-title-order-badge" : "project-title-order-badge is-empty";
        const orderBadgeText = orderText ? `Order: ${escapeHtml(orderText)}` : "&nbsp;";
        const orderBadge = `<span class="${orderBadgeClass}">${orderBadgeText}</span>`;

        const vehicleFields = sourceDisplay === "vehicle"
          ? `<div class="project-field"><strong>Asset:</strong> ${project.asset || "-"}</div>
             <div class="project-field"><strong>Mileage:</strong> ${project.mileage || "-"}</div>`
          : "";

        const homeCostField = sourceDisplay === "home"
          ? `<div class="project-field"><strong>Cost:</strong> ${formatCost(project.cost)}</div>`
          : "";

        return `
          <article class="project-card" data-project-key="${project.uiKey}">
            <h2 class="project-card-title"><span class="project-title-main">${title} <span class="project-title-id">(ID: ${titleId})</span></span>${orderBadge}</h2>
            <div class="project-grid">
              <div class="project-field"><strong>Source:</strong> ${sourceDisplay}</div>
              <div class="project-field"><strong>Category:</strong> ${project.category}</div>
              <div class="project-field"><strong>State:</strong> ${project.state}</div>
              <div class="project-field"><strong>Priority:</strong> ${priority}</div>
              <div class="project-field"><strong>Recurrence:</strong> ${recurrence}</div>
              ${vehicleFields}
              ${homeCostField}
            </div>
            <div class="project-actions">
              <button type="button" class="edit-details-btn" data-project-key="${project.uiKey}">Edit Details</button>
              <button type="button" class="primary add-task-btn" data-project-key="${project.uiKey}">Add to Task Manager</button>
              <button type="button" class="project-delete-btn" data-project-key="${project.uiKey}">Delete</button>
            </div>
          </article>
        `;
      })
      .join("");

    elements.list.innerHTML = html;
  }

  function addToTaskManager(project) {
    const key = "hm_task_manager_tasks";
    const existing = JSON.parse(localStorage.getItem(key) || "[]");
    const rowNumber = firstDefined(project.metadata || {}, ["sheetRowNumber", "rownumber", "_rownumber"]);
    const taskId = `task-${project.source}-${rowNumber == null ? project.id : rowNumber}`;
    const record = {
      taskId,
      projectId: project.id,
      title: project.title,
      source: project.source,
      category: project.category,
      state: project.state,
      priority: parseNumber(project.priority) ?? 3,
      order: parseNumber(project.order) ?? (existing.length + 1),
      recurrence: project.recurrence || "",
      asset: project.asset || "",
      mileage: project.mileage || "",
      updatedAt: new Date().toISOString(),
    };

    const index = existing.findIndex((item) => item.taskId === taskId);
    if (index >= 0) {
      existing[index] = {
        ...existing[index],
        ...record,
      };
    } else {
      existing.push(record);
    }

    localStorage.setItem(key, JSON.stringify(existing));
    renderSummary(`Added \"${project.title}\" to Task Manager.`);
  }

  function attachEvents() {
    elements.sortBy.value = state.sortBy;

    elements.addBtn.addEventListener("click", openAddProjectModal, { signal: controller.signal });
    elements.addClose.addEventListener("click", closeAddProjectModal, { signal: controller.signal });
    elements.addCancel.addEventListener("click", closeAddProjectModal, { signal: controller.signal });
    elements.addModal.addEventListener("click", (event) => {
      if (event.target === elements.addModal) {
        closeAddProjectModal();
      }
    }, { signal: controller.signal });
    elements.addResultCloseTop.addEventListener("click", () => {
      closeValidationResultDialog().catch((error) => console.error(error));
    }, { signal: controller.signal });
    elements.addResultClose.addEventListener("click", () => {
      closeValidationResultDialog().catch((error) => console.error(error));
    }, { signal: controller.signal });

    elements.addProperty.addEventListener("change", handlePropertySelection, { signal: controller.signal });
    elements.addVehicle.addEventListener("change", handleVehicleSelection, { signal: controller.signal });
    elements.addForm.addEventListener("submit", (event) => {
      event.preventDefault();
      submitNewProject();
    }, { signal: controller.signal });

    elements.source.addEventListener("change", (event) => {
      const checkbox = event.target.closest("input[type=checkbox][data-filter-value]");
      if (!checkbox) {
        return;
      }

      handleFilterContainerChange("source");
    }, { signal: controller.signal });

    elements.category.addEventListener("change", (event) => {
      const checkbox = event.target.closest("input[type=checkbox][data-filter-value]");
      if (!checkbox) {
        return;
      }

      handleFilterContainerChange("category");
    }, { signal: controller.signal });

    elements.projectState.addEventListener("change", (event) => {
      const checkbox = event.target.closest("input[type=checkbox][data-filter-value]");
      if (!checkbox) {
        return;
      }

      handleFilterContainerChange("projectState");
    }, { signal: controller.signal });

    elements.source.addEventListener("click", (event) => {
      const actionBtn = event.target.closest("button[data-filter-action]");
      if (!actionBtn) {
        return;
      }

      handleFilterActionClick("source", actionBtn.getAttribute("data-filter-action"));
    }, { signal: controller.signal });

    elements.category.addEventListener("click", (event) => {
      const actionBtn = event.target.closest("button[data-filter-action]");
      if (!actionBtn) {
        return;
      }

      handleFilterActionClick("category", actionBtn.getAttribute("data-filter-action"));
    }, { signal: controller.signal });

    elements.projectState.addEventListener("click", (event) => {
      const actionBtn = event.target.closest("button[data-filter-action]");
      if (!actionBtn) {
        return;
      }

      handleFilterActionClick("projectState", actionBtn.getAttribute("data-filter-action"));
    }, { signal: controller.signal });

    elements.sortBy.addEventListener("change", () => {
      state.sortBy = elements.sortBy.value;
      applyFiltersAndSort();
    }, { signal: controller.signal });

    elements.modalClose.addEventListener("click", closeEditModal, { signal: controller.signal });
    elements.modalCancel.addEventListener("click", closeEditModal, { signal: controller.signal });
    elements.modal.addEventListener("click", (event) => {
      if (event.target === elements.modal) {
        closeEditModal();
      }
    }, { signal: controller.signal });

    elements.modalForm.addEventListener("submit", (event) => {
      event.preventDefault();
      saveProjectDetails();
    }, { signal: controller.signal });

    elements.deleteClose.addEventListener("click", closeDeleteModal, { signal: controller.signal });
    elements.deleteCancel.addEventListener("click", closeDeleteModal, { signal: controller.signal });
    elements.deleteConfirm.addEventListener("click", () => {
      confirmDeleteProject();
    }, { signal: controller.signal });
    elements.deleteModal.addEventListener("click", (event) => {
      if (event.target === elements.deleteModal) {
        closeDeleteModal();
      }
    }, { signal: controller.signal });

    elements.list.addEventListener("click", (event) => {
      const detailsBtn = event.target.closest(".edit-details-btn");
      const addBtn = event.target.closest(".add-task-btn");
      const deleteBtn = event.target.closest(".project-delete-btn");

      if (!detailsBtn && !addBtn && !deleteBtn) {
        return;
      }

      const projectKey = (detailsBtn || addBtn || deleteBtn).getAttribute("data-project-key");
      const project = state.filteredProjects.find((item) => item.uiKey === projectKey);
      if (!project) {
        return;
      }

      if (detailsBtn) {
        openEditModal(project);
      }

      if (addBtn) {
        addToTaskManager(project);
      }

      if (deleteBtn) {
        openDeleteModal(project);
      }
    }, { signal: controller.signal });

    elements.syncStatus.addEventListener("click", (event) => {
      const retryBtn = event.target.closest("[data-retry-sync]");
      if (!retryBtn) {
        return;
      }

      retryQueuedWrites();
    }, { signal: controller.signal });

    const teardownIfRouteChanges = () => {
      if (!isStillActive()) {
        controller.abort();
        window.removeEventListener("hashchange", teardownIfRouteChanges);
      }
    };

    window.addEventListener("hashchange", teardownIfRouteChanges);
  }

  async function loadProjects() {
    renderSummary("Loading projects...");
    state.retryQueue = loadRetryQueue();
    renderSyncStatus();

    await ensureProjectServicesLoaded();
    await refreshProjectsFromSheet();
  }

  async function refreshProjectsFromSheet() {
    const [projects] = await Promise.all([
      window.loadAllProjects(),
      refreshSheetDropdowns(),
    ]);

    await refreshAddProjectOptions();

    if (!isStillActive()) {
      return;
    }

    state.allProjects = (projects || []).map(toViewModel);
    const stats = window.ProjectsService && window.ProjectsService.lastLoadStats;
    state.sheetCounts = (stats && stats.effective)
      ? {
        home: Number(stats.effective.home || 0),
        vehicle: Number(stats.effective.vehicle || 0),
        repeating: Number(stats.effective.repeating || 0),
      }
      : deriveCountsFromProjects(state.allProjects);
    renderDuplicateBanner();
    updateFilters();
    applyFiltersAndSort();
  }

  attachEvents();
  loadProjects().catch((error) => {
    console.error(error);
    const reason = error && error.message ? error.message : "Unknown error";
    renderSummary("Unable to load projects.");
    elements.list.innerHTML = `<div class="projects-empty">Failed to load projects data. ${reason}</div>`;
  });
}

window.initProjectsScreen = initProjectsScreen;
