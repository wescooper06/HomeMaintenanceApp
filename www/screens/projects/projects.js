function initProjectsScreen() {
  const SERVICE_VERSION = "20260728-13";
  const RETRY_QUEUE_KEY = "hm_sheet_write_retry_queue";
  const state = {
    allProjects: [],
    filteredProjects: [],
    activeProjectKey: "",
    filters: {
      source: "all",
      category: "all",
      projectState: "all",
    },
    sortBy: "priority",
    retryQueue: [],
    retryInProgress: false,
    sheetCounts: { home: 0, vehicle: 0, repeating: 0 },
  };

  const elements = {
    source: document.getElementById("projectsFilterSource"),
    category: document.getElementById("projectsFilterCategory"),
    projectState: document.getElementById("projectsFilterState"),
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
  };

  if (!elements.source || !elements.category || !elements.projectState || !elements.sortBy || !elements.list || !elements.summary || !elements.syncStatus || !elements.duplicateBanner
    || !elements.modal || !elements.modalForm || !elements.modalFields || !elements.modalMessage
    || !elements.modalClose || !elements.modalCancel || !elements.modalSave) {
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
      { key: "category", label: "Category", target: "core", type: "text" },
      { key: "state", label: "State", target: "core", type: "text" },
      { key: "priority", label: "Priority", target: "metadata", type: "text" },
      { key: "order", label: "Order", target: "metadata", type: "number" },
      { key: "recurrence", label: "Recurrence", target: "metadata", type: "text" },
      { key: "actualCost", label: "Cost", target: "metadata", type: "number" },
      { key: "resourceLinks", label: "Resource Links", target: "metadata", type: "textarea" },
      { key: "notes", label: "Notes", target: "metadata", type: "textarea" },
    ];

    if (project.source === "home" || project.source === "repeating") {
      base.push(
        { key: "property", label: "Property", target: "metadata", type: "text" },
        { key: "area", label: "Area", target: "metadata", type: "text" },
        { key: "dateCompleted", label: "Date Completed", target: "metadata", type: "text" }
      );
    }

    if (project.source === "vehicle") {
      base.push(
        { key: "vehicle", label: "Vehicle / Small Engine", target: "metadata", type: "text" },
        { key: "mileage", label: "Mileage", target: "metadata", type: "number" },
        { key: "engineHours", label: "Engine Hours", target: "metadata", type: "number" }
      );
    }

    const seen = new Set(base.map((item) => item.key));
    const nonEditableMetadataKeys = new Set(["sources", "sheetRowNumber", "rownumber", "_rowNumber", "_rownumber", "_originalTitle", "_originalId"]);
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

  function openEditModal(project) {
    state.activeProjectKey = project.uiKey;
    const fields = getEditableFields(project);
    const rowNumber = firstDefined(project.metadata || {}, ["sheetRowNumber", "rownumber", "_rownumber"]);
    const modalTitle = document.getElementById("projectEditTitle");
    if (modalTitle) {
      const suffix = rowNumber == null ? "" : ` (Sheet Row ${rowNumber})`;
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

  function fillSelect(selectEl, values, allLabel) {
    const current = selectEl.value;
    selectEl.innerHTML = "";

    const allOption = document.createElement("option");
    allOption.value = "all";
    allOption.textContent = allLabel;
    selectEl.appendChild(allOption);

    values.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      selectEl.appendChild(option);
    });

    selectEl.value = values.includes(current) || current === "all" ? current : "all";
  }

  function updateFilters() {
    const categories = [...new Set(state.allProjects.map((p) => p.category).filter(Boolean))].sort();
    const states = [...new Set(state.allProjects.map((p) => p.state).filter(Boolean))].sort();

    fillSelect(elements.source, ["home", "vehicle", "repeating"], "All sources");
    fillSelect(elements.category, categories, "All categories");
    fillSelect(elements.projectState, states, "All states");
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

    const filtered = state.allProjects.filter((project) => {
      if (source !== "all" && project.source !== source) {
        return false;
      }

      if (category !== "all" && project.category !== category) {
        return false;
      }

      if (projectState !== "all" && project.state !== projectState) {
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
        const order = project.order != null && String(project.order).trim() !== "" ? project.order : "-";

        const vehicleFields = sourceDisplay === "vehicle"
          ? `<div class="project-field"><strong>Asset:</strong> ${project.asset || "-"}</div>
             <div class="project-field"><strong>Mileage:</strong> ${project.mileage || "-"}</div>`
          : "";

        const homeCostField = sourceDisplay === "home"
          ? `<div class="project-field"><strong>Cost:</strong> ${formatCost(project.cost)}</div>`
          : "";

        return `
          <article class="project-card" data-project-key="${project.uiKey}">
            <h2>${project.title}</h2>
            <div class="project-grid">
              <div class="project-field"><strong>Source:</strong> ${sourceDisplay}</div>
              <div class="project-field"><strong>Category:</strong> ${project.category}</div>
              <div class="project-field"><strong>State:</strong> ${project.state}</div>
              <div class="project-field"><strong>Priority:</strong> ${priority}</div>
              <div class="project-field"><strong>Order:</strong> ${order}</div>
              <div class="project-field"><strong>Recurrence:</strong> ${recurrence}</div>
              ${vehicleFields}
              ${homeCostField}
            </div>
            <div class="project-actions">
              <button type="button" class="edit-details-btn" data-project-key="${project.uiKey}">Edit Details</button>
              <button type="button" class="primary add-task-btn" data-project-key="${project.uiKey}">Add to Task Manager</button>
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
    elements.source.addEventListener("change", () => {
      state.filters.source = elements.source.value;
      applyFiltersAndSort();
    }, { signal: controller.signal });

    elements.category.addEventListener("change", () => {
      state.filters.category = elements.category.value;
      applyFiltersAndSort();
    }, { signal: controller.signal });

    elements.projectState.addEventListener("change", () => {
      state.filters.projectState = elements.projectState.value;
      applyFiltersAndSort();
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

    elements.list.addEventListener("click", (event) => {
      const detailsBtn = event.target.closest(".edit-details-btn");
      const addBtn = event.target.closest(".add-task-btn");

      if (!detailsBtn && !addBtn) {
        return;
      }

      const projectKey = (detailsBtn || addBtn).getAttribute("data-project-key");
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
    const projects = await window.loadAllProjects();

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
