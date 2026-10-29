import { getSupabaseClient } from "./supabaseClient.js";

const recipeColumns = "id,title,source,category_id,cuisine_id,favorite,ingredient_sections,instructions,created_at,updated_at";
const lookupColumns = "id,name,created_at,updated_at";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireId(id) {
  if (typeof id !== "string" || !uuid.test(id)) throw new Error("Invalid Recipe or classification ID.");
  return id;
}

function recipeValues(value) {
  if (!value || typeof value.title !== "string" || !/\S/u.test(value.title)) {
    throw new Error("Recipe Title is required.");
  }
  for (const field of ["source", "instructions"]) {
    if (typeof value[field] !== "string") throw new Error(`Recipe ${field} must be text.`);
  }
  if (typeof value.favorite !== "boolean" || !Array.isArray(value.ingredient_sections)
    || value.ingredient_sections.some((section) => !section
      || Object.keys(section).sort().join(",") !== "name,text"
      || typeof section.name !== "string" || typeof section.text !== "string")) {
    throw new Error("Invalid Recipe Favorite or ingredient sections.");
  }
  return {
    title: value.title, source: value.source, instructions: value.instructions,
    category_id: value.category_id === null ? null : requireId(value.category_id),
    cuisine_id: value.cuisine_id === null ? null : requireId(value.cuisine_id),
    favorite: value.favorite,
    ingredient_sections: value.ingredient_sections.map(({ name, text }) => ({ name, text })),
  };
}

async function result(request, operation) {
  const { data, error } = await request;
  if (error) {
    const hint = error.code === "23503" ? " This value is still referenced by a Recipe; remove its references first."
      : error.code === "23505" ? " That name or ID already exists." : "";
    throw new Error(`${operation} failed.${hint} ${error.message || "Database request rejected."}`);
  }
  return data;
}

export function newRecipe(id = globalThis.crypto.randomUUID()) {
  return { id, title: "", source: "", category_id: null, cuisine_id: null, favorite: false,
    ingredient_sections: [{ name: "Ingredients", text: "" }], instructions: "" };
}

