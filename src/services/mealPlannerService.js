import { getSupabaseClient } from "./supabaseClient.js";

const columns = "id,meal_date,meal_type,recipe_id,display_text,insertion_order,created_at,updated_at";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const mealPeriods = { morning: "breakfast", afternoon: "lunch", evening: "dinner" };

function identity(value) {
  if (typeof value !== "string" || !uuid.test(value)) throw new Error("Invalid meal or Recipe identity.");
  return value;
}

export function validMealDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function nonblank(value) {
  if (typeof value !== "string" || !/\S/u.test(value)) throw new Error("Meal text is required.");
  return value;
}

function draftValues(draft) {
  if (!validMealDate(draft.meal_date)) throw new Error("Choose a valid meal date.");
  if (!Object.values(mealPeriods).includes(draft.meal_type)) throw new Error("Choose Breakfast, Lunch or Dinner.");
  return { id: identity(draft.id), meal_date: draft.meal_date, meal_type: draft.meal_type,
    recipe_id: draft.recipe_id === null ? null : identity(draft.recipe_id),
    display_text: draft.recipe_id === null ? nonblank(draft.display_text) : "" };
}

async function result(request, operation) {
  const response = await request;
  if (response.error) throw new Error(`${operation} was not confirmed. ${response.error.message || "Database request rejected."}`);
  return response.data;
}

export function sortMealEntries(entries) {
  const position = (row) => {
    const value = row.insertion_order;
    if ((typeof value === "number" && !Number.isSafeInteger(value))
      || !/^[1-9]\d*$/.test(String(value))) throw new Error("Invalid meal insertion order; reload Planner.");
    return BigInt(value);
  };
  entries.forEach(position);
  return [...entries].sort((a, b) => position(a) < position(b) ? -1 : position(a) > position(b) ? 1 : a.id.localeCompare(b.id));
}

export function createMealPlannerService(clientProvider = getSupabaseClient) {
  const table = () => clientProvider().from("meals_planner_entries");
  const get = (id) => result(table().select(columns).eq("id", identity(id)).maybeSingle(), "Load meal");
  async function list() {
    const all = [];
    let cursor = null, total;
    for (;;) {
      let query = table().select(columns, cursor ? undefined : { count: "exact" }).order("id").limit(500);
      if (cursor) query = query.gt("id", cursor);
      const response = await query;
      const page = await result(Promise.resolve(response), "Load meals");
      if (!cursor) {
        total = response.count;
        if (!Number.isInteger(total) || total < 0) throw new Error("Meal count unavailable; retry loading.");
      }
      if (!Array.isArray(page)) throw new Error("Invalid meal response; retry loading.");
      if (!page.length) {
        if (all.length !== total) throw new Error("Meals changed during loading; retry for a complete list.");
        return sortMealEntries(all);
      }
      for (const row of page) {
        identity(row.id);
        if (cursor && row.id <= cursor) throw new Error("Meal pagination did not advance.");
        if (!validMealDate(row.meal_date) || !Object.values(mealPeriods).includes(row.meal_type)) {
          throw new Error("Invalid persisted meal date/type; reload Planner.");
        }
        cursor = row.id;
        all.push(row);
      }
    }
  }
  async function create(draft) {
    const values = draftValues(draft);
    const matches = (row) => row.meal_date === values.meal_date && row.meal_type === values.meal_type
      && row.recipe_id === values.recipe_id && (values.recipe_id !== null || row.display_text === values.display_text);
    const existing = await get(values.id);
    if (existing) {
      if (matches(existing)) return existing;
      throw new Error("Meal identity already has different content. Reload before starting another addition.");
    }
    await result(table().insert(values), "Add meal");
    const saved = await get(values.id);
    if (!saved || !matches(saved)) throw new Error("Meal addition could not be verified. Retry the same addition.");
    return saved;
  }
  async function edit(entry, text) {
    identity(entry.id); nonblank(text);
    const live = await get(entry.id);
    if (!live || live.recipe_id !== null) throw new Error("Meal is missing or still Recipe-linked. Reload Planner.");
    if (live.display_text === text) return live;
    if (live.updated_at !== entry.updated_at) throw new Error("Meal changed in another session. Reload before editing.");
    const saved = await result(table().update({ display_text: text }).eq("id", entry.id)
      .eq("updated_at", entry.updated_at).select(columns).maybeSingle(), "Edit meal");
    if (!saved || saved.display_text !== text) throw new Error("Meal changed while saving. Reload before editing.");
    return saved;
  }
  async function remove(entry) {
    const live = await get(entry.id);
    if (!live) return;
    if (live.updated_at !== entry.updated_at) throw new Error("Meal changed in another session. Reload before removing.");
    const deleted = await result(table().delete().eq("id", identity(entry.id))
      .eq("updated_at", entry.updated_at).select("id"), "Remove meal");
    if (!Array.isArray(deleted) || deleted.length !== 1) throw new Error("Meal removal was not confirmed. Reload Planner.");
  }
  return { list, create, edit, remove };
}
