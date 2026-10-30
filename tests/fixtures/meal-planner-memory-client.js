// Isolated test transport only; never included in the production application.
export function createMemoryMealPlannerClient(storage = globalThis.sessionStorage) {
  const key = "meals-planner-synthetic-data";
  const control = { failure: null, lose: null, cap: 2, calls: [] };
  const load = () => JSON.parse(storage.getItem(key) || "[]");
  function from(name) {
    if (name !== "meals_planner_entries") throw new Error("Unexpected meal test table.");
    let mode = "select", values, filters = [], limit = 500, single = false, maybe = false, exact = false;
    const query = {
      select(_columns, options) { exact ||= options?.count === "exact"; return query; },
      insert(value) { mode = "insert"; values = value; return query; },
      update(value) { mode = "update"; values = value; return query; },
      delete() { mode = "delete"; return query; },
      eq(column, value) { filters.push((row) => row[column] === value); return query; },
      gt(column, value) { filters.push((row) => row[column] > value); return query; },
      order() { return query; },
      limit(value) { limit = Math.min(value, control.cap); return query; },
      single() { single = true; return query; },
      maybeSingle() { maybe = true; return query; },
      then(resolve, reject) {
        return Promise.resolve().then(() => {
          control.calls.push({ name, mode, values });
          const error = (message) => ({ data: null, error: { message } });
          if (control.failure === mode) { control.failure = null; return error("Synthetic meal failure"); }
          const data = load();
          let selected = data.filter((r) => filters.every((f) => f(r)));
          if (mode === "insert") {
            if (data.some((r) => r.id === values.id)) return error("Duplicate identity");
            const recipes = JSON.parse(storage.getItem("meals-recipe-synthetic-data") || "{}").meals_recipes || [];
            const recipe = values.recipe_id ? recipes.find((r) => r.id === values.recipe_id) : null;
            if (values.recipe_id && !recipe) return error("Recipe no longer exists");
            const now = new Date(Date.now() + control.calls.length).toISOString();
            selected = [{ ...values, display_text: recipe ? recipe.title : values.display_text,
              insertion_order: Math.max(0, ...data.map((r) => Number(r.insertion_order))) + 1,
              created_at: now, updated_at: now }];
            data.push(...selected);
          } else if (mode === "update") {
            selected.forEach((row) => Object.assign(row, values, { updated_at: new Date(Date.now() + control.calls.length).toISOString() }));
          }
          const saved = mode === "delete" ? data.filter((r) => !selected.includes(r)) : data;
          storage.setItem(key, JSON.stringify(saved));
          if (control.lose === mode) { control.lose = null; return error("Response lost after meal write"); }
          const count = exact ? selected.length : null;
          selected = selected.toSorted((a, b) => a.id.localeCompare(b.id));
          if (mode === "select" && !single && !maybe) selected = selected.slice(0, limit);
          return { data: structuredClone(single || maybe ? selected[0] || null : selected), error: null, count };
        }).then(resolve, reject);
      },
    };
    return query;
  }
  return { from, control };
}

export function createMemoryWeeklyClient() {
  const key = "meals-weekly-synthetic-data";
  const tables = ["planner_tasks", "planner_weekly_tasks", "planner_parking_lot",
    "projects_all", "projects_home", "projects_vehicle", "projects_repeating", "projects_misc", "planner_repeatable_overrides"];
  const initial = () => Object.fromEntries(tables.map((name) => [name, name === "planner_weekly_tasks"
    ? [{ id: "week-settings", metadata_json: { weekStartDate: "2026-10-26" } }] : []]));
  return { from(name) {
    if (!tables.includes(name)) throw new Error(`Unexpected Weekly Planner fixture table: ${name}`);
    let mode = "select", values, offset = 0, end = 499, filters = [], single = false;
    const q = {
      select() { return q; }, order() { return q; },
      range(a, b) { offset = a; end = b; return q; },
      eq(k, v) { filters.push((r) => r[k] === v); return q; },
      is(k, v) { filters.push((r) => (r[k] ?? null) === v); return q; },
      update(v) { mode = "update"; values = v; return q; },
      insert(v) { mode = "insert"; values = v; return q; },
      single() { single = true; return q; },
      then(resolve, reject) {
        return Promise.resolve().then(() => {
          const data = JSON.parse(sessionStorage.getItem(key) || "null") || initial();
          let rows = data[name].filter((r) => filters.every((f) => f(r)));
          if (mode === "update") rows.forEach((r) => Object.assign(r, values));
          if (mode === "insert") { rows = [{ ...values }]; data[name].push(...rows); }
          sessionStorage.setItem(key, JSON.stringify(data));
          rows = rows.toSorted((a, b) => a.id.localeCompare(b.id)).slice(offset, end + 1);
          return { data: structuredClone(single ? rows[0] : rows), error: null };
        }).then(resolve, reject);
      },
    };
    return q;
  } };
}