export function createRecipeService(clientProvider = getSupabaseClient) {
  const table = (name) => clientProvider().from(name);
  async function complete(name, columns) {
    const all = [];
    let cursor = null;
    let expectedCount = null;
    for (;;) {
      let query = table(name).select(columns, cursor ? undefined : { count: "exact" })
        .order("id", { ascending: true }).limit(500);
      if (cursor) query = query.gt("id", cursor);
      const response = await query;
      const page = await result(Promise.resolve(response), "Load Recipes/classifications");
      if (!cursor) {
        expectedCount = response.count;
        if (!Number.isInteger(expectedCount) || expectedCount < 0) throw new Error("Recipe total count is unavailable; retry loading.");
      }
      if (!Array.isArray(page)) throw new Error("Database returned an invalid Recipe page.");
      if (!page.length) {
        if (all.length !== expectedCount) throw new Error("Recipes changed during loading; retry for a complete library.");
        return all;
      }
      for (const row of page) {
        requireId(row.id);
        if (cursor && row.id <= cursor) throw new Error("Recipe pagination did not advance in stable ID order.");
        cursor = row.id;
        all.push(row);
      }
    }
  }
  async function get(id) {
    return result(table("meals_recipes").select(recipeColumns).eq("id", requireId(id)).maybeSingle(), "Load Recipe");
  }
  function lookup(kind) {
    if (!["categories", "cuisines"].includes(kind)) throw new Error("Unknown Recipe classification.");
    const name = `meals_recipe_${kind}`;
    function canonical(text) {
      if (typeof text !== "string" || !text.trim()) throw new Error("Classification name is required.");
      return text.trim();
    }
    return {
      list: () => complete(name, lookupColumns),
      create: async (text) => result(table(name).insert({ name: canonical(text) }).select(lookupColumns).single(), "Create classification"),
      rename: async (id, text) => result(table(name).update({ name: canonical(text) }).eq("id", requireId(id)).select(lookupColumns).single(), "Rename classification"),
      remove: async (id) => {
        const rows = await result(table(name).delete().eq("id", requireId(id)).select("id"), "Delete classification");
        if (rows?.length !== 1) throw new Error("Classification was not deleted; reload and retry.");
      },
    };
  }
  const operations = {
    list: () => complete("meals_recipes", recipeColumns),
    get,
    create: async (draft) => {
      const id = requireId(draft.id);
      const values = recipeValues(draft);
      // Reconcile an uncertain previous INSERT using the editor's stable retry identity.
      const existing = await get(id);
      if (existing) {
        if (JSON.stringify(recipeValues(existing)) === JSON.stringify(values)) return existing;
        throw new Error("Recipe ID already exists with different content. Reload before saving.");
      }
      return result(table("meals_recipes").insert({ id, ...values }).select(recipeColumns).single(), "Save new Recipe");
    },
    update: async (id, draft) => result(table("meals_recipes").update(recipeValues(draft))
      .eq("id", requireId(id)).select(recipeColumns).single(), "Save Recipe"),
    favorite: async (id, favorite) => {
      if (typeof favorite !== "boolean") throw new Error("Favorite must be true or false.");
      return result(table("meals_recipes").update({ favorite }).eq("id", requireId(id))
        .select(recipeColumns).single(), "Change Favorite");
    },
    remove: async (ids) => {
      if (!Array.isArray(ids) || !ids.length) throw new Error("Select at least one Recipe to delete.");
      const unique = [...new Set(ids.map(requireId))];
      const response = await table("meals_recipes").delete({ count: "exact" }).in("id", unique).select("id");
      const deleted = await result(Promise.resolve(response), "Delete Recipes");
      if (!Array.isArray(deleted) || response.count !== unique.length
        || new Set(deleted.map((row) => row.id)).size !== deleted.length
        || deleted.some((row) => !unique.includes(row.id))) {
        throw new Error("Deletion was not confirmed for every selected Recipe. Reload the library before retrying.");
      }
      // RETURNING data can be capped; the exact count covers the entire ID-filtered statement.
      return unique;
    },
    categories: lookup("categories"),
    cuisines: lookup("cuisines"),
  };
  let pending = Promise.resolve();
  function serialize(operation) {
    return (...args) => {
      const request = pending.then(() => operation(...args));
      // Keep later requests usable after a failure; the caller still receives the rejected request.
      pending = request.then(() => undefined, () => undefined);
      return request;
    };
  }
  return Object.fromEntries(Object.entries(operations).map(([key, operation]) => [
    key, typeof operation === "function" ? serialize(operation)
      : Object.fromEntries(Object.entries(operation).map(([name, method]) => [name, serialize(method)])),
  ]));
}

export function recipeMatches(recipe, { search = "", category = "", cuisine = "", favorites = false }) {
  const term = search.toLowerCase();
  return (!term || recipe.title.toLowerCase().includes(term)
    || recipe.ingredient_sections.some((section) => section.text.toLowerCase().includes(term)))
    && (!category || recipe.category_id === category)
    && (!cuisine || recipe.cuisine_id === cuisine)
    && (!favorites || recipe.favorite);
}

export function sortRecipes(recipes, key, direction, categories, cuisines) {
  const names = { category: new Map(categories.map((v) => [v.id, v.name])),
    cuisine: new Map(cuisines.map((v) => [v.id, v.name])) };
  const text = (recipe) => key === "category" ? names.category.get(recipe.category_id) || ""
    : key === "cuisine" ? names.cuisine.get(recipe.cuisine_id) || "" : recipe[key];
  return [...recipes].sort((a, b) => direction * text(a).localeCompare(text(b), undefined, { sensitivity: "base" })
    || a.id.localeCompare(b.id));
}

export function recipeSourceUrl(source) {
  try {
    const url = new URL(source);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
