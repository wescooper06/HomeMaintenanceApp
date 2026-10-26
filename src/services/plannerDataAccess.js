const PROJECT_TABLES = {
  home: "projects_home",
  vehicle: "projects_vehicle",
  repeating: "projects_repeating",
  misc: "projects_misc",
};

export function createPlannerDataAccess(supabase) {
  const copy = (value) => structuredClone(value);
  const text = (value) => String(value ?? "").trim();
  function sortedJson(value) {
    if (Array.isArray(value)) return value.map(sortedJson);
    if (value && typeof value === "object") return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, sortedJson(value[key])])
    );
    return value;
  }

  function json(value, fallback, field) {
    if (value == null || value === "") return copy(fallback);
    try {
      const parsed = typeof value === "string" ? JSON.parse(value) : copy(value);
      const valid = Array.isArray(fallback) ? Array.isArray(parsed)
        : parsed !== null && typeof parsed === "object" && !Array.isArray(parsed);
      if (!valid) throw new Error("Unexpected JSON shape.");
      return parsed;
    } catch (error) {
      throw new Error(`Invalid ${field}.`, { cause: error });
    }
  }

  function check(error, operation) {
    if (error) throw new Error(`${operation}: ${[
      error.message, error.details, error.hint,
    ].filter(Boolean).join(" ")}`, { cause: error });
  }

  async function rows(table) {
    const result = [];
    for (let offset = 0; ;) {
      const { data, error } = await supabase.from(table).select("*")
        .order("id", { ascending: true }).range(offset, offset + 499);
      check(error, `Reading ${table}`);
      if (!Array.isArray(data)) throw new Error(`Reading ${table}: expected rows.`);
      result.push(...data);
      if (!data.length) return result;
      offset += data.length;
    }
  }

  function number(value, field, integer = false) {
    if (value == null || text(value) === "") return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || (integer && !Number.isSafeInteger(parsed))) {
      throw new Error(`${field} must be ${integer ? "an integer" : "a number"}.`);
    }
    return parsed;
  }

  const dateKey = (value) => text(value).slice(0, 10);
  const sourceType = (source) => {
    return text(source).toLowerCase();
  };

  function taskFromRow(row) {
    return {
      id: row.id, taskId: row.id, projectId: row.project_id || "",
      title: row.title || "Untitled Task", source: row.source || "unknown",
      category: row.category || "uncategorized", state: row.state || "unknown",
      priority: row.priority ?? 3, order: row.order,
      recurrence: row.recurrence || "", startDate: dateKey(row.start_date),
      updatedAt: row.updated_at, deleted: row.deleted === true,
      metadataJson: JSON.stringify(json(row.metadata_json, {}, "task metadata")),
    };
  }

  function weeklyFromRow(row) {
    const metadata = json(row.metadata_json, {}, "weekly metadata");
    const override = json(metadata.override, {}, "weekly override");
    return {
      id: row.id, taskId: row.id, taskType: row.task_type || "curated",
      type: row.task_type || "curated", title: row.title || "Untitled Task",
      source: row.source || "unknown", projectId: row.project_id || "",
      parentRepeatableId: row.parent_rep || "",
      occurrenceDate: dateKey(row.occurrence_date),
      date: dateKey(override.date ?? row.date),
      timeSlot: text(row.time_slot || row.bucket || "morning").toLowerCase(),
      bucket: text(row.bucket || row.time_slot || "morning").toLowerCase(),
      completed: override.completed ?? (row.completed === true),
      overridden: row.overridden === true || Object.keys(override).length > 0,
      deletedInstance: row.deleted_instance === true || row.deleted === true,
      deleted: row.deleted === true,
      checklist: json(row.checklist_json, [], "weekly checklist"),
      reminder: json(row.reminder_json, {}, "weekly reminder"),
      metadata, checklistOpen: row.checklist_open === true, updatedAt: row.updated_at,
    };
  }

  function parkingFromRow(row) {
    const metadata = json(row.metadata_json, {}, "Parking Lot metadata");
    const conversionType = text(metadata.conversionType);
    if (row.converted_to_type === true && row.converted_to_id && !conversionType) {
      throw new Error(`Parking item ${row.id} is converted but metadata_json.conversionType is missing.`);
    }
    return {
      id: row.id, title: row.title || "Untitled Idea", notes: row.notes || "",
      tags: row.tags || "", priority: row.priority || "low", color: row.color || "",
      createdAt: row.created_at, updatedAt: row.updated_at, source: "parking-lot",
      deleted: row.deleted === true,
      convertedTo: row.converted_to_type === true && row.converted_to_id
        ? { type: conversionType, id: row.converted_to_id } : null,
      checklistJson: JSON.stringify(json(row.checklist_json, [], "Parking Lot checklist")),
      reminderJson: JSON.stringify(json(row.reminder_json, {}, "Parking Lot reminder")),
      metadataJson: JSON.stringify(metadata),
    };
  }

  async function loadPlannerState() {
    const [taskRows, weeklyRows, parkingRows] = await Promise.all([
      rows("planner_tasks"), rows("planner_weekly_tasks"), rows("planner_parking_lot"),
    ]);
    const settings = weeklyRows.find((row) => row.id === "week-settings");
    if (!settings) throw new Error('The existing "week-settings" row is missing.');
    const settingsMetadata = json(settings?.metadata_json, {}, "week settings");
    return {
      tasks: taskRows.filter((row) => row.deleted !== true).map(taskFromRow),
      weeklyTasks: weeklyRows.filter((row) => row.id !== "week-settings").map(weeklyFromRow),
      parkingItems: parkingRows.filter((row) => row.deleted !== true).map((row) => {
        const item = parkingFromRow(row);
        const conversion = item.convertedTo;
        const task = ["task-manager", "ad-hoc"].includes(conversion?.type)
          ? taskRows.find((entry) => entry.id === conversion.id)
          : conversion?.type === "weekly" ? weeklyRows.find((entry) => entry.id === conversion.id) : null;
        const projectId = ["project", "repeatable"].includes(conversion?.type)
          ? conversion.id : task?.project_id || "";
        return { ...item, projectId };
      }),
      weekStartDate: text(settingsMetadata.weekStartDate),
    };
  }

  // This is the only write entry point for Planner rows. Missing supplied UUIDs
  // are errors, not permission to recreate an imported row under another identity.
  async function savePlannerState(changes, { insertOnly = false } = {}) {
    const plans = [];
    const now = new Date().toISOString();
    async function plan(table, items, shape, fromRow, generateId) {
      if (!items) return;
      const existing = await rows(table);
      const ids = new Set();
      for (const item of items) {
        const requested = text(item.id || item.taskId);
        if (insertOnly && !requested) throw new Error(`Backup ${table} rows require stable IDs.`);
        const old = existing.find((row) => row.id === requested);
        if (!insertOnly && table !== "planner_parking_lot" && old && Object.hasOwn(item, "updatedAt")
          && item.updatedAt !== old.updated_at) {
          throw new Error(`${table} row ${requested} changed. Reload before saving.`);
        }
        if (requested === "week-settings") throw new Error("Use weekStartDate to update week settings.");
        if (requested && !old && !generateId && !insertOnly) {
          throw new Error(`Cannot update missing ${table} row ${requested}. Refresh and retry.`);
        }
        const id = old?.id || requested || crypto.randomUUID();
        if (ids.has(id)) throw new Error(`Duplicate ${table} row ${id} in save.`);
        ids.add(id);
        const baseline = old ? shape(fromRow(old), old) : {};
        const next = shape(insertOnly ? item : old ? { ...fromRow(old), ...item } : item,
          insertOnly ? undefined : old);
        const rowChanges = Object.fromEntries(Object.entries(next).filter(([key, value]) =>
          value !== undefined && (!old || JSON.stringify(insertOnly ? sortedJson(value) : value)
            !== JSON.stringify(insertOnly ? sortedJson(baseline[key]) : baseline[key]))));
        if (!insertOnly && table === "planner_weekly_tasks"
          && (next.deleted === true || next.deleted_instance === true)
          && old?.deleted !== true && old?.deleted_instance !== true
          && !changes.deletedWeeklyTaskIds?.includes(id)) {
          throw new Error(`Deleting Planner task ${id} requires explicit deletion intent.`);
        }
        if (insertOnly && old && Object.keys(rowChanges).length) {
          throw new Error(`Backup conflict in ${table} row ${id}. Existing rows were not overwritten.`);
        }
        const oldTime = old?.updated_at ? Date.parse(
          /Z$|[+-]\d\d:\d\d$/.test(old.updated_at) ? old.updated_at : `${old.updated_at}Z`) : NaN;
        const updatedAt = Number.isFinite(oldTime) && oldTime >= Date.parse(now)
          ? new Date(oldTime + 1).toISOString() : now;
        plans.push({ table, id, old,
          unchanged: Boolean(old) && !Object.keys(rowChanges).length,
          row: { ...rowChanges, updated_at: updatedAt } });
      }
    }
    await plan("planner_tasks", changes.tasks, (item, old) => ({
      project_id: item.projectId || null, title: item.title,
      source: item.source, category: item.category, state: item.state,
      priority: number(item.priority, "priority", true),
      order: number(item.order, "order", true),
      recurrence: item.recurrence || null, start_date: item.startDate || null,
      metadata_json: { ...json(old?.metadata_json, {}, "task metadata"),
        ...json(item.metadataJson, {}, "task metadata") },
      deleted: item.deleted === true,
    }), taskFromRow, false);
    await plan("planner_weekly_tasks", changes.weeklyTasks, (item, old) => {
      const metadata = { ...json(old?.metadata_json, {}, "weekly metadata"),
        ...json(item.metadata, {}, "weekly metadata") };
      if (item.overridden || metadata.override) {
        metadata.override = { ...json(metadata.override, {}, "weekly override"),
          date: item.date || null, completed: Boolean(item.completed) };
      }
      return {
        task_type: item.taskType || item.type || "curated", title: item.title,
        source: item.source, project_id: item.projectId || null,
        parent_rep: item.parentRepeatableId || null,
        occurrence_date: item.occurrenceDate || null, date: item.date || null,
        time_slot: item.timeSlot, bucket: item.bucket || item.timeSlot,
        completed: Boolean(item.completed), overridden: Boolean(item.overridden),
        deleted_instance: Boolean(item.deletedInstance),
        checklist_json: json(item.checklist ?? item.checklistJson, [], "weekly checklist"),
        reminder_json: json(item.reminder ?? item.reminderJson, {}, "weekly reminder"),
        metadata_json: metadata, checklist_open: Boolean(item.checklistOpen),
        deleted: item.deleted === true,
      };
    }, weeklyFromRow, true);
    await plan("planner_parking_lot", changes.parkingItems, (item, old) => {
      const metadata = { ...json(old?.metadata_json, {}, "Parking Lot metadata"),
        ...json(item.metadataJson, {}, "Parking Lot metadata") };
      const conversion = item.convertedTo;
      if (conversion?.type && conversion.id) metadata.conversionType = conversion.type;
      else delete metadata.conversionType;
      return {
        title: item.title, notes: item.notes || "", tags: item.tags || "",
        priority: item.priority || "low", color: item.color || "",
        checklist_json: json(item.checklistJson, [], "Parking Lot checklist"),
        reminder_json: json(item.reminderJson, {}, "Parking Lot reminder"),
        metadata_json: metadata, converted_to_type: Boolean(conversion?.type && conversion.id),
        converted_to_id: conversion?.id || null, deleted: item.deleted === true,
        ...(insertOnly && item.createdAt ? { created_at: item.createdAt } : {}),
      };
    }, parkingFromRow, false);
    if (Object.hasOwn(changes, "weekStartDate")) {
      const existing = await rows("planner_weekly_tasks");
      const old = existing.find((row) => row.id === "week-settings");
      if (!old) throw new Error('The existing "week-settings" row is missing. No settings row was inserted.');
      if (Object.hasOwn(changes, "expectedWeekStartDate")
        && json(old.metadata_json, {}, "week settings").weekStartDate !== changes.expectedWeekStartDate) {
        throw new Error("Planner week changed in another session. Reload before navigating.");
      }
      if (insertOnly) {
        if (json(old.metadata_json, {}, "week settings").weekStartDate !== changes.weekStartDate) {
          throw new Error("Backup week settings conflict. Merge restore cannot change the current planning week.");
        }
      } else {
        plans.push({
          table: "planner_weekly_tasks", id: old.id, old,
          row: { metadata_json: { ...json(old.metadata_json, {}, "week settings"),
            weekStartDate: changes.weekStartDate }, updated_at: now },
        });
      }
    }
    const saved = [];
    for (const { table, id, old, row, unchanged } of plans) {
      if (unchanged) {
        saved.push({ table, row: old, inserted: false });
        continue;
      }
      let query = supabase.from(table);
      query = old ? query.update(row).eq("id", id) : query.insert({ ...row, ...(id ? { id } : {}) });
      if (old) query = old.updated_at == null
        ? query.is("updated_at", null) : query.eq("updated_at", old.updated_at);
      try {
        const { data, error } = await query.select("*").single();
        check(error, `Saving ${table} ${id}`);
        if (!data) throw new Error(`Saving ${table} ${id} returned no row.`);
        saved.push({ table, row: data, ...(insertOnly ? { inserted: true } : {}) });
      } catch (error) {
        if (!insertOnly) throw error;
        const inserted = saved.filter((entry) => entry.inserted).length;
        throw new Error(`Backup restore stopped after ${inserted} inserted row(s). No existing row was overwritten. Refresh the preview before retrying. ${error.message}`, { cause: error });
      }
    }
    return saved;
  }

  async function restoreRepeatableOccurrence(request) {
    const stale = "This occurrence changed since the restoration prompt opened. Nothing was restored by this request. Reload Planner and review it again.";
    const conflict = "Another occurrence conflicts with this series and date. Restoration was blocked. Reload Planner and review the occurrences.";
    const uncertain = "Restoration could not be confirmed. The occurrence may have been restored. Reload Planner before making further changes.";
    const { taskId, projectId, occurrenceDate, expectedUpdatedAt, date, timeSlot } = request;
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date)
      && Number.isFinite(Date.parse(`${date}T00:00:00Z`))
      && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
    if (!projectId || !occurrenceDate || taskId !== `repeatable-${projectId}-${occurrenceDate}`
      || !Object.hasOwn(request, "expectedUpdatedAt") || !validDate
      || !["morning", "afternoon", "evening"].includes(timeSlot)) throw new Error(conflict);
    const masters = (await rows("planner_tasks")).filter((row) => row.project_id === projectId);
    const master = masters[0];
    const series = master && json(master.metadata_json, {}, "task metadata").series;
    if (masters.length !== 1 || master.deleted === true || master.source !== "repeating"
      || !series || typeof series !== "object" || Array.isArray(series)
      || series.active === false || series.removedFromPlanner === true) throw new Error(conflict);
    const weekly = await rows("planner_weekly_tasks");
    const matches = weekly.filter((row) => row.id === taskId
      || ((row.parent_rep === projectId || row.project_id === projectId)
        && dateKey(row.occurrence_date || row.date) === occurrenceDate));
    const old = matches[0];
    if (!old) throw new Error(stale);
    if (matches.length !== 1 || old.id !== taskId || old.project_id !== projectId
      || old.parent_rep !== projectId || dateKey(old.occurrence_date) !== occurrenceDate
      || old.task_type !== "repeatable" || old.source !== "repeating") throw new Error(conflict);
    const mapped = weeklyFromRow(old);
    if ((old.updated_at ?? null) !== expectedUpdatedAt
      || !(old.deleted === true || old.deleted_instance === true)
      || mapped.date !== date || mapped.timeSlot !== timeSlot) throw new Error(stale);
    const oldTime = old.updated_at ? Date.parse(
      /Z$|[+-]\d\d:\d\d$/.test(old.updated_at) ? old.updated_at : `${old.updated_at}Z`) : NaN;
    const now = new Date().toISOString();
    const updatedAt = Number.isFinite(oldTime) && oldTime >= Date.parse(now)
      ? new Date(oldTime + 1).toISOString() : now;
    const preserved = (row) => {
      const value = { ...row };
      for (const key of ["deleted", "deleted_instance", "updated_at"]) delete value[key];
      return JSON.stringify(sortedJson(value));
    };
    const verify = (row) => {
      if (!row || row.id !== taskId || row.deleted !== false || row.deleted_instance !== false
        || Date.parse(/Z$|[+-]\d\d:\d\d$/.test(row.updated_at) ? row.updated_at : `${row.updated_at}Z`) !== Date.parse(updatedAt)
        || preserved(row) !== preserved(old)) throw new Error(uncertain);
    };
    let query = supabase.from("planner_weekly_tasks")
      .update({ deleted: false, deleted_instance: false, updated_at: updatedAt })
      .eq("id", taskId).eq("project_id", projectId).eq("parent_rep", projectId)
      .eq("occurrence_date", old.occurrence_date).eq("task_type", "repeatable").eq("source", "repeating");
    for (const key of ["updated_at", "deleted", "deleted_instance"]) {
      query = old[key] == null ? query.is(key, null) : query.eq(key, old[key]);
    }
    try {
      const { data, error } = await query.select("*").single();
      if (error?.code === "PGRST116") throw new Error(stale);
      check(error, "Restoring Repeatable occurrence");
      verify(data);
      const after = await rows("planner_weekly_tasks");
      const confirmed = after.find((row) => row.id === taskId);
      verify(confirmed);
      if (confirmed.updated_at !== data.updated_at || after.some((row) => row.id !== taskId
        && (row.parent_rep === projectId || row.project_id === projectId)
        && dateKey(row.occurrence_date || row.date) === occurrenceDate)) throw new Error(uncertain);
      return weeklyFromRow(confirmed);
    } catch (error) {
      if (error.message === stale) throw error;
      throw new Error(uncertain, { cause: error });
    }
  }

  function projectFromRows(view, raw) {
    const metadata = { ...json(raw.metadata, {}, "project metadata"),
      ...json(view.metadata, {}, "project metadata") };
    const aliases = { resource_links: "resourceLinks", date_completed: "dateCompleted",
      hours: "engineHours", cost: "actualCost" };
    for (const [key, value] of Object.entries(raw)) {
      if (!["id", "metadata", "created_at", "updated_at"].includes(key)) {
        metadata[aliases[key] || key] = value;
      }
    }
    for (const field of ["priority", "order", "recurrence"]) metadata[field] = view[field];
    return { ...view, source: view.project_type, metadata,
      resourceLinks: raw.resource_links || [], externalId: view.external_id };
  }

  async function loadProjects() {
    const types = Object.keys(PROJECT_TABLES);
    const [view, ...raw] = await Promise.all([
      rows("projects_all"), ...types.map((type) => rows(PROJECT_TABLES[type])),
    ]);
    return view.map((project) => {
      const index = types.indexOf(project.project_type);
      if (index < 0) throw new Error(`Unknown project type ${project.project_type}.`);
      const record = raw[index].find((row) => row.id === project.id);
      if (!record) throw new Error(`Missing ${project.project_type} project ${project.id}.`);
      return projectFromRows(project, record);
    });
  }

  async function saveProject(project) {
    const type = sourceType(project.project_type || project.source);
    const table = PROJECT_TABLES[type];
    if (!table || !project.id) throw new Error("An existing project ID and type are required.");
    if (sourceType(project.source || type) !== type) throw new Error("Moving projects between raw tables requires creation and is not supported.");
    const existing = (await rows(table)).find((row) => row.id === project.id);
    if (!existing) throw new Error(`Missing ${type} project ${project.id}. New project inserts are disabled.`);
    const metadata = { ...json(existing.metadata, {}, "project metadata"),
      ...json(project.metadata, {}, "project metadata") };
    const changes = { title: project.title, category: project.category, state: project.state,
      metadata };
    if (Object.hasOwn(existing, "updated_at")) changes.updated_at = new Date().toISOString();
    const fields = ["priority", "order"];
    const extra = {
      home: ["property", "area", "resource_links", "cost", "date_completed"],
      vehicle: ["vehicle", "date_completed", "hours", "mileage", "mechanic",
        "service_description", "resource_links", "maintenance_checks"],
      repeating: ["property", "recurrence"],
      misc: ["resource_links"],
    };
    const aliases = { resource_links: "resourceLinks", date_completed: "dateCompleted",
      hours: "engineHours", cost: "actualCost" };
    for (const key of [...fields, ...extra[type]]) {
      const alias = aliases[key] || key;
      let value = Object.hasOwn(metadata, alias) ? metadata[alias] : existing[key];
      if (key === "order") value = number(value, key, true);
      else if (["cost", "hours", "mileage"].includes(key)) value = number(value, key);
      else if (key === "priority") value = value == null || value === "" ? null : String(value);
      else if (key === "resource_links") {
        value = typeof value === "string"
          ? value.split(/[\n,]+/).map(text).filter(Boolean) : json(value, [], key);
      } else if (key === "maintenance_checks") value = value ?? existing[key];
      else value = value == null || value === "" ? null : String(value);
      changes[key] = value;
    }
    const originalMetadata = json(existing.metadata, {}, "project metadata");
    const storedMetadata = { ...metadata };
    for (const key of Object.keys(existing)) {
      const alias = aliases[key] || key;
      if (key !== "metadata" && !Object.hasOwn(originalMetadata, alias)) delete storedMetadata[alias];
    }
    changes.metadata = storedMetadata;
    const { data, error } = await supabase.from(table).update(changes)
      .eq("id", project.id).select("*").single();
    check(error, `Saving ${type} project`);
    if (!data) throw new Error("Project update returned no row.");
    return projectFromRows({
      ...project, title: data.title, category: data.category, state: data.state,
      priority: data.priority, order: data.order, recurrence: data.recurrence || null,
      metadata: data.metadata, project_type: type,
    }, data);
  }

  async function createProject(project) {
    const type = sourceType(project.project_type || project.source);
    const table = PROJECT_TABLES[type];
    if (!table) throw new Error("Select a valid project type.");
    const title = text(project.title);
    if (!title) throw new Error("Project title is required.");
    const metadata = json(project.metadata, {}, "project metadata");
    const payload = {
      title,
      category: text(project.category) || "uncategorized",
      state: text(project.state) || "Not Started",
      priority: text(project.priority) || null,
      order: number(project.order, "order", true),
      metadata,
    };
    const fields = {
      home: ["property", "area", "resource_links", "cost", "date_completed"],
      vehicle: ["vehicle", "date_completed", "hours", "mileage", "mechanic",
        "service_description", "resource_links", "maintenance_checks"],
      repeating: ["property", "recurrence"],
      misc: ["resource_links"],
    };
    const aliases = { resource_links: "resourceLinks", date_completed: "dateCompleted",
      hours: "engineHours", cost: "actualCost" };
    for (const key of fields[type]) {
      const alias = aliases[key] || key;
      let value = Object.hasOwn(metadata, alias) ? metadata[alias] : project[alias];
      if (key === "resource_links") {
        value = typeof value === "string"
          ? value.split(/[\n,]+/).map(text).filter(Boolean) : json(value, [], key);
      } else if (key === "maintenance_checks") value = value ?? [];
      else if (["cost", "hours", "mileage"].includes(key)) value = number(value, key);
      else value = text(value) || null;
      payload[key] = value;
    }
    if (type === "repeating" && !payload.recurrence) {
      throw new Error("Recurrence is required for repeating projects.");
    }
    const { data, error } = await supabase.rpc("create_workbench_project", {
      p_type: type, p_project: payload,
    });
    check(error, `Creating ${type} project`);
    if (!data?.id || !data.external_id) throw new Error("Project creation returned no project identity.");
    return projectFromRows({
      id: data.id, project_type: type, external_id: data.external_id,
      title: data.title, category: data.category, state: data.state,
      priority: data.priority, order: data.order, recurrence: data.recurrence || null,
      metadata: data.metadata,
    }, data);
  }

  async function deleteProject(project) {
    const id = text(project.id);
    const type = sourceType(project.project_type || project.source);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
      || !Object.hasOwn(PROJECT_TABLES, type)) {
      throw new Error("An existing project UUID and canonical type are required.");
    }
    if (project.source && sourceType(project.source) !== type) {
      throw new Error("Project UUID/type identities conflict.");
    }
    const { data, error } = await supabase.rpc("delete_workbench_project", { p_id: id, p_type: type });
    check(error, `Deleting ${type} project`);
    if (data?.deleted !== true || data.id !== id || data.project_type !== type
      || data.table !== PROJECT_TABLES[type] || !data.external_id
      || data.counts?.[PROJECT_TABLES[type]] !== 1
      || !["planner_tasks", "planner_weekly_tasks", "planner_parking_lot"]
        .every((name) => Number.isSafeInteger(data.counts[name]) && data.counts[name] >= 0)) {
      throw new Error("Deletion response could not be verified. Refresh before retrying.");
    }
    return data;
  }

  return { loadPlannerState, savePlannerState, restoreRepeatableOccurrence,
    restorePlannerState: (changes) => savePlannerState(changes, { insertOnly: true }),
    loadProjects, saveProject, createProject, deleteProject };
}
