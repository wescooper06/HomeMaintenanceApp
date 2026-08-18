// ADD PROJECT FEATURE — Copilot context anchor
// This file manages UnifiedProjectList updates, project creation logic,
// sheet routing decisions (List_A, List_B, List_C), and post-submit refresh behavior.
(function () {
  const SOURCE = {
    home: "Project List_A",
    vehicle: "Project List_B",
    repeating: "Project List_C",
  };

  const SCHEMAS = {
    listA: {
      source: SOURCE.home,
      id: ["id", "projectid", "project_id", "taskid"],
      title: ["taskdescription", "task description", "title", "project", "projectname", "task", "item", "description"],
      category: ["category", "system", "type"],
      state: ["state", "status", "phase"],
      metadata: {
        property: ["property"],
        area: ["area"],
        estimatedCost: ["estimatedcost", "estimated_cost", "budgetcost", "budget"],
        actualCost: ["actualcost", "actual_cost", "spent", "cost"],
        recurrence: ["recurrence", "frequency", "repeat"],
        isMaintenance: ["ismaintenance", "maintenanceflag", "maintenance", "is_maintenance"],
        resourceLinks: ["resourcelinks", "resource_links", "links", "resources"],
        dueDate: ["duedate", "due_date", "targetdate", "target_date"],
        notes: ["notes", "description", "details"],
      },
    },
    listB: {
      source: SOURCE.vehicle,
      id: ["id", "projectid", "project_id", "taskid"],
      title: ["service description", "vehicle/small engine", "title", "project", "service", "maintenanceitem", "item"],
      category: ["category", "vehicle", "asset", "system", "type"],
      state: ["state", "status", "phase"],
      metadata: {
        vehicle: ["vehicle/small engine", "vehicle"],
        estimatedCost: ["estimatedcost", "estimated_cost", "budgetcost", "budget"],
        actualCost: ["actualcost", "actual_cost", "spent", "cost"],
        recurrence: ["recurrence", "frequency", "interval"],
        isMaintenance: ["ismaintenance", "maintenanceflag", "maintenance", "is_maintenance"],
        resourceLinks: ["resourcelinks", "resource_links", "links", "resources"],
        mileage: ["mileage", "odometer"],
        engineHours: ["enginehours", "hours", "runtimehours"],
        notes: ["notes", "description", "details"],
      },
    },
    listC: {
      source: SOURCE.repeating,
      id: ["id", "projectid", "project_id", "taskid"],
      title: ["taskdescription", "task description", "title", "project", "task", "chore", "item", "description"],
      category: ["category", "type"],
      state: ["state", "status", "phase", "active"],
      metadata: {
        property: ["property"],
        area: ["area", "householdarea"],
        recurrence: ["recurrence", "recurrance", "frequency", "repeat", "interval"],
        estimatedCost: ["estimatedcost", "estimated_cost", "budgetcost", "budget"],
        actualCost: ["actualcost", "actual_cost", "spent", "cost"],
        isMaintenance: ["ismaintenance", "maintenanceflag", "maintenance", "is_maintenance"],
        resourceLinks: ["resourcelinks", "resource_links", "links", "resources"],
        lastCompleted: ["lastcompleted", "last_completed"],
        nextDue: ["nextdue", "next_due", "duedate", "due_date"],
        notes: ["notes", "description", "details"],
      },
    },
  };

  let UnifiedProjectList = [];
  let LastLoadStats = {
    raw: { home: 0, vehicle: 0, repeating: 0 },
    effective: { home: 0, vehicle: 0, repeating: 0 },
    repeatingMirrorFiltered: false,
    repeatingMirroredRowsFiltered: 0,
    total: 0,
  };

  function sourceKey(source) {
    const text = cleanString(source).toLowerCase();

    if (text.includes("list_a") || text.includes("home")) {
      return "home";
    }

    if (text.includes("list_b") || text.includes("vehicle")) {
      return "vehicle";
    }

    if (text.includes("list_c") || text.includes("repeating")) {
      return "repeating";
    }

    return "home";
  }

  function getSheetsService() {
    if (!window.SheetsService) {
      throw new Error("SheetsService is not available. Load sheets.service.js before projects.service.js.");
    }

    return window.SheetsService;
  }

  function normalizeHeaderKey(value) {
    return String(value == null ? "" : value)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
  }

  function cleanString(value) {
    if (value == null) {
      return "";
    }

    return String(value).trim();
  }

  function toNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    const text = cleanString(value);
    if (!text) {
      return null;
    }

    const normalized = text.replace(/[$,]/g, "");
    const num = Number(normalized);
    return Number.isFinite(num) ? num : null;
  }

  function toBoolean(value) {
    if (typeof value === "boolean") {
      return value;
    }

    const text = cleanString(value).toLowerCase();
    if (!text) {
      return null;
    }

    if (["true", "yes", "y", "1", "on", "active", "open"].includes(text)) {
      return true;
    }

    if (["false", "no", "n", "0", "off", "inactive", "closed"].includes(text)) {
      return false;
    }

    return null;
  }

  function toRecurrence(value) {
    const text = cleanString(value);
    return text ? text.toLowerCase() : "";
  }

  function toLinks(value) {
    const toLinkEntry = (entry) => {
      if (entry && typeof entry === "object") {
        const url = cleanString(entry.url || entry.href || entry.link);
        if (!url) {
          return "";
        }

        const title = cleanString(entry.title || entry.name || entry.label);
        return title ? { url, title } : { url };
      }

      return cleanString(entry);
    };

    if (Array.isArray(value)) {
      return value.map((item) => toLinkEntry(item)).filter(Boolean);
    }

    const text = cleanString(value);
    if (!text) {
      return [];
    }

    if (text.startsWith("[") || text.startsWith("{")) {
      try {
        const parsed = JSON.parse(text);
        const list = Array.isArray(parsed) ? parsed : [parsed];
        const parsedLinks = list.map((item) => toLinkEntry(item)).filter(Boolean);
        if (parsedLinks.length) {
          return parsedLinks;
        }
      } catch (error) {
        // Fall through to comma-separated parsing.
      }
    }

    return text
      .split(/[\n,]+/g)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  function buildNormalizedRowMap(row) {
    const map = {};

    Object.keys(row || {}).forEach((key) => {
      map[normalizeHeaderKey(key)] = cleanString(row[key]);
    });

    return map;
  }

  function pickFromRow(rowMap, candidates) {
    for (let i = 0; i < candidates.length; i += 1) {
      const key = normalizeHeaderKey(candidates[i]);
      if (Object.prototype.hasOwnProperty.call(rowMap, key) && rowMap[key] !== "") {
        return {
          key,
          value: rowMap[key],
        };
      }
    }

    return {
      key: "",
      value: "",
    };
  }

  function slugify(value) {
    const text = cleanString(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    return text || "untitled";
  }

  function parseFieldByHint(key, value) {
    const text = cleanString(value);
    if (!text) {
      return null;
    }

    const normalizedKey = normalizeHeaderKey(key);

    if (/(resourcelinks|links|resources|urls|url)$/.test(normalizedKey)) {
      return toLinks(text);
    }

    if (/(cost|price|amount|budget|expense)/.test(normalizedKey)) {
      const parsedCost = toNumber(text);
      return parsedCost == null ? text : parsedCost;
    }

    if (/(recurrence|frequency|interval|repeat)/.test(normalizedKey)) {
      return toRecurrence(text);
    }

    if (/(maintenance|flag|active|enabled|completed|complete|done|archived)/.test(normalizedKey)) {
      const parsedBool = toBoolean(text);
      return parsedBool == null ? text : parsedBool;
    }

    return text;
  }

  function applyMetadataSchema(rowMap, schemaMetadata, usedKeys) {
    const metadata = {};

    Object.keys(schemaMetadata).forEach((metadataKey) => {
      const candidates = schemaMetadata[metadataKey] || [];
      const selected = pickFromRow(rowMap, candidates);

      if (!selected.value) {
        return;
      }

      usedKeys.add(selected.key);

      if (metadataKey === "resourceLinks") {
        metadata[metadataKey] = toLinks(selected.value);
        return;
      }

      if (metadataKey === "recurrence") {
        metadata[metadataKey] = toRecurrence(selected.value);
        return;
      }

      if (metadataKey === "estimatedCost" || metadataKey === "actualCost") {
        metadata[metadataKey] = toNumber(selected.value);
        return;
      }

      if (metadataKey === "isMaintenance") {
        metadata[metadataKey] = toBoolean(selected.value);
        return;
      }

      metadata[metadataKey] = cleanString(selected.value);
    });

    return metadata;
  }

  function appendRemainingMetadata(rowMap, usedKeys, metadata) {
    Object.keys(rowMap).forEach((rowKey) => {
      if (usedKeys.has(rowKey)) {
        return;
      }

      const parsed = parseFieldByHint(rowKey, rowMap[rowKey]);
      if (parsed == null || parsed === "") {
        return;
      }

      metadata[rowKey] = parsed;
    });
  }

  function normalizeRow(row, schema, index) {
    const rowMap = buildNormalizedRowMap(row);
    const usedKeys = new Set();
    const sheetRowNumber = Number(row && row._rowNumber);

    const idSelected = pickFromRow(rowMap, schema.id);
    const titleSelected = pickFromRow(rowMap, schema.title);
    const categorySelected = pickFromRow(rowMap, schema.category);
    const stateSelected = pickFromRow(rowMap, schema.state);

    [idSelected.key, titleSelected.key, categorySelected.key, stateSelected.key]
      .filter(Boolean)
      .forEach((key) => usedKeys.add(key));

    const title = cleanString(titleSelected.value) || "Untitled Project";
    const metadata = applyMetadataSchema(rowMap, schema.metadata, usedKeys);
    if (Number.isFinite(sheetRowNumber) && sheetRowNumber > 0) {
      metadata.sheetRowNumber = sheetRowNumber;
    }
    appendRemainingMetadata(rowMap, usedKeys, metadata);

    const rawId = cleanString(idSelected.value);
    const id = rawId || `${schema.source.toLowerCase()}-${slugify(title)}-${index + 1}`;
    metadata._sourceTabId = rawId;
    metadata._sourceGeneratedId = rawId ? false : true;

    return {
      id,
      source: schema.source,
      title,
      category: cleanString(categorySelected.value) || "uncategorized",
      state: cleanString(stateSelected.value) || "unknown",
      resourceLinks: toLinks(metadata.resourceLinks),
      metadata,
    };
  }

  function normalizeProjects(rows, schema) {
    return (rows || []).map((row, index) => normalizeRow(row, schema, index));
  }

  function getProjectIdentityKey(project) {
    const metadata = project.metadata || {};
    const rowNumber = Number(metadata.sheetRowNumber);
    const source = cleanString(project.source).toLowerCase() || "unknown";

    // Prefer immutable sheet row identity so real rows are never collapsed.
    if (Number.isFinite(rowNumber) && rowNumber > 0) {
      return `${source}::row::${rowNumber}`;
    }

    // Fallback identity for rows without sheet row metadata.
    const id = cleanString(project.id).toLowerCase();
    const title = cleanString(project.title).toLowerCase();
    return `${source}::fallback::${id}::${title}`;
  }

  function buildCrossSourceSignature(project) {
    const metadata = project.metadata || {};
    const usesGeneratedId = Boolean(metadata._sourceGeneratedId);
    const metadataEntries = Object.keys(metadata)
      .filter((key) => ![
        "sources",
        "sheetRowNumber",
        "rownumber",
        "_rowNumber",
        "_rownumber",
        "_originalTitle",
        "_originalId",
        "_sourceGeneratedId",
      ].includes(key))
      .sort()
      .map((key) => [key, metadata[key]]);

    return JSON.stringify({
      id: usesGeneratedId ? "" : cleanString(project.id).toLowerCase(),
      title: cleanString(project.title).toLowerCase(),
      category: cleanString(project.category).toLowerCase(),
      state: cleanString(project.state).toLowerCase(),
      metadata: metadataEntries,
    });
  }

  function mergeProjects(existing, incoming) {
    const existingSources = Array.isArray(existing.metadata && existing.metadata.sources)
      ? existing.metadata.sources
      : [existing.source].filter(Boolean);
    const incomingSources = Array.isArray(incoming.metadata && incoming.metadata.sources)
      ? incoming.metadata.sources
      : [incoming.source].filter(Boolean);

    const mergedMetadata = {
      ...existing.metadata,
      ...incoming.metadata,
      sources: [...new Set([...existingSources, ...incomingSources])],
    };

    return {
      ...existing,
      metadata: mergedMetadata,
    };
  }

  function dedupeProjects(projects) {
    // Dedupe strategy:
    // 1) Within-source identity dedupe by stable row identity (source + row number).
    // 2) Cross-source dedupe only for exact mirrors (same normalized content).
    // This preserves distinct rows while preventing feed-mirror inflation.
    const unique = [];
    const identityMap = new Map();

    (projects || []).forEach((project) => {
      const identityKey = getProjectIdentityKey(project);
      const existing = identityMap.get(identityKey);

      if (existing) {
        const merged = mergeProjects(existing.project, project);
        unique[existing.index] = merged;
        identityMap.set(identityKey, {
          project: merged,
          index: existing.index,
        });
        return;
      }

      const index = unique.length;
      const normalized = {
        ...project,
        metadata: {
          ...project.metadata,
          sources: [project.source].filter(Boolean),
        },
      };

      unique.push(normalized);
      identityMap.set(identityKey, {
        project: normalized,
        index,
      });
    });

    // Second pass: collapse exact mirrors across different sources only.
    const crossSourceMap = new Map();
    const merged = [];

    unique.forEach((project) => {
      const signature = buildCrossSourceSignature(project);
      const existing = crossSourceMap.get(signature);

      if (existing && existing.project.source !== project.source) {
        const combined = mergeProjects(existing.project, project);
        merged[existing.index] = combined;
        crossSourceMap.set(signature, {
          project: combined,
          index: existing.index,
        });
        return;
      }

      const index = merged.length;
      merged.push(project);
      crossSourceMap.set(signature, {
        project,
        index,
      });
    });

    return merged;
  }

  function mirrorSignature(project) {
    const metadata = project.metadata || {};

    return JSON.stringify({
      id: cleanString(project.id).toLowerCase(),
      title: cleanString(project.title).toLowerCase(),
      category: cleanString(project.category).toLowerCase(),
      state: cleanString(project.state).toLowerCase(),
      property: cleanString(metadata.property).toLowerCase(),
      area: cleanString(metadata.area).toLowerCase(),
      recurrence: cleanString(metadata.recurrence).toLowerCase(),
    });
  }

  function splitRepeatingMirrorRows(homeProjects, repeatingProjects) {
    if (!Array.isArray(homeProjects) || !Array.isArray(repeatingProjects)) {
      return {
        mirrored: [],
        unique: Array.isArray(repeatingProjects) ? repeatingProjects : [],
      };
    }

    if (!homeProjects.length || !repeatingProjects.length) {
      return {
        mirrored: [],
        unique: repeatingProjects,
      };
    }

    const homeSet = new Set(homeProjects.map(mirrorSignature));
    const mirrored = [];
    const unique = [];

    repeatingProjects.forEach((project) => {
      if (homeSet.has(mirrorSignature(project))) {
        mirrored.push(project);
      } else {
        unique.push(project);
      }
    });

    return {
      mirrored,
      unique,
    };
  }

  async function loadHomeProjects() {
    const sheets = getSheetsService();
    const result = await sheets.fetchHomeSheet();
    return normalizeProjects(result.rows, SCHEMAS.listA);
  }

  async function loadVehicleProjects() {
    const sheets = getSheetsService();
    const result = await sheets.fetchVehicleSheet();
    return normalizeProjects(result.rows, SCHEMAS.listB);
  }

  async function loadRepeatingProjects() {
    const sheets = getSheetsService();
    const result = await sheets.fetchRepeatingSheet();
    return normalizeProjects(result.rows, SCHEMAS.listC);
  }

  async function loadAllProjects() {
    const [home, vehicle, repeating] = await Promise.all([
      loadHomeProjects(),
      loadVehicleProjects(),
      loadRepeatingProjects(),
    ]);

    const repeatingSplit = splitRepeatingMirrorRows(home, repeating);
    const repeatingMirrorFiltered = repeatingSplit.mirrored.length > 0;
    const repeatingEffective = repeatingSplit.unique;

    UnifiedProjectList = dedupeProjects([...home, ...vehicle, ...repeatingEffective]);

    const effectiveCounts = { home: 0, vehicle: 0, repeating: 0 };
    UnifiedProjectList.forEach((project) => {
      const key = sourceKey(project.source);
      if (Object.prototype.hasOwnProperty.call(effectiveCounts, key)) {
        effectiveCounts[key] += 1;
      }
    });

    LastLoadStats = {
      raw: {
        home: home.length,
        vehicle: vehicle.length,
        repeating: repeating.length,
      },
      effective: effectiveCounts,
      repeatingMirrorFiltered,
      repeatingMirroredRowsFiltered: repeatingSplit.mirrored.length,
      total: UnifiedProjectList.length,
    };

    window.UnifiedProjectList = UnifiedProjectList;
    return UnifiedProjectList;
  }

  function buildHomeCreateFields(payload) {
    return {
      Property: cleanString(payload.property),
      Area: cleanString(payload.area),
      Category: cleanString(payload.category),
      "Task Description": cleanString(payload.title),
      Priority: cleanString(payload.priority),
      Order: cleanString(payload.order),
      ResourceLinks: cleanString(payload.resourceLinks),
      "Cost ($)": cleanString(payload.cost),
      State: cleanString(payload.state),
      "Date Completed": cleanString(payload.dateCompleted),
    };
  }

  function buildVehicleCreateFields(payload) {
    return {
      "Vehicle/Small Engine": cleanString(payload.vehicle),
      State: cleanString(payload.state),
      Category: cleanString(payload.category),
      "Date Completed": cleanString(payload.dateCompleted),
      Hours: cleanString(payload.hours),
      Mileage: cleanString(payload.mileage),
      Mechanic: cleanString(payload.mechanic),
      "Service Description": cleanString(payload.title),
      "Resource Links": cleanString(payload.resourceLinks),
      Order: cleanString(payload.order),
    };
  }

  function buildRepeatingCreateFields(payload) {
    return {
      Property: cleanString(payload.property || payload.vehicle),
      Asset: cleanString(payload.vehicle),
      Area: cleanString(payload.area),
      Category: cleanString(payload.category),
      "Task Description": cleanString(payload.title),
      Priority: cleanString(payload.priority),
      Order: cleanString(payload.order),
      ResourceLinks: cleanString(payload.resourceLinks),
      State: cleanString(payload.state),
      Recurrance: cleanString(payload.recurrence),
      Recurrence: cleanString(payload.recurrence),
      "Date Completed": cleanString(payload.dateCompleted),
    };
  }

  async function createProject(payload) {
    const sheets = getSheetsService();
    if (!sheets || typeof sheets.createProject !== "function" || typeof sheets.getNextProjectId !== "function") {
      throw new Error("SheetsService.createProject is unavailable.");
    }

    const explicitSource = cleanString(payload && payload.source).toLowerCase();
    const explicitSourceKey = explicitSource ? sourceKey(explicitSource) : "";
    const isVehicle = cleanString(payload.vehicle) !== "";
    const isProperty = cleanString(payload.property) !== "";
    const hasExplicitSupportedSource = explicitSourceKey === "home" || explicitSourceKey === "vehicle" || explicitSourceKey === "repeating";

    if (!isVehicle && !isProperty && !hasExplicitSupportedSource) {
      throw new Error("Select Property or Vehicle/Engine before creating a project.");
    }

    let destination = null;
    if (payload.addToRepeating) {
      destination = {
        source: SOURCE.repeating,
        tabName: sheets.TABS.repeating,
        fields: buildRepeatingCreateFields(payload),
      };
    } else if (explicitSourceKey === "home") {
      destination = {
        source: SOURCE.home,
        tabName: sheets.TABS.home,
        fields: buildHomeCreateFields(payload),
      };
    } else if (explicitSourceKey === "vehicle") {
      destination = {
        source: SOURCE.vehicle,
        tabName: sheets.TABS.vehicle,
        fields: buildVehicleCreateFields(payload),
      };
    } else if (explicitSourceKey === "repeating") {
      destination = {
        source: SOURCE.repeating,
        tabName: sheets.TABS.repeating,
        fields: buildRepeatingCreateFields(payload),
      };
    } else if (isVehicle) {
      destination = {
        source: SOURCE.vehicle,
        tabName: sheets.TABS.vehicle,
        fields: buildVehicleCreateFields(payload),
      };
    } else {
      destination = {
        source: SOURCE.home,
        tabName: sheets.TABS.home,
        fields: buildHomeCreateFields(payload),
      };
    }

    const nextId = await sheets.getNextProjectId(destination.tabName);
    const result = await sheets.createProject({
      ...destination,
      id: String(nextId),
    });

    if (!result || result.ok === false) {
      throw new Error(cleanString(result && result.error) || "Create project request failed.");
    }

    return {
      ok: true,
      id: cleanString(result.id || nextId),
      tabName: cleanString(result.tabName || destination.tabName),
      rowNumber: result.rowNumber,
      created: result,
    };
  }

  function deleteProject(projectOrId) {
    const project = typeof projectOrId === "object" && projectOrId != null ? projectOrId : null;
    const targetId = cleanString(project ? project.id : projectOrId);
    const targetSource = cleanString(project && project.source).toLowerCase();
    const targetRow = Number(project && project.metadata && project.metadata.sheetRowNumber);

    if (!targetId) {
      return UnifiedProjectList;
    }

    UnifiedProjectList = UnifiedProjectList.filter((item) => {
      const sameId = cleanString(item.id) === targetId;
      if (!sameId) {
        return true;
      }

      if (targetSource && cleanString(item.source).toLowerCase() !== targetSource) {
        return true;
      }

      if (Number.isFinite(targetRow) && targetRow > 0) {
        const itemRow = Number(item && item.metadata && item.metadata.sheetRowNumber);
        return itemRow !== targetRow;
      }

      return false;
    });

    LastLoadStats = {
      ...LastLoadStats,
      total: UnifiedProjectList.length,
    };

    window.UnifiedProjectList = UnifiedProjectList;
    return UnifiedProjectList;
  }

  const service = {
    SCHEMAS,
    get UnifiedProjectList() {
      return UnifiedProjectList;
    },
    get lastLoadStats() {
      return LastLoadStats;
    },
    loadHomeProjects,
    loadVehicleProjects,
    loadRepeatingProjects,
    loadAllProjects,
    createProject,
    deleteProject,
  };

  window.ProjectsService = service;
  window.loadHomeProjects = loadHomeProjects;
  window.loadVehicleProjects = loadVehicleProjects;
  window.loadRepeatingProjects = loadRepeatingProjects;
  window.loadAllProjects = loadAllProjects;
  window.createProjectInSheets = createProject;
  window.deleteProjectFromUnifiedList = deleteProject;
})();
