function initProjectsScreen() {
  const SERVICE_VERSION = "20260727-4";
  const state = {
    allProjects: [],
    filteredProjects: [],
    filters: {
      source: "all",
      category: "all",
      projectState: "all",
    },
    sortBy: "priority",
  };

  const elements = {
    source: document.getElementById("projectsFilterSource"),
    category: document.getElementById("projectsFilterCategory"),
    projectState: document.getElementById("projectsFilterState"),
    sortBy: document.getElementById("projectsSortBy"),
    list: document.getElementById("projectsList"),
    summary: document.getElementById("projectsSummary"),
  };

  if (!elements.source || !elements.category || !elements.projectState || !elements.sortBy || !elements.list || !elements.summary) {
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

  function toViewModel(project) {
    const metadata = project.metadata || {};
    const source = sourceTag(project.source);

    const priority = firstDefined(metadata, ["priority", "rank", "urgency"]);
    const order = firstDefined(metadata, ["order", "sortorder", "sequence", "displayorder"]);
    const recurrence = firstDefined(metadata, ["recurrence", "frequency", "interval"]);
    const asset = firstDefined(metadata, ["asset", "vehicle", "equipment", "assetname"]);
    const mileage = firstDefined(metadata, ["mileage", "odometer"]);
    const cost = firstDefined(metadata, ["actualCost", "estimatedCost", "cost", "budget"]);

    return {
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
    elements.summary.textContent = `${items.length} of ${state.allProjects.length} projects shown`;

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
          <article class="project-card" data-project-id="${project.id}">
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
              <button type="button" class="view-details-btn" data-project-id="${project.id}">View Details</button>
              <button type="button" class="primary add-task-btn" data-project-id="${project.id}">Add to Task Manager</button>
            </div>
          </article>
        `;
      })
      .join("");

    elements.list.innerHTML = html;
  }

  function showDetails(project) {
    const metadataText = JSON.stringify(project.metadata || {}, null, 2);
    const detailLines = [
      `Title: ${project.title}`,
      `Source: ${project.source}`,
      `Category: ${project.category}`,
      `State: ${project.state}`,
      "",
      "Metadata:",
      metadataText,
    ];

    window.alert(detailLines.join("\n"));
  }

  function addToTaskManager(project) {
    const key = "hm_task_manager_tasks";
    const existing = JSON.parse(localStorage.getItem(key) || "[]");
    const taskId = `task-${project.id}`;
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
    elements.summary.textContent = `Added \"${project.title}\" to Task Manager.`;
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

    elements.list.addEventListener("click", (event) => {
      const detailsBtn = event.target.closest(".view-details-btn");
      const addBtn = event.target.closest(".add-task-btn");

      if (!detailsBtn && !addBtn) {
        return;
      }

      const projectId = (detailsBtn || addBtn).getAttribute("data-project-id");
      const project = state.filteredProjects.find((item) => item.id === projectId);
      if (!project) {
        return;
      }

      if (detailsBtn) {
        showDetails(project);
      }

      if (addBtn) {
        addToTaskManager(project);
      }
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
    elements.summary.textContent = "Loading projects...";

    await ensureProjectServicesLoaded();
    const projects = await window.loadAllProjects();

    if (!isStillActive()) {
      return;
    }

    state.allProjects = (projects || []).map(toViewModel);
    updateFilters();
    applyFiltersAndSort();
  }

  attachEvents();
  loadProjects().catch((error) => {
    console.error(error);
    const reason = error && error.message ? error.message : "Unknown error";
    elements.summary.textContent = "Unable to load projects.";
    elements.list.innerHTML = `<div class="projects-empty">Failed to load projects data. ${reason}</div>`;
  });
}

window.initProjectsScreen = initProjectsScreen;
