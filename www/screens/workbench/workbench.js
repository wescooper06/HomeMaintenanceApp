function initWorkbenchScreen() {
  const SERVICE_VERSION = "20260814-2";
  const state = { projects: [], tasks: [], taskSort: "asc", projectSort: "order", search: "", source: [], category: [], projectState: [] };
  const elements = {
    status: document.getElementById("workbenchStatus"),
    projectCount: document.getElementById("workbenchProjectsCount"),
    taskCount: document.getElementById("workbenchTasksCount"),
    projects: document.getElementById("workbenchProjects"),
    tasks: document.getElementById("workbenchTasks"),
    search: document.getElementById("workbenchProjectSearch"),
    source: document.getElementById("workbenchProjectSource"),
    sourceSummary: document.getElementById("workbenchProjectSourceSummary"),
    category: document.getElementById("workbenchProjectCategory"),
    categorySummary: document.getElementById("workbenchProjectCategorySummary"),
    projectState: document.getElementById("workbenchProjectState"),
    projectStateSummary: document.getElementById("workbenchProjectStateSummary"),
    projectSort: document.getElementById("workbenchProjectSort"),
    addProject: document.getElementById("workbenchAddProject"),
    sort: document.getElementById("workbenchTaskSort"),
    editModal: document.getElementById("workbenchEditModal"),
    editForm: document.getElementById("workbenchEditForm"),
    editFields: document.getElementById("workbenchEditFields"),
    editTitle: document.getElementById("workbenchEditTitle"),
    editClose: document.getElementById("workbenchEditClose"),
    editCancel: document.getElementById("workbenchEditCancel"),
    addModal: document.getElementById("workbenchAddModal"),
    addForm: document.getElementById("workbenchAddForm"),
    addFields: document.getElementById("workbenchAddFields"),
    addClose: document.getElementById("workbenchAddClose"),
    addCancel: document.getElementById("workbenchAddCancel"),
  };

  const loadScript = (src) => new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-workbench-src="${src}"], script[data-module-src="${src}"]`);
    if (existing) { resolve(); return; }
    const script = document.createElement("script");
    script.src = `${src}?v=${SERVICE_VERSION}`;
    script.dataset.workbenchSrc = src;
    script.dataset.moduleSrc = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(script);
  });

  const clean = (value, fallback = "") => {
    const result = value == null ? "" : String(value).trim();
    return result || fallback;
  };
  const sourceTag = (value) => {
    const source = clean(value, "unknown").toLowerCase();
    if (source.includes("vehicle") || source.includes("list_b")) return "vehicle";
    if (source.includes("repeating") || source.includes("list_c")) return "repeating";
    if (source.includes("home") || source.includes("list_a")) return "home";
    return source;
  };
  const number = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const escape = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  let activeProject = null;

  function renderSkeleton() {
    elements.projects.innerHTML = Array.from({ length: 4 }, () => '<div class="workbench-skeleton"></div>').join("");
    elements.tasks.innerHTML = Array.from({ length: 3 }, () => '<div class="workbench-skeleton"></div>').join("");
  }

  function renderProjects() {
    const query = state.search.toLowerCase();
    const filtered = state.projects.filter((project) => {
      const source = sourceTag(project.source);
      const text = `${project.title} ${project.id} ${project.category} ${source}`.toLowerCase();
      return (!query || text.includes(query))
        && (!state.source.length || state.source.includes(source))
        && (!state.category.length || state.category.includes(clean(project.category)))
        && (!state.projectState.length || state.projectState.includes(clean(project.state)));
    });
    const getProjectOrder = (project) => number(project.order ?? (project.metadata && project.metadata.order), Number.MAX_SAFE_INTEGER);
    const getProjectPriority = (project) => number(project.priority ?? (project.metadata && project.metadata.priority), Number.MAX_SAFE_INTEGER);
    const sorted = [...filtered].sort((left, right) => {
      if (state.projectSort === "priority") return getProjectPriority(left) - getProjectPriority(right) || clean(left.title).localeCompare(clean(right.title));
      if (state.projectSort === "category") return clean(left.category).localeCompare(clean(right.category)) || clean(left.title).localeCompare(clean(right.title));
      return getProjectOrder(left) - getProjectOrder(right) || clean(left.title).localeCompare(clean(right.title));
    });
    elements.projectCount.textContent = `${sorted.length} of ${state.projects.length}`;
    elements.projects.innerHTML = sorted.length ? sorted.map((project) => {
      const source = sourceTag(project.source);
      const taskId = `task-${source}-${clean(project.id, "project")}`;
      const priority = clean(project.priority, "-");
      const order = getProjectOrder(project);
      const orderPill = Number.isFinite(order) && order !== Number.MAX_SAFE_INTEGER
        ? `<span class="workbench-project-order-pill">Order: ${escape(order)}</span>`
        : "";
      const projectIndex = state.projects.indexOf(project);
      return `<article class="workbench-card" data-project-id="${escape(project.id)}" data-project-source="${escape(source)}" data-project-index="${projectIndex}">
        <div class="workbench-card-title"><h3>${escape(project.title || "Untitled Project")} <strong class="workbench-project-id">(ID: ${escape(project.id || "-")})</strong></h3><div class="workbench-project-card-badges">${orderPill}</div></div>
        <div class="workbench-meta"><span>Source: ${escape(source)}</span><span>Category: ${escape(project.category || "-")}</span><span>State: ${escape(project.state || "-")}</span><span>Priority: ${escape(priority)}</span></div>
        <div class="workbench-actions"><button class="workbench-action" data-action="edit-project" data-project-id="${escape(project.id)}">Edit Details</button><button class="workbench-action danger" data-action="delete-project" data-project-id="${escape(project.id)}">Delete</button><button class="workbench-action" data-action="add-task" data-task-id="${escape(taskId)}">Add to Task Manager</button></div>
      </article>`;
    }).join("") : '<div class="workbench-card">No projects match.</div>';
  }

  function setProjectFilterOptions(filterKey, select, summary, values, allLabel) {
    const options = [...new Set(values.map((value) => clean(value)).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right));
    const selected = state[filterKey].filter((value) => options.includes(value));
    state[filterKey] = selected.length ? selected : options;
    const selectedSet = new Set(state[filterKey]);
    select.innerHTML = options.map((value) => `<label><input type="checkbox" value="${escape(value)}"${selectedSet.has(value) ? " checked" : ""} />${escape(value)}</label>`).join("");
    summary.textContent = state[filterKey].length === options.length
      ? allLabel
      : state[filterKey].length <= 2
        ? state[filterKey].join(", ")
        : `${state[filterKey].length} selected`;
  }

  function refreshProjectFilters() {
    setProjectFilterOptions("source", elements.source, elements.sourceSummary, ["home", "vehicle", "repeating"], "All sources");
    setProjectFilterOptions("category", elements.category, elements.categorySummary, state.projects.map((project) => project.category), "All categories");
    setProjectFilterOptions("projectState", elements.projectState, elements.projectStateSummary, state.projects.map((project) => project.state), "All states");
  }

  function renderTasks() {
    const tasks = [...state.tasks].sort((left, right) => {
      const difference = number(left.order, 999999) - number(right.order, 999999);
      return state.taskSort === "desc" ? -difference : difference;
    });
    const projectTasks = tasks.filter((task) => sourceTag(task.source) !== "repeating");
    const repeatableTasks = tasks.filter((task) => sourceTag(task.source) === "repeating");
    const renderTaskCard = (task, index, taskGroup) => `<article class="workbench-card" data-task-id="${escape(task.id)}">
      <div class="workbench-card-title"><h4>${escape(task.title)} <strong class="workbench-project-id">(ID: ${escape(task.projectId || "-")})</strong></h4><strong>Order ${escape(task.order || "-")}</strong></div>
      <div class="workbench-meta"><span>Source: ${escape(task.source)}</span><span>Category: ${escape(task.category)}</span><span>State: ${escape(task.state)}</span><span>Priority: ${escape(task.priority)}</span><span>Metadata: ${task.metadataJson ? "available" : "-"}</span></div>
      <div class="workbench-actions"><button class="workbench-action" data-action="up" ${index === 0 ? "disabled" : ""}>Move up</button><button class="workbench-action" data-action="down" ${index === taskGroup.length - 1 ? "disabled" : ""}>Move down</button><button class="workbench-action" data-action="send-weekly">Send to Weekly Planner</button><button class="workbench-action danger" data-action="remove">Remove from Task Manager</button></div>
    </article>`;
    const renderTaskSection = (title, taskGroup, emptyText) => `<section class="workbench-task-section" aria-label="${title}">
      <h3>${title}</h3>
      <div class="workbench-task-section-list">${taskGroup.length ? taskGroup.map((task, index) => renderTaskCard(task, index, taskGroup)).join("") : `<div class="workbench-card">${emptyText}</div>`}</div>
    </section>`;

    elements.taskCount.textContent = `${projectTasks.length} project-based and ${repeatableTasks.length} repeatable tasks`;
    elements.sort.textContent = `Order: ${state.taskSort === "asc" ? "Ascending" : "Descending"}`;
    elements.tasks.innerHTML = `${renderTaskSection("Project-Based Tasks", projectTasks, "No project-based tasks yet.")}${renderTaskSection("Repeatable Tasks", repeatableTasks, "No repeatable tasks yet.")}`;
  }

  async function addProjectTask(project) {
    const existing = state.tasks.find((task) => clean(task.projectId) === clean(project.id) && sourceTag(task.source) === sourceTag(project.source));
    const saved = await window.PlannerStorage.upsertTaskManagerTask({
      id: existing && existing.id,
      projectId: project.id,
      title: project.title,
      source: sourceTag(project.source),
      category: project.category,
      state: project.state,
      priority: number(project.priority, 3),
      order: number(project.order, state.tasks.length + 1),
      recurrence: project.recurrence || "",
      metadataJson: JSON.stringify({ asset: project.asset || "", mileage: project.mileage || "" }),
    });
    state.tasks = [...state.tasks.filter((task) => task.id !== saved.id), saved];
    renderTasks();
  }

  async function sendWeekly(task) {
    await window.PlannerStorage.upsertWeeklyTask({ ...task, taskType: "curated", type: "curated", date: new Date().toISOString().slice(0, 10), timeSlot: "morning", bucket: "morning" });
    elements.status.textContent = `Sent "${task.title}" to Weekly Planner.`;
  }

  async function updateTaskOrderOrPriority(task, action) {
    const taskIsRepeatable = sourceTag(task.source) === "repeating";
    const ordered = state.tasks
      .filter((item) => (sourceTag(item.source) === "repeating") === taskIsRepeatable)
      .sort((left, right) => number(left.order, 999999) - number(right.order, 999999));
    const index = ordered.findIndex((item) => item.id === task.id);
    if (action === "priority-up" || action === "priority-down") {
      const priority = Math.max(1, number(task.priority, 3) + (action === "priority-up" ? -1 : 1));
      const saved = await window.PlannerStorage.upsertTaskManagerTask({ ...task, priority });
      state.tasks = state.tasks.map((item) => item.id === saved.id ? saved : item);
      renderTasks();
      return;
    }
    const direction = action === "up" ? -1 : 1;
    const swapIndex = index + direction;
    if (index < 0 || swapIndex < 0 || swapIndex >= ordered.length) return;
    const current = ordered[index];
    const neighbor = ordered[swapIndex];
    const [savedCurrent, savedNeighbor] = await Promise.all([
      window.PlannerStorage.upsertTaskManagerTask({ ...current, order: neighbor.order }),
      window.PlannerStorage.upsertTaskManagerTask({ ...neighbor, order: current.order }),
    ]);
    state.tasks = state.tasks.map((item) => item.id === savedCurrent.id ? savedCurrent : item.id === savedNeighbor.id ? savedNeighbor : item);
    renderTasks();
  }

  async function loadWorkbench() {
    renderSkeleton();
    elements.status.textContent = "Loading Workbench...";
    console.time("workbench-load");
    await Promise.all([loadScript("js/utils/uuid.js"), loadScript("js/services/planner-storage.service.js"), loadScript("js/services/sheets.service.js"), loadScript("js/services/projects.service.js")]);
    const cachedProjects = window.PlannerStorage.getCachedProjects && window.PlannerStorage.getCachedProjects();
    const [projects, tasks] = await Promise.all([cachedProjects || window.loadAllProjects(), window.PlannerStorage.getTaskManager()]);
    state.projects = projects || [];
    state.tasks = tasks || [];
    if (window.PlannerStorage.setCachedProjects) window.PlannerStorage.setCachedProjects(state.projects);
    refreshProjectFilters();
    renderProjects();
    renderTasks();
    elements.status.textContent = window.PlannerStorage.getUseSheets() ? "Sheets mode" : "Local mode";
    console.timeEnd("workbench-load");
  }

  function openEditProject(project) {
    activeProject = project;
    elements.editTitle.textContent = `Edit Project Details (ID: ${project.id || "-"})`;
    const fields = [
      ["title", "Title", project.title], ["category", "Category", project.category],
      ["state", "State", project.state], ["priority", "Priority", project.priority],
      ["order", "Order", project.order], ["recurrence", "Recurrence", project.recurrence],
      ["area", "Area", project.area], ["actualCost", "Cost", project.cost],
      ["resourceLinks", "Resource Links", project.resourceLinks], ["notes", "Notes", project.notes],
      ["addToRepeating", "Add to Repeating List", Boolean(project.addToRepeating || project.recurrence)],
    ];
    if (sourceTag(project.source) === "home" || sourceTag(project.source) === "repeating") {
      fields.push(["property", "Property", project.property], ["dateCompleted", "Date Completed", project.dateCompleted]);
    }
    if (sourceTag(project.source) === "vehicle") {
      fields.push(["vehicle", "Vehicle / Small Engine", project.vehicle || project.asset], ["mileage", "Mileage", project.mileage], ["engineHours", "Engine Hours", project.engineHours]);
    }
    const reserved = new Set(fields.map((field) => field[0]));
    const nonEditableMetadataKeys = new Set(["sources", "sheetRowNumber", "rownumber", "_rowNumber", "_rownumber", "_sourceTabId", "_sourceGeneratedId", "_originalTitle", "_originalId"]);
    Object.keys(project.metadata || {}).forEach((key) => {
      if (!reserved.has(key) && !nonEditableMetadataKeys.has(key) && !key.startsWith("_")) fields.push([key, key, project.metadata[key]]);
    });
    elements.editFields.innerHTML = fields.map(([key, label, value]) => {
      const display = Array.isArray(value) ? value.join("\n") : value == null ? "" : value;
      const multiline = key === "notes" || key === "resourceLinks" || String(display).length > 80;
      if (key === "addToRepeating") {
        const checked = display ? " checked" : "";
        return `<label class="workbench-checkbox"><input type="checkbox" name="${escape(key)}"${checked} />${escape(label)}</label>`;
      }
      const selectOptions = {
        category: [display, "Repair", "Maintenance", "Build", "Organize", "Install", "Clean"],
        state: [display, "Not Started", "In Progress", "Recommended", "Completed", "unknown"],
        priority: [display, "Low", "Medium", "High", "1", "2", "3", "4", "5"],
        recurrence: [display, "", "weekly", "biweekly", "monthly", "quarterly", "yearly"],
        area: [display, "Apartment", "Garage", "Yard", "Kitchen", "Bathroom", "Exterior"],
      };
      if (Object.prototype.hasOwnProperty.call(selectOptions, key)) {
        const options = [...new Set(selectOptions[key].filter((option) => option !== undefined && option !== null).map((option) => String(option)))];
        return `<label>${escape(label)}<select name="${escape(key)}">${options.map((option) => `<option value="${escape(option)}"${option === String(display) ? " selected" : ""}>${escape(option || "-")}</option>`).join("")}</select></label>`;
      }
      return `<label>${escape(label)}${multiline ? `<textarea name="${escape(key)}">${escape(display)}</textarea>` : `<input name="${escape(key)}" value="${escape(display)}" />`}</label>`;
    }).join("");
    elements.editModal.hidden = false;
  }

  function closeEditProject() {
    activeProject = null;
    elements.editModal.hidden = true;
  }

  function openAddProject() {
    const fields = [
      ["title", "Title"], ["source", "Source (home, vehicle, or repeating)"],
      ["category", "Category"], ["state", "State"], ["priority", "Priority"],
      ["order", "Order"], ["area", "Area"], ["property", "Property"],
      ["vehicle", "Vehicle / Engine"], ["cost", "Cost"], ["resourceLinks", "Resource Links"],
      ["notes", "Notes"], ["addToRepeating", "Add to Repeating List"],
    ];
    const renderFields = (includeRecurrence) => {
      const previousValues = {};
      elements.addFields.querySelectorAll("[name]").forEach((field) => {
        previousValues[field.name] = field.type === "checkbox" ? field.checked : field.value;
      });
      const visibleFields = includeRecurrence
        ? [...fields.slice(0, 7), ["recurrence", "Recurrance"], ...fields.slice(7)]
        : fields;
      const regularFields = visibleFields.filter(([key]) => key !== "addToRepeating" && key !== "recurrence");
      const recurrenceOptions = ["Daily", "Weekly", "Bi-Weekly", "Monthly", "Quarterly", "Semi-Annual", "Annual"];
      const repeatingControls = includeRecurrence
        ? `<div class="workbench-repeating-controls"><label class="workbench-checkbox"><input type="checkbox" name="addToRepeating" />${escape("Add to Repeating List")}</label><label>Recurrance<select name="recurrence"><option value="">Select recurrance</option>${recurrenceOptions.map((option) => `<option value="${escape(option)}">${escape(option)}</option>`).join("")}</select></label></div>`
        : `<label class="workbench-checkbox"><input type="checkbox" name="addToRepeating" />${escape("Add to Repeating List")}</label>`;
      elements.addFields.innerHTML = regularFields.map(([key, label]) => {
        const multiline = key === "notes" || key === "resourceLinks";
        const optionsByField = {
          source: ["home", "vehicle", "repeating"],
          category: ["Repair", "Maintenance", "Build", "Organize", "Install", "Clean"],
          state: ["Not Started", "In Progress", "Recommended", "Completed"],
          priority: ["Low", "Medium", "High", "1", "2", "3", "4", "5"],
          area: ["Apartment", "Garage", "Yard", "Kitchen", "Bathroom", "Exterior"],
        };
        if (Object.prototype.hasOwnProperty.call(optionsByField, key)) {
          return `<label>${escape(label)}<select name="${key}"><option value="">Select ${escape(label.toLowerCase())}</option>${optionsByField[key].map((option) => `<option value="${escape(option)}">${escape(option)}</option>`).join("")}</select></label>`;
        }
        return `<label>${escape(label)}${multiline ? `<textarea name="${key}"></textarea>` : `<input name="${key}" />`}</label>`;
      }).join("") + repeatingControls;
      elements.addFields.querySelectorAll("[name]").forEach((field) => {
        if (!Object.prototype.hasOwnProperty.call(previousValues, field.name)) return;
        if (field.type === "checkbox") field.checked = previousValues[field.name];
        else field.value = previousValues[field.name];
      });
      const checkbox = elements.addFields.querySelector('input[name="addToRepeating"]');
      if (checkbox) checkbox.addEventListener("change", () => renderFields(checkbox.checked), { once: true });
    };
    renderFields(false);
    elements.addModal.hidden = false;
  }

  function closeAddProject() {
    elements.addModal.hidden = true;
    elements.addFields.innerHTML = "";
  }

  elements.search.addEventListener("input", (event) => { state.search = event.target.value; renderProjects(); });
  elements.projectSort.value = state.projectSort;
  elements.projectSort.addEventListener("change", (event) => { state.projectSort = event.target.value; renderProjects(); });
  [
    ["source", elements.source, elements.sourceSummary, "All sources"],
    ["category", elements.category, elements.categorySummary, "All categories"],
    ["projectState", elements.projectState, elements.projectStateSummary, "All states"],
  ].forEach(([filterKey, container, summary, allLabel]) => {
    container.addEventListener("change", () => {
      state[filterKey] = Array.from(container.querySelectorAll("input:checked")).map((input) => input.value);
      const available = Array.from(container.querySelectorAll("input")).map((input) => input.value);
      summary.textContent = state[filterKey].length === available.length
        ? allLabel
        : state[filterKey].length <= 2
          ? state[filterKey].join(", ")
          : `${state[filterKey].length} selected`;
      renderProjects();
    });
  });
  elements.sort.addEventListener("click", () => { state.taskSort = state.taskSort === "asc" ? "desc" : "asc"; renderTasks(); });
  elements.addProject.addEventListener("click", openAddProject);
  elements.addClose.addEventListener("click", closeAddProject);
  elements.addCancel.addEventListener("click", closeAddProject);
  elements.addModal.addEventListener("click", (event) => { if (event.target === elements.addModal) closeAddProject(); });
  elements.addForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = {};
    Array.from(elements.addForm.elements).forEach((field) => { if (field.name) values[field.name] = field.type === "checkbox" ? field.checked : field.value; });

    const source = sourceTag(values.source);
    if (!["home", "vehicle", "repeating"].includes(source)) {
      elements.status.textContent = "Select a project source.";
      return;
    }
    if (!clean(values.title) || !clean(values.category) || !clean(values.state)) {
      elements.status.textContent = "Title, category, and state are required.";
      return;
    }
    if ((source === "repeating" || values.addToRepeating) && !clean(values.recurrence)) {
      elements.status.textContent = "Recurrance is required for repeating projects.";
      return;
    }
    if (!window.ProjectsService || typeof window.ProjectsService.createProject !== "function") {
      elements.status.textContent = "Project service is unavailable.";
      return;
    }

    const submitButton = elements.addForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    elements.status.textContent = "Submitting project...";

    try {
      const result = await window.ProjectsService.createProject({
        ...values,
        source,
        recurrence: clean(values.recurrence),
        addToRepeating: Boolean(values.addToRepeating),
      });
      closeAddProject();
      await loadWorkbench();
      elements.status.textContent = `Created project ${result.id} in ${result.tabName}.`;
    } catch (error) {
      elements.status.textContent = error && error.message ? error.message : "Unable to create project.";
    } finally {
      submitButton.disabled = false;
    }
  });
  elements.projects.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const card = button.closest("article[data-project-id]");
    const projectIndex = Number(card && card.dataset.projectIndex);
    const project = Number.isInteger(projectIndex) ? state.projects[projectIndex] : null;
    if (!project) return;
    if (button.dataset.action === "add-task") {
      addProjectTask(project).catch((error) => { elements.status.textContent = error.message; });
      return;
    }
    if (button.dataset.action === "edit-project") {
      openEditProject(project);
      return;
    }
    sessionStorage.setItem("hm_workbench_project_action", JSON.stringify({ action: button.dataset.action, projectId: project.id, source: project.source }));
    window.location.hash = "#projects";
  });
  elements.tasks.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    const card = button && button.closest("[data-task-id]");
    if (!button || !card) return;
    const task = state.tasks.find((item) => item.id === card.dataset.taskId);
    if (!task) return;
    if (["up", "down", "priority-up", "priority-down"].includes(button.dataset.action)) updateTaskOrderOrPriority(task, button.dataset.action).catch((error) => { elements.status.textContent = error.message; });
    if (button.dataset.action === "send-weekly") sendWeekly(task).catch((error) => { elements.status.textContent = error.message; });
    if (button.dataset.action === "remove") window.PlannerStorage.deleteTaskManagerTask(task.id).then(() => { state.tasks = state.tasks.filter((item) => item.id !== task.id); renderTasks(); });
  });
  elements.editClose.addEventListener("click", closeEditProject);
  elements.editCancel.addEventListener("click", closeEditProject);
  elements.editModal.addEventListener("click", (event) => { if (event.target === elements.editModal) closeEditProject(); });
  elements.editForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!activeProject || !window.SheetsService || typeof window.SheetsService.updateProjectInSheet !== "function") {
      elements.status.textContent = "Project update service is unavailable.";
      return;
    }

    const updated = {
      ...activeProject,
      metadata: {
        ...(activeProject.metadata || {}),
      },
    };
    const coreFields = new Set(["title", "category", "state"]);
    const numericFields = new Set(["actualCost", "estimatedCost", "mileage", "engineHours", "order"]);

    Array.from(elements.editForm.elements).forEach((field) => {
      if (!field.name || field.name === "addToRepeating") return;
      const raw = clean(field.value);
      const value = numericFields.has(field.name) && raw !== "" && Number.isFinite(Number(raw)) ? Number(raw) : raw;
      if (coreFields.has(field.name)) updated[field.name] = value;
      else updated.metadata[field.name] = value;
    });

    updated.metadata._originalTitle = clean(updated.metadata._originalTitle, clean(activeProject.title));
    updated.metadata._originalId = clean(updated.metadata._originalId, clean(activeProject.id));

    const submitButton = elements.editForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    elements.status.textContent = "Saving project...";

    try {
      const result = await window.SheetsService.updateProjectInSheet(updated);
      if (result && result.ok === false) throw new Error(clean(result.error, "Unable to save project."));

      state.projects = state.projects.map((project) => project === activeProject ? updated : project);
      if (window.PlannerStorage.setCachedProjects) window.PlannerStorage.setCachedProjects(state.projects);
      renderProjects();
      closeEditProject();
      elements.status.textContent = `Saved project ${updated.id}.`;
    } catch (error) {
      elements.status.textContent = error && error.message ? error.message : "Unable to save project.";
    } finally {
      submitButton.disabled = false;
    }
  });

  loadWorkbench().catch((error) => { elements.status.textContent = error.message || "Unable to load Workbench."; });

  window.loadWorkbench = loadWorkbench;
}

window.initWorkbenchScreen = initWorkbenchScreen;
