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
        recurrence: ["recurrence", "frequency", "repeat", "interval"],
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
    if (Array.isArray(value)) {
      return value.map((item) => cleanString(item)).filter(Boolean);
    }

    const text = cleanString(value);
    if (!text) {
      return [];
    }

    return text
      .split(/[\n,;|]+/g)
      .map((item) => item.trim())
      .filter(Boolean);
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

    const idSelected = pickFromRow(rowMap, schema.id);
    const titleSelected = pickFromRow(rowMap, schema.title);
    const categorySelected = pickFromRow(rowMap, schema.category);
    const stateSelected = pickFromRow(rowMap, schema.state);

    [idSelected.key, titleSelected.key, categorySelected.key, stateSelected.key]
      .filter(Boolean)
      .forEach((key) => usedKeys.add(key));

    const title = cleanString(titleSelected.value) || "Untitled Project";
    const metadata = applyMetadataSchema(rowMap, schema.metadata, usedKeys);
    appendRemainingMetadata(rowMap, usedKeys, metadata);

    const rawId = cleanString(idSelected.value);
    const id = rawId || `${schema.source.toLowerCase()}-${slugify(title)}-${index + 1}`;

    return {
      id,
      source: schema.source,
      title,
      category: cleanString(categorySelected.value) || "uncategorized",
      state: cleanString(stateSelected.value) || "unknown",
      metadata,
    };
  }

  function normalizeProjects(rows, schema) {
    return (rows || []).map((row, index) => normalizeRow(row, schema, index));
  }

  function buildProjectSignature(project) {
    const metadata = project.metadata || {};
    const metadataEntries = Object.keys(metadata)
      .filter((key) => key !== "sources")
      .sort()
      .map((key) => [key, metadata[key]]);

    return JSON.stringify({
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
    const unique = [];
    const signatureMap = new Map();

    (projects || []).forEach((project) => {
      const signature = buildProjectSignature(project);
      const existing = signatureMap.get(signature);

      if (existing) {
        const merged = mergeProjects(existing, project);
        const index = unique.findIndex((item) => buildProjectSignature(item) === signature);
        if (index >= 0) {
          unique[index] = merged;
          signatureMap.set(signature, merged);
        }
        return;
      }

      signatureMap.set(signature, project);
      unique.push({
        ...project,
        metadata: {
          ...project.metadata,
          sources: [project.source].filter(Boolean),
        },
      });
    });

    return unique;
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

    UnifiedProjectList = dedupeProjects([...home, ...vehicle, ...repeating]);
    window.UnifiedProjectList = UnifiedProjectList;
    return UnifiedProjectList;
  }

  const service = {
    SCHEMAS,
    get UnifiedProjectList() {
      return UnifiedProjectList;
    },
    loadHomeProjects,
    loadVehicleProjects,
    loadRepeatingProjects,
    loadAllProjects,
  };

  window.ProjectsService = service;
  window.loadHomeProjects = loadHomeProjects;
  window.loadVehicleProjects = loadVehicleProjects;
  window.loadRepeatingProjects = loadRepeatingProjects;
  window.loadAllProjects = loadAllProjects;
})();
