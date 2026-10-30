// Isolated browser-test transport only. Production builds never import this module.
export function createMemoryRecipeClient() {
  const key = "meals-recipe-synthetic-data";
  const empty = () => ({ meals_recipes: [], meals_recipe_categories: [], meals_recipe_cuisines: [] });
  return {
    from(table) {
      let action = "select", values, ids, after, ordered = false, maximum = 500, mode = "", exact = false;
      const query = {
        select(_columns, options) { if (options?.count === "exact") exact = true; return query; },
        insert(value) { action = "insert"; values = value; return query; },
        update(value) { action = "update"; values = value; return query; },
        delete(options) { action = "delete"; exact = options?.count === "exact"; return query; },
        eq(_column, id) { ids = [id]; return query; },
        in(_column, selected) { ids = selected; return query; },
        gt(_column, id) { after = id; return query; },
        order() { ordered = true; return query; },
        limit(count) { maximum = Math.min(count, 2); return query; },
        single() { mode = "single"; return query; },
        maybeSingle() { mode = "maybe"; return query; },
        then(resolve, reject) {
          return (async () => {
            const control = JSON.parse(sessionStorage.getItem("meals-recipe-test-control") || "{}");
            if (control.delay) await new Promise((done) => setTimeout(done, control.delay));
            if (control.fail === action || control.fail === "all") {
              return { data: null, error: { message: `Synthetic ${action} failure` } };
            }
            const store = JSON.parse(sessionStorage.getItem(key) || "null") || empty();
            if (!store[table]) throw new Error("Unexpected test table");
            let rows = store[table].filter((r) => (!ids || ids.includes(r.id)) && (!after || r.id > after));
            const count = rows.length;
            if (action === "insert") {
              const row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...values };
              if (store[table].some((r) => r.id === row.id || (r.name && r.name.toLowerCase() === row.name?.toLowerCase()))) {
                return { data: null, error: { code: "23505", message: "Duplicate" } };
              }
              store[table].push(row); rows = [row];
            } else if (action === "update") {
              if (values.name && store[table].some((r) => !rows.includes(r) && r.name.toLowerCase() === values.name.toLowerCase())) {
                return { data: null, error: { code: "23505", message: "Duplicate" } };
              }
              rows.forEach((row) => Object.assign(row, values, { updated_at: new Date().toISOString() }));
            } else if (action === "delete") {
              const field = table === "meals_recipe_categories" ? "category_id" : "cuisine_id";
              if (table !== "meals_recipes" && store.meals_recipes.some((r) => rows.some((v) => v.id === r[field]))) {
                return { data: null, error: { code: "23503", message: "In use" } };
              }
              store[table] = store[table].filter((r) => !rows.includes(r));
              if (table === "meals_recipes") {
                const mealsKey = "meals-planner-synthetic-data";
                const meals = JSON.parse(sessionStorage.getItem(mealsKey) || "[]");
                meals.forEach((entry) => {
                  const recipe = rows.find((r) => r.id === entry.recipe_id);
                  if (recipe) Object.assign(entry, { recipe_id: null, display_text: recipe.title, updated_at: new Date().toISOString() });
                });
                sessionStorage.setItem(mealsKey, JSON.stringify(meals));
              }
            }
            if (ordered) rows.sort((a, b) => a.id.localeCompare(b.id));
            if (action === "select" && !mode) rows = rows.slice(0, maximum);
            if (mode === "single" && rows.length !== 1) return { data: null, error: { message: "Row not found" } };
            sessionStorage.setItem(key, JSON.stringify(store));
            return { data: mode ? rows[0] || null : rows, error: null, count: exact ? count : null };
          })().then(resolve, reject);
        },
      };
      return query;
    },
  };
}
