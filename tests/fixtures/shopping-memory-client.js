import { shoppingCategoryNames } from "../../src/services/shoppingService.js";

export function createMemoryShoppingClient() {
  const categories = shoppingCategoryNames.map((name, i) => ({
    id: `30000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    name, predefined_order: i + 1, created_at: new Date(i).toISOString(), updated_at: new Date(i).toISOString(),
  }));
  const data = { meals_shopping_categories: categories, meals_shopping_items: [] };
  const control = { failure: null, loseInsert: false, cap: 500, calls: [], data };
  function from(name) {
    let mode = "select", values, predicates = [], limit = 500, single = false, maybe = false, exact = false;
    const query = {
      select(_columns, options) { if (options?.count === "exact") exact = true; return query; },
      insert(value) { mode = "insert"; values = value; return query; },
      update(value) { mode = "update"; values = value; return query; },
      delete(options) { mode = "delete"; exact = options?.count === "exact"; return query; },
      eq(key, value) { predicates.push((row) => row[key] === value); return query; },
      gt(key, value) { predicates.push((row) => row[key] > value); return query; },
      not(key, operator, value) {
        if (operator !== "is" || value !== null) throw new Error("Unsupported fixture predicate.");
        predicates.push((row) => row[key] !== null); return query;
      },
      order() { return query; },
      limit(value) { limit = Math.min(value, control.cap); return query; },
      single() { single = true; return query; },
      maybeSingle() { maybe = true; return query; },
      then(resolve, reject) {
        return Promise.resolve().then(() => {
          control.calls.push({ name, mode, values });
          if (control.failure) {
            const error = control.failure; control.failure = null;
            return { data: null, error };
          }
          const error = (code, message) => ({ data: null, error: { code, message } });
          let selected = data[name].filter((row) => predicates.every((predicate) => predicate(row)));
          if (mode === "insert") {
            if (data[name].some((row) => row.id === values.id)) return error("23505", "Duplicate identity");
            if (name.endsWith("categories") && data[name].some((row) => row.name.toLowerCase() === values.name.trim().toLowerCase())) return error("23505", "Duplicate name");
            const now = new Date(Date.now() + control.calls.length).toISOString();
            selected = [{ ...values, ...(name.endsWith("categories") ? { predefined_order: null } : {}),
              created_at: now, updated_at: now }];
            data[name].push(...selected);
            if (control.loseInsert) {
              control.loseInsert = false; return error("NETWORK", "Response lost after insert");
            }
          } else if (mode === "update") {
            if (name.endsWith("categories") && selected.some((row) => row.predefined_order !== null)) return error("23514", "Protected");
            selected = selected.map((row) => Object.assign(row, values, { updated_at: new Date().toISOString() }));
          } else if (mode === "delete") {
            if (name.endsWith("categories") && selected.some((row) => data.meals_shopping_items.some((item) => item.category_id === row.id))) return error("23503", "Referenced");
            if (name.endsWith("categories") && selected.some((row) => row.predefined_order !== null)) return error("23514", "Protected");
            data[name] = data[name].filter((row) => !selected.includes(row));
          } else selected = selected.toSorted((a, b) => a.id.localeCompare(b.id));
          const count = exact ? selected.length : null;
          if (mode === "select") selected = selected.slice(0, limit);
          if ((single && selected.length !== 1) || (maybe && selected.length > 1)) return error("PGRST116", "Missing row");
          return { data: structuredClone(single || maybe ? selected[0] ?? null : selected), count, error: null };
        }).then(resolve, reject);
      },
    };
    return query;
  }
  return { from, control };
}
