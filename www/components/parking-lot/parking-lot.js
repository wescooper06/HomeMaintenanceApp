// Parking Lot component for the Weekly Planner.
(function () {
  const TEMPLATE_PATH = "components/parking-lot/parking-lot.html";
  const TEMPLATE_VERSION = "20260809-1";
  const DEFAULT_COLORS = {
    parking: "#d1d5db",
    project: "#2563eb",
    adHoc: "#0f766e",
    repeatable: "#7c3aed",
  };

  let cachedTemplate = "";

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

  function ensureJson(value, fallback) {
    const text = cleanText(value, fallback);
    try {
      JSON.parse(text);
      return text;
    } catch (error) {
      return fallback;
    }
  }

  function safeClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function getColorForItem(item) {
    const convertedTo = item && item.convertedTo && typeof item.convertedTo === "object" ? item.convertedTo : null;
    if (convertedTo && convertedTo.type === "project" && cleanText(item.color, "")) {
      return item.color;
    }

    if (convertedTo && convertedTo.type === "project") {
      return DEFAULT_COLORS.project;
    }

    if (convertedTo && convertedTo.type === "ad-hoc") {
      return DEFAULT_COLORS.adHoc;
    }

    if (convertedTo && convertedTo.type === "task-manager") {
      return DEFAULT_COLORS.adHoc;
    }

    if (convertedTo && convertedTo.type === "repeatable") {
      return DEFAULT_COLORS.repeatable;
    }

    return cleanText(item && item.color, DEFAULT_COLORS.parking);
  }

  function loadTemplate() {
    if (cachedTemplate) {
      return Promise.resolve(cachedTemplate);
    }

    return fetch(`${TEMPLATE_PATH}?v=${TEMPLATE_VERSION}`, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load parking lot template: ${TEMPLATE_PATH}`);
        }

        return response.text();
      })
      .then((template) => {
        cachedTemplate = template;
        return template;
      });
  }

  function parseParkingItem(item) {
    const convertedTo = item && item.convertedTo && typeof item.convertedTo === "object"
      ? { ...item.convertedTo }
      : null;

    return {
      id: cleanText(item && item.id, ""),
      title: cleanText(item && item.title, "Untitled Idea"),
      notes: cleanText(item && item.notes, ""),
      createdAt: cleanText(item && item.createdAt, ""),
      updatedAt: cleanText(item && item.updatedAt, ""),
      source: cleanText(item && item.source, "parking-lot"),
      tags: cleanText(item && item.tags, ""),
      priority: cleanText(item && item.priority, "low"),
      convertedTo,
      color: cleanText(item && item.color, ""),
      checklistJson: ensureJson(item && item.checklistJson, "[]"),
      reminderJson: ensureJson(item && item.reminderJson, "{}"),
      metadataJson: ensureJson(item && item.metadataJson, "{}"),
      deleted: Boolean(item && item.deleted),
      convertedFromParking: cleanText(item && item.convertedFromParking, ""),
    };
  }

  function renderTagChips(tags) {
    const list = cleanText(tags, "")
      .split(/[,\n]/g)
      .map((entry) => entry.trim())
      .filter(Boolean);

    if (!list.length) {
      return "";
    }

    return list.map((tag) => `<span class="parking-lot-tag-chip">${tag}</span>`).join("");
  }

  function buildCard(item) {
    const color = getColorForItem(item);
    const convertedLabelMap = {
      "task-manager": "Ad-Hoc",
      "ad-hoc": "Ad-Hoc",
      project: "Project",
      repeatable: "Repeatable",
    };
    const convertedType = cleanText(item && item.convertedTo && item.convertedTo.type, "");
    const converted = convertedType ? `Converted to ${cleanText(convertedLabelMap[convertedType], convertedType)}` : "Not converted";
    const tags = renderTagChips(item.tags);
    return `
      <article class="parking-lot-card" data-parking-id="${item.id}" tabindex="0" aria-label="Parking lot item ${item.title}">
        <div class="parking-lot-card-header">
          <span class="parking-lot-color-stripe" style="background:${color};"></span>
          <div class="parking-lot-card-main">
            <div class="parking-lot-title-row">
              <div class="parking-lot-title">${item.title}</div>
              <div class="parking-lot-menu">
                <button type="button" class="parking-lot-menu-btn" data-action="menu-toggle" aria-label="Convert parking item" title="Convert">Convert</button>
                <div class="parking-lot-menu-panel" data-role="convert-menu" hidden>
                  <button type="button" data-action="convert-project">Project</button>
                  <button type="button" data-action="convert-adhoc">Ad-Hoc</button>
                  <button type="button" data-action="convert-repeatable">Repeatable</button>
                </div>
              </div>
            </div>
            ${item.notes ? `<div class="parking-lot-notes">${item.notes}</div>` : ""}
            ${tags ? `<div class="parking-lot-tags">${tags}</div>` : ""}
            <div class="parking-lot-notes">${converted}</div>
            <div class="parking-lot-actions">
              <button type="button" class="parking-lot-drag-handle" data-action="drag-handle" draggable="true" aria-label="Drag parking lot item" title="Drag">⋮⋮</button>
              <button type="button" class="parking-lot-action-btn" data-action="edit" aria-label="Edit parking lot item" title="Edit">✎</button>
              <button type="button" class="parking-lot-action-btn parking-lot-delete-btn" data-action="delete" aria-label="Delete parking lot item" title="Delete">X</button>
            </div>
          </div>
        </div>
      </article>
    `;
  }

  function sourceFromConvertedType(convertedType) {
    return convertedType === "repeatable" ? "repeating" : "home";
  }

  function sourceMatchesConvertType(source, convertType) {
    const normalized = cleanText(source, "").toLowerCase();
    if (convertType === "repeatable") {
      return normalized.includes("list_c") || normalized.includes("repeating");
    }

    return normalized.includes("list_a") || normalized.includes("home");
  }

  function pickBestProjectMatch(matches, rowHint) {
    if (!Array.isArray(matches) || !matches.length) {
      return null;
    }

    if (matches.length === 1) {
      return matches[0];
    }

    const numericHint = Number(rowHint || 0);
    const withRow = matches
      .map((project) => ({
        project,
        row: Number(project && project.metadata && project.metadata.sheetRowNumber || 0),
      }))
      .filter((entry) => entry.row > 0);

    if (numericHint > 0 && withRow.length) {
      withRow.sort((a, b) => Math.abs(a.row - numericHint) - Math.abs(b.row - numericHint));
      return withRow[0].project;
    }

    if (withRow.length) {
      withRow.sort((a, b) => b.row - a.row);
      return withRow[0].project;
    }

    return matches[0];
  }

  async function finalizeConvertedProjectRecord(item, createResult, convertType) {
    if (!item || !createResult || !window.SheetsService || typeof window.SheetsService.updateProjectInSheet !== "function") {
      return;
    }

    if (typeof window.loadAllProjects !== "function") {
      return;
    }

    try {
      const allProjects = await window.loadAllProjects();
      if (!Array.isArray(allProjects)) {
        return;
      }

      const createdId = cleanText(createResult.id, "");
      const targetRow = Number(createResult.rowNumber || 0);
      let project = allProjects.find((entry) => cleanText(entry && entry.id, "") === createdId
        && sourceMatchesConvertType(entry && entry.source, convertType)
        && Number(entry && entry.metadata && entry.metadata.sheetRowNumber || 0) === targetRow);

      if (!project) {
        project = allProjects.find((entry) => cleanText(entry && entry.id, "") === createdId
          && sourceMatchesConvertType(entry && entry.source, convertType));
      }

      if (!project) {
        return;
      }

      const metadata = project.metadata && typeof project.metadata === "object" ? { ...project.metadata } : {};
      const normalizedProject = {
        ...project,
        title: cleanText(item.title, cleanText(project.title, "Untitled Project")),
        category: cleanText(project.category, "uncategorized"),
        state: cleanText(project.state, "unknown"),
        metadata: {
          ...metadata,
          _originalTitle: cleanText(metadata._originalTitle, ""),
          _originalId: cleanText(project.id, ""),
          priority: cleanText(metadata.priority, "3"),
          sheetRowNumber: Number(metadata.sheetRowNumber || createResult.rowNumber || 0) || undefined,
        },
      };

      await window.SheetsService.updateProjectInSheet(normalizedProject);

      if (!item.convertedTo || typeof item.convertedTo !== "object") {
        item.convertedTo = { type: convertType };
      }

      item.convertedTo.id = cleanText(project.id, cleanText(item.convertedTo.id, item.id));
      if (Number(metadata.sheetRowNumber || 0) > 0) {
        item.convertedTo.rowNumber = Number(metadata.sheetRowNumber);
      }
    } catch (error) {
      console.warn("Unable to finalize converted project record", error);
    }
  }

  async function findProjectById(projectId, expectedSource, options) {
    const targetId = cleanText(projectId, "");
    const titleHint = cleanText(options && options.titleHint, "");
    const rowHint = Number(options && options.rowHint || 0);
    if (!targetId) {
      if (!titleHint && !rowHint) {
        return null;
      }
    }

    const expectedSourceKey = cleanText(expectedSource, "").toLowerCase();
    const sourceMatches = (project) => {
      const source = cleanText(project && project.source, "");
      if (!expectedSourceKey) {
        return true;
      }

      if (expectedSourceKey === "repeating") {
        return sourceMatchesConvertType(source, "repeatable");
      }

      return sourceMatchesConvertType(source, "project");
    };

    if (typeof window.loadAllProjects === "function") {
      try {
        const projects = await window.loadAllProjects();
        if (Array.isArray(projects)) {
          const matchingSource = projects.find((project) => cleanText(project && project.id, "") === targetId
            && sourceMatches(project));
          if (matchingSource) {
            return matchingSource;
          }

          const anyMatch = projects.find((project) => cleanText(project && project.id, "") === targetId);
          if (anyMatch) {
            return anyMatch;
          }

          if (rowHint > 0) {
            const rowMatch = projects.find((project) => Number(project && project.metadata && project.metadata.sheetRowNumber || 0) === rowHint
              && sourceMatches(project));
            if (rowMatch) {
              return rowMatch;
            }
          }

          if (titleHint) {
            const titleMatches = projects.filter((project) => cleanText(project && project.title, "") === titleHint
              && sourceMatches(project));
            const titleMatch = pickBestProjectMatch(titleMatches, rowHint);
            if (titleMatch) {
              return titleMatch;
            }

            const propertyMatches = projects.filter((project) => cleanText(project && project.metadata && project.metadata.property, "") === titleHint
              && sourceMatches(project));
            const propertyMatch = pickBestProjectMatch(propertyMatches, rowHint);
            if (propertyMatch) {
              return propertyMatch;
            }
          }
        }
      } catch (error) {
        console.error("Unable to load projects for in-place edit", error);
      }
    }

    if (window.ProjectsService && Array.isArray(window.ProjectsService.UnifiedProjectList)) {
      const list = window.ProjectsService.UnifiedProjectList;
      const matchingSource = list.find((project) => cleanText(project && project.id, "") === targetId
        && sourceMatches(project));
      if (matchingSource) {
        return matchingSource;
      }

      const anyMatch = list.find((project) => cleanText(project && project.id, "") === targetId);
      if (anyMatch) {
        return anyMatch;
      }

      if (rowHint > 0) {
        const rowMatch = list.find((project) => Number(project && project.metadata && project.metadata.sheetRowNumber || 0) === rowHint
          && sourceMatches(project));
        if (rowMatch) {
          return rowMatch;
        }
      }

      if (titleHint) {
        const titleMatches = list.filter((project) => cleanText(project && project.title, "") === titleHint
          && sourceMatches(project));
        const titleMatch = pickBestProjectMatch(titleMatches, rowHint);
        if (titleMatch) {
          return titleMatch;
        }

        const propertyMatches = list.filter((project) => cleanText(project && project.metadata && project.metadata.property, "") === titleHint
          && sourceMatches(project));
        const propertyMatch = pickBestProjectMatch(propertyMatches, rowHint);
        if (propertyMatch) {
          return propertyMatch;
        }
      }

      return null;
    }

    return null;
  }

  async function openProjectEditByProjectId(projectId, titleFallback, convertedType, parkingItem, storage) {
    const targetId = cleanText(projectId, "");
    if (!targetId) {
      return false;
    }

    if (!window.SheetsService || typeof window.SheetsService.updateProjectInSheet !== "function") {
      return false;
    }

    const expectedSource = sourceFromConvertedType(cleanText(convertedType, ""));
    const project = await findProjectById(targetId, expectedSource, {
      titleHint: cleanText(titleFallback, ""),
      rowHint: Number(parkingItem && parkingItem.convertedTo && parkingItem.convertedTo.rowNumber || 0),
    });
    if (!project) {
      return false;
    }

    if (parkingItem && parkingItem.convertedTo && typeof parkingItem.convertedTo === "object") {
      const normalizedId = cleanText(project.id, targetId);
      const normalizedRow = Number(project && project.metadata && project.metadata.sheetRowNumber || 0);
      const hadDifferentId = cleanText(parkingItem.convertedTo.id, "") !== normalizedId;
      const hadDifferentRow = normalizedRow > 0 && Number(parkingItem.convertedTo.rowNumber || 0) !== normalizedRow;
      if (hadDifferentId || hadDifferentRow) {
        parkingItem.convertedTo.id = normalizedId;
        if (normalizedRow > 0) {
          parkingItem.convertedTo.rowNumber = normalizedRow;
        }
        await storage.upsertParkingItem(parkingItem);
      }
    }

    const metadata = project.metadata && typeof project.metadata === "object" ? { ...project.metadata } : {};
    const host = parkingItem && parkingItem._parkingRoot
      ? parkingItem._parkingRoot.querySelector("[data-role='parking-modal-host']")
      : null;

    if (!host) {
      return false;
    }

    host.hidden = false;
    host.innerHTML = `
      <div class="parking-lot-modal" role="dialog" aria-modal="true" aria-labelledby="parking-project-edit-title">
        <div class="parking-lot-modal-header">
          <div>
            <h3 id="parking-project-edit-title">Edit Project Details (ID: ${escapeHtml(cleanText(project.id, targetId))})</h3>
            <p>Update the project without leaving Planner.</p>
          </div>
          <button type="button" data-action="dialog-close" aria-label="Close parking lot dialog" title="Close">X</button>
        </div>
        <div class="parking-lot-modal-body">
          <form class="parking-lot-form-grid">
            <label>Title<input name="title" type="text" required value="${escapeHtml(cleanText(project.title, titleFallback || "Untitled Project"))}" /></label>
            <label>Category<input name="category" type="text" value="${escapeHtml(cleanText(project.category, "uncategorized"))}" /></label>
            <label>State<input name="state" type="text" value="${escapeHtml(cleanText(project.state, "unknown"))}" /></label>
            <label>Priority<input name="priority" type="text" value="${escapeHtml(cleanText(metadata.priority, ""))}" /></label>
            <label>Order<input name="order" type="text" value="${escapeHtml(cleanText(metadata.order, ""))}" /></label>
            <label>Area<input name="area" type="text" value="${escapeHtml(cleanText(metadata.area, ""))}" /></label>
            <label>Property<input name="property" type="text" value="${escapeHtml(cleanText(metadata.property, ""))}" /></label>
            <label>Date Completed<input name="dateCompleted" type="text" value="${escapeHtml(cleanText(metadata.dateCompleted, ""))}" /></label>
          </form>
          <p class="parking-lot-edit-status" data-role="project-edit-status" aria-live="polite"></p>
          <div class="parking-lot-modal-actions">
            <button type="button" class="primary" data-action="project-edit-save">Save Changes</button>
            <button type="button" data-action="dialog-close">Cancel</button>
          </div>
        </div>
      </div>
    `;

    const status = host.querySelector("[data-role='project-edit-status']");
    const close = () => {
      host.hidden = true;
      host.innerHTML = "";
    };

    host.querySelectorAll("[data-action='dialog-close']").forEach((button) => {
      button.addEventListener("click", close);
    });

    host.querySelector("[data-action='project-edit-save']").addEventListener("click", async () => {
      const form = host.querySelector(".parking-lot-form-grid");
      const nextTitle = cleanText(form.querySelector("[name='title']").value, cleanText(project.title, "Untitled Project"));
      const nextPropertyRaw = String(form.querySelector("[name='property']").value == null ? "" : form.querySelector("[name='property']").value).trim();

      const nextProject = {
        ...project,
        title: nextTitle,
        category: cleanText(form.querySelector("[name='category']").value, cleanText(project.category, "uncategorized")),
        state: cleanText(form.querySelector("[name='state']").value, cleanText(project.state, "unknown")),
        metadata: {
          ...metadata,
          priority: cleanText(form.querySelector("[name='priority']").value, cleanText(metadata.priority, "")),
          order: cleanText(form.querySelector("[name='order']").value, cleanText(metadata.order, "")),
          area: cleanText(form.querySelector("[name='area']").value, cleanText(metadata.area, "")),
          property: nextPropertyRaw,
          _clearProperty: nextPropertyRaw === "",
          dateCompleted: cleanText(form.querySelector("[name='dateCompleted']").value, cleanText(metadata.dateCompleted, "")),
          _originalTitle: cleanText(metadata._originalTitle, ""),
          _originalId: cleanText(metadata._originalId, cleanText(project.id, "")),
          sheetRowNumber: metadata.sheetRowNumber,
        },
      };

      status.textContent = "Saving...";

      try {
        const result = await window.SheetsService.updateProjectInSheet(nextProject);
        if (result && result.ok === false) {
          throw new Error(cleanText(result.error, "Unable to save project details."));
        }

        if (parkingItem) {
          parkingItem.title = nextTitle;
          await storage.upsertParkingItem(parkingItem);
        }

        close();
      } catch (error) {
        const reason = cleanText(error && error.message, "Unable to save project details.");
        const needsRepair = /did not persist title update|Unable to verify target row|Refusing to overwrite an empty row/i.test(reason);

        if (needsRepair && window.SheetsService && typeof window.SheetsService.repairProjectTitle === "function") {
          try {
            status.textContent = "Repairing sheet row...";
            const repairShouldClearProperty = /got\s+""\.?$/i.test(reason) || /got\s+""/i.test(reason);
            const repairResult = await window.SheetsService.repairProjectTitle(nextProject, {
              id: cleanText(project.id, ""),
              title: nextTitle,
              sheetRowNumber: metadata.sheetRowNumber,
              clearProperty: repairShouldClearProperty,
              forceTitle: true,
            });

            if (!repairResult || repairResult.ok === false) {
              throw new Error(cleanText(repairResult && repairResult.error, reason));
            }

            const repairedProject = {
              ...nextProject,
              metadata: {
                ...nextProject.metadata,
                sheetRowNumber: repairResult.rowNumber || nextProject.metadata.sheetRowNumber,
                _originalId: cleanText(project.id, ""),
              },
            };

            if (parkingItem) {
              parkingItem.title = nextTitle;
              parkingItem.convertedTo = parkingItem.convertedTo && typeof parkingItem.convertedTo === "object"
                ? {
                    ...parkingItem.convertedTo,
                    id: cleanText(project.id, parkingItem.convertedTo.id),
                    rowNumber: repairResult.rowNumber || parkingItem.convertedTo.rowNumber,
                  }
                : parkingItem.convertedTo;
              await storage.upsertParkingItem(parkingItem);
            }

            const refreshedTitle = nextTitle;
            status.textContent = "";
            close();
            return repairedProject;
          } catch (repairError) {
            const repairReason = cleanText(repairError && repairError.message, reason);
            if (/only repairs blank Task Description rows/i.test(repairReason)) {
              status.textContent = "Loaded backend is outdated for title repair. Deploy latest Apps Script, then retry.";
              return;
            }

            status.textContent = repairReason;
            return;
          }
        }

        if (needsRepair && (!window.SheetsService || typeof window.SheetsService.repairProjectTitle !== "function")) {
          status.textContent = "Repair action is unavailable in the loaded app runtime. Reload Planner to refresh scripts, then retry.";
          return;
        }

        status.textContent = reason;
      }
    });

    return true;
  }

  function openAdHocParkingDialog(item) {
    const host = item && item._parkingRoot ? item._parkingRoot.querySelector("[data-role='parking-modal-host']") : null;
    const dialogHost = host || document.createElement("div");
    dialogHost.hidden = false;
    dialogHost.className = "parking-lot-modal-host";
    dialogHost.innerHTML = `
      <div class="parking-lot-modal" role="dialog" aria-modal="true" aria-labelledby="parking-lot-title">
        <div class="parking-lot-modal-header">
          <div>
            <h3 id="parking-lot-title">Ad-Hoc Task</h3>
            <p>Use the title as the ad-hoc task name.</p>
          </div>
          <button type="button" data-action="dialog-close" aria-label="Close parking lot dialog" title="Close">X</button>
        </div>
        <div class="parking-lot-modal-body">
          <div class="parking-lot-form-grid">
            <label>Title<input name="title" type="text" value="${cleanText(item && item.title, "")}" /></label>
          </div>
          <div class="parking-lot-modal-actions">
            <button type="button" class="primary" data-action="ad-hoc-save">Save</button>
            <button type="button" data-action="dialog-close">Cancel</button>
          </div>
        </div>
      </div>
    `;

    const titleInput = dialogHost.querySelector("input[name='title']");
    const close = () => {
      dialogHost.hidden = true;
      dialogHost.innerHTML = "";
      if (!host && dialogHost.parentNode) {
        dialogHost.parentNode.removeChild(dialogHost);
      }
    };

    dialogHost.querySelectorAll("[data-action='dialog-close']").forEach((button) => button.addEventListener("click", close));
    dialogHost.querySelector("[data-action='ad-hoc-save']").addEventListener("click", () => {
      const nextTitle = cleanText(titleInput && titleInput.value, cleanText(item && item.title, "Untitled Idea"));
      if (item) {
        item.title = nextTitle;
      }
      close();
    });
    return true;
  }

  function mount(root, options) {
    const storage = options && options.storage ? options.storage : window.PlannerStorage;
    if (!root || !storage) {
      return null;
    }

    const state = {
      items: [],
      activeEditId: "",
      activeDropTarget: false,
      activeDragItem: null,
    };

    const callbacks = options && typeof options === "object" ? options : {};

    let destroyed = false;
    let unsubscribe = null;

    function modalHost() {
      return root.querySelector("[data-role='parking-modal-host']");
    }

    function parkingList() {
      return root.querySelector("[data-role='parking-list']");
    }

    function parkingEmpty() {
      return root.querySelector("[data-role='parking-empty']");
    }

    function convertMenuForCard(card) {
      return card ? card.querySelector("[data-role='convert-menu']") : null;
    }

    function closeMenus() {
      root.querySelectorAll("[data-role='convert-menu']").forEach((menu) => {
        menu.hidden = true;
      });
    }

    function openDialog(item) {
      const existing = item || {
        id: "",
        title: "",
        notes: "",
        tags: "",
        priority: "low",
        convertedTo: null,
        color: "",
        checklistJson: "[]",
        reminderJson: "{}",
        metadataJson: "{}",
      };

      state.activeEditId = cleanText(existing.id, "");
      const host = modalHost();
      host.innerHTML = `
        <div class="parking-lot-modal" role="dialog" aria-modal="true" aria-labelledby="parking-lot-title">
          <div class="parking-lot-modal-header">
            <div>
              <h3 id="parking-lot-title">${state.activeEditId ? "Edit Parking Lot Item" : "Add Parking Lot Item"}</h3>
              <p>Store ideas before they become work.</p>
            </div>
            <button type="button" data-action="dialog-close" aria-label="Close parking lot dialog" title="Close">X</button>
          </div>
          <div class="parking-lot-modal-body">
            <form class="parking-lot-form-grid">
              <label>Title<input name="title" type="text" required value="${existing.title || ""}" /></label>
              <label>Notes<textarea name="notes">${existing.notes || ""}</textarea></label>
              <label>Convert To
                <select name="convertTo">
                  ${[
                    ["none", "None"],
                    ["task-manager", "Ad-Hoc Task"],
                    ["project", "Project"],
                    ["repeatable", "Repeatable Project"],
                  ].map(([value, label]) => `<option value="${value}" ${(!existing.convertedTo && value === "none") ? "selected" : (existing.convertedTo && existing.convertedTo.type === value ? "selected" : "")}>${label}</option>`).join("")}
                </select>
              </label>
            </form>
            <div class="parking-lot-modal-actions">
              <button type="button" class="primary" data-action="dialog-save">Save</button>
              <button type="button" class="danger" data-action="dialog-delete">Delete</button>
              <button type="button" data-action="dialog-close">Cancel</button>
            </div>
          </div>
        </div>
      `;

      const form = host.querySelector(".parking-lot-form-grid");
      const convertSelect = form.querySelector("[name='convertTo']");

      const updateFields = () => {};
      convertSelect.addEventListener("change", updateFields);

      host.querySelectorAll("[data-action='dialog-close']").forEach((button) => {
        button.addEventListener("click", closeDialog);
      });

      host.querySelector("[data-action='dialog-delete']").addEventListener("click", async () => {
        if (state.activeEditId) {
          await storage.deleteParkingItem(state.activeEditId);
        }
        closeDialog();
      });

      host.querySelector("[data-action='dialog-save']").addEventListener("click", async () => {
        const item = parseParkingItem({
          id: existing.id,
          createdAt: existing.createdAt,
          convertedTo: existing.convertedTo,
          color: existing.color,
          checklistJson: existing.checklistJson,
          reminderJson: existing.reminderJson,
          metadataJson: existing.metadataJson,
          deleted: existing.deleted,
          convertedFromParking: existing.convertedFromParking,
          title: form.querySelector("[name='title']").value,
          notes: form.querySelector("[name='notes']").value,
        });

        const convertTo = form.querySelector("[name='convertTo']").value;
        if (convertTo === "task-manager") {
          const converted = await storage.upsertTaskManagerTask({
            taskId: item.id,
            projectId: item.id,
            title: item.title,
            source: "parking-lot",
            category: "uncategorized",
            state: "unknown",
            asset: "",
            mileage: "",
            recurrence: "",
            priority: 3,
            order: undefined,
          });
          item.convertedTo = { type: "task-manager", id: converted.taskId };
          item.color = DEFAULT_COLORS.adHoc;
        } else if (convertTo === "project" || convertTo === "repeatable") {
          if (!window.ProjectsService || typeof window.ProjectsService.createProject !== "function") {
            throw new Error("ProjectsService.createProject is unavailable.");
          }

          const projectPayload = {
            source: "home",
            property: "",
            vehicle: "",
            title: item.title,
            area: "",
            category: "uncategorized",
            priority: "3",
            order: "",
            resourceLinks: "",
            state: "unknown",
            dateCompleted: "",
            hours: "",
            mileage: "",
            mechanic: "",
            addToRepeating: convertTo === "repeatable",
            recurrence: "",
          };

          const result = await window.ProjectsService.createProject(projectPayload);
          item.convertedTo = {
            type: convertTo,
            id: cleanText(result.id, item.id),
            tabName: cleanText(result.tabName, ""),
            rowNumber: result.rowNumber,
          };
          await finalizeConvertedProjectRecord(item, result, convertTo);
          item.color = convertTo === "repeatable" ? DEFAULT_COLORS.repeatable : DEFAULT_COLORS.project;
        }

        await storage.upsertParkingItem(item);
        closeDialog();
      });
    }

    function closeDialog() {
      const host = modalHost();
      if (host) {
        host.hidden = true;
        host.innerHTML = "";
      }
      state.activeEditId = "";
    }

    async function render() {
      const items = await storage.getParkingLot();
      state.items = Array.isArray(items) ? items.map((item) => parseParkingItem(item)) : [];
      const list = parkingList();
      const empty = parkingEmpty();
      const visibleItems = state.items.filter((item) => item.deleted !== true);

      list.innerHTML = visibleItems.map(buildCard).join("");
      empty.hidden = visibleItems.length > 0;
    }

    function openCreateDialog() {
      const host = modalHost();
      host.hidden = false;
      openDialog();
    }

    async function convertItemDirectly(item, convertTo) {
      const nextItem = parseParkingItem(item);

      if (convertTo === "task-manager") {
        const converted = await storage.upsertTaskManagerTask({
          taskId: nextItem.id,
          projectId: nextItem.id,
          title: nextItem.title,
          source: "parking-lot",
          category: "uncategorized",
          state: "unknown",
          asset: "",
          mileage: "",
          recurrence: "",
          priority: 3,
          order: undefined,
        });

        nextItem.convertedTo = { type: "task-manager", id: converted.taskId };
        nextItem.color = DEFAULT_COLORS.adHoc;
        await storage.upsertParkingItem(nextItem);
        return nextItem;
      }

      if (!window.ProjectsService || typeof window.ProjectsService.createProject !== "function") {
        throw new Error("ProjectsService.createProject is unavailable.");
      }

      const result = await window.ProjectsService.createProject({
        source: "home",
        property: "",
        vehicle: "",
        title: nextItem.title,
        area: "",
        category: "uncategorized",
        priority: "3",
        order: "",
        resourceLinks: "",
        state: "unknown",
        dateCompleted: "",
        hours: "",
        mileage: "",
        mechanic: "",
        addToRepeating: convertTo === "repeatable",
        recurrence: "",
      });

      nextItem.convertedTo = {
        type: convertTo,
        id: cleanText(result.id, nextItem.id),
        tabName: cleanText(result.tabName, ""),
        rowNumber: result.rowNumber,
      };
      await finalizeConvertedProjectRecord(nextItem, result, convertTo);
      nextItem.color = convertTo === "repeatable" ? DEFAULT_COLORS.repeatable : DEFAULT_COLORS.project;
      await storage.upsertParkingItem(nextItem);
      return nextItem;
    }

    async function convertParkingToDrop(detail) {
      if (!detail || !detail.weeklyTask || !detail.weeklyTask.id) {
        return;
      }

      const sourceItem = detail.weeklyTask;
      const parkingItem = parseParkingItem({
        title: sourceItem.title,
        notes: cleanText(sourceItem.notes, ""),
        tags: cleanText(sourceItem.tags, ""),
        color: cleanText(sourceItem.color, ""),
        checklistJson: JSON.stringify(sourceItem.checklist || []),
        reminderJson: JSON.stringify(sourceItem.reminder || {}),
        metadataJson: JSON.stringify(sourceItem.metadata || {}),
        convertedTo: { type: "weekly", id: sourceItem.id },
        convertedFromParking: sourceItem.id,
      });

      await storage.upsertParkingItem(parkingItem);
      if (detail.archive !== false) {
        await storage.deleteWeeklyTask(sourceItem.id, { hardDelete: false });
      }

      if (typeof callbacks.onParkingCreatedFromWeekly === "function") {
        callbacks.onParkingCreatedFromWeekly(safeClone(parkingItem), detail);
      }
    }

    function handleRootClick(event) {
      const button = event.target.closest("button[data-action]");
      if (!button) {
        return;
      }

      const card = button.closest("[data-parking-id]");
      const item = card ? state.items.find((entry) => cleanText(entry.id, "") === cleanText(card.dataset.parkingId, "")) : null;

      if (button.dataset.action === "parking-add") {
        openCreateDialog();
        return;
      }

      if (!item) {
        return;
      }

      if (button.dataset.action === "edit") {
        const convertedType = cleanText(item.convertedTo && item.convertedTo.type, "");
        if (convertedType === "task-manager") {
          openAdHocParkingDialog(item);
          return;
        }

        if (convertedType === "project" || convertedType === "repeatable") {
          item._parkingRoot = root;
          openProjectEditByProjectId(
            cleanText(item.convertedTo && item.convertedTo.id, item.id),
            item.title,
            convertedType,
            item,
            storage
          ).then((opened) => {
            if (!opened) {
              openDialog(item);
            }
          }).catch((error) => {
            console.error(error);
            openDialog(item);
          });
          return;
        }

        openDialog(item);
        return;
      }

      if (button.dataset.action === "delete") {
        storage.deleteParkingItem(item.id);
        return;
      }

      if (button.dataset.action === "menu-toggle") {
        const menu = convertMenuForCard(card);
        const nextOpen = menu.hidden;
        closeMenus();
        menu.hidden = !nextOpen;
        return;
      }

      if (button.dataset.action === "convert-project") {
        closeMenus();
        convertItemDirectly(item, "project").catch((error) => console.error(error));
        return;
      }

      if (button.dataset.action === "convert-adhoc") {
        closeMenus();
        convertItemDirectly(item, "task-manager").catch((error) => console.error(error));
        return;
      }

      if (button.dataset.action === "convert-repeatable") {
        closeMenus();
        convertItemDirectly(item, "repeatable").catch((error) => console.error(error));
      }
    }

    function handleDragStart(event) {
      const handle = event.target.closest("[data-action='drag-handle'][draggable='true']");
      if (!handle) {
        return;
      }

      const card = handle.closest("[data-parking-id]");
      if (!card) {
        return;
      }

      const item = state.items.find((entry) => cleanText(entry.id, "") === cleanText(card.dataset.parkingId, ""));
      if (!item) {
        return;
      }

      const payload = {
        kind: "parking-item",
        item: item,
      };

      state.activeDragItem = payload;

      card.classList.add("is-dragging");
      event.dataTransfer.effectAllowed = "copyMove";
      event.dataTransfer.setData("text/plain", JSON.stringify(payload));
      if (typeof callbacks.onParkingDragStart === "function") {
        callbacks.onParkingDragStart(payload);
      }
    }

    function handleDragEnd(event) {
      const handle = event.target.closest("[data-action='drag-handle'][draggable='true']");
      if (!handle) {
        return;
      }

      const card = handle.closest("[data-parking-id]");
      if (card) {
        card.classList.remove("is-dragging");
      }
      state.activeDragItem = null;
      if (typeof callbacks.onParkingDragEnd === "function") {
        callbacks.onParkingDragEnd();
      }
    }

    function handleDropZoneDragOver(event) {
      const payloadText = cleanText(event.dataTransfer && event.dataTransfer.getData("text/plain"), "");
      if (!payloadText) {
        return;
      }

      event.preventDefault();
      root.querySelector("[data-role='parking-dropzone']").classList.add("is-drop-target");
      event.dataTransfer.dropEffect = "copy";
    }

    function handleDropZoneDragLeave(event) {
      if (event.relatedTarget && root.contains(event.relatedTarget)) {
        return;
      }

      root.querySelector("[data-role='parking-dropzone']").classList.remove("is-drop-target");
    }

    async function handleDropZoneDrop(event) {
      const raw = cleanText(event.dataTransfer && event.dataTransfer.getData("text/plain"), "");
      root.querySelector("[data-role='parking-dropzone']").classList.remove("is-drop-target");
      if (!raw) {
        return;
      }

      let payload = null;
      try {
        payload = JSON.parse(raw);
      } catch (error) {
        payload = null;
      }

      if (!payload || (payload.kind !== "weekly-move" && payload.kind !== "parking-item")) {
        return;
      }

      event.preventDefault();
      await convertParkingToDrop({ weeklyTask: payload.weeklyTask || payload.item || payload, archive: true });
      if (typeof callbacks.onParkingRefresh === "function") {
        callbacks.onParkingRefresh();
      }
      render();
    }

    root.addEventListener("click", handleRootClick);
    root.addEventListener("dragstart", handleDragStart);
    root.addEventListener("dragend", handleDragEnd);
    root.querySelector("[data-role='parking-dropzone']").addEventListener("dragover", handleDropZoneDragOver);
    root.querySelector("[data-role='parking-dropzone']").addEventListener("dragleave", handleDropZoneDragLeave);
    root.querySelector("[data-role='parking-dropzone']").addEventListener("drop", handleDropZoneDrop);
    root.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeMenus();
      }
    });

    root.querySelectorAll("[data-parking-id]").forEach((card) => {
      card.setAttribute("draggable", "true");
    });

    unsubscribe = storage.onChange(() => {
      if (!destroyed) {
        render();
      }
    });

    render();

    return {
      render,
      openDialog,
      destroy() {
        destroyed = true;
        if (unsubscribe) {
          unsubscribe();
        }
      },
    };
  }

  window.ParkingLotComponent = {
    mount,
    loadTemplate,
  };
})();