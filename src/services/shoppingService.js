import { getSupabaseClient } from "./supabaseClient.js";

export const shoppingCategoryNames = [
  "Baking", "Beans, Grains & Rice", "Beverages & Water", "Bread & Bakery",
  "Breakfast & Cereal", "Canned Goods", "Cheese & Dairy", "Cleaning", "Coffee",
  "Condiments & Sauces", "Cookies, Chips & Snacks", "Deli", "Frozen Foods",
  "Health", "International", "Jams", "Juices", "Meat & Poultry", "Nuts",
  "Oil & Vinegar", "Produce", "Pasta", "Pet Food", "Seafood", "Soup",
  "Special Equipment", "Spices", "Wine & Spirits",
];

// First matching category wins; phrase boundaries avoid matches such as rice in licorice.
const categoryTerms = [
  ["Baking", ["flour", "baking powder", "baking soda", "yeast", "sugar"]],
  ["Beans, Grains & Rice", ["rice", "beans", "lentils", "quinoa", "barley"]],
  ["Beverages & Water", ["water", "soda", "tea"]],
  ["Bread & Bakery", ["bread", "bagel", "bagels", "tortilla", "tortillas"]],
  ["Breakfast & Cereal", ["cereal", "oats", "oatmeal", "granola"]],
  ["Canned Goods", ["canned", "tinned"]],
  ["Cheese & Dairy", ["milk", "butter", "cheese", "cream", "yogurt", "egg", "eggs"]],
  ["Cleaning", ["detergent", "dish soap", "bleach"]],
  ["Coffee", ["coffee", "espresso"]],
  ["Condiments & Sauces", ["ketchup", "mustard", "mayonnaise", "soy sauce", "hot sauce"]],
  ["Cookies, Chips & Snacks", ["cookies", "chips", "crackers", "popcorn"]],
  ["Deli", ["salami", "deli", "prosciutto"]],
  ["Frozen Foods", ["frozen"]],
  ["Health", ["vitamins", "bandages", "toothpaste"]],
  ["International", ["miso", "nori", "tahini"]],
  ["Jams", ["jam", "jelly", "marmalade"]],
  ["Juices", ["juice"]],
  ["Meat & Poultry", ["chicken", "beef", "pork", "turkey", "bacon", "lamb"]],
  ["Nuts", ["almonds", "walnuts", "peanuts", "cashews", "pecans"]],
  ["Oil & Vinegar", ["oil", "vinegar"]],
  ["Produce", ["onion", "onions", "garlic", "tomato", "tomatoes", "potato", "potatoes",
    "carrot", "carrots", "lemon", "lemons", "apple", "apples", "banana", "bananas",
    "spinach", "lettuce", "broccoli", "avocado", "avocados"]],
  ["Pasta", ["pasta", "spaghetti", "macaroni", "noodles"]],
  ["Pet Food", ["pet food", "dog food", "cat food"]],
  ["Seafood", ["salmon", "tuna", "shrimp", "cod", "fish"]],
  ["Soup", ["soup", "broth", "stock"]],
  ["Special Equipment", ["parchment", "skewers", "baking pan"]],
  ["Spices", ["salt", "pepper", "cumin", "paprika", "cinnamon", "oregano"]],
  ["Wine & Spirits", ["wine", "vodka", "whiskey", "rum", "gin"]],
];

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const itemColumns = "id,text,category_id,checked,created_at,updated_at";
const categoryColumns = "id,name,predefined_order,created_at,updated_at";

function failure(message, code = "VALIDATION") {
  const error = new Error(message);
  error.code = code;
  return error;
}
function id(value) {
  if (typeof value !== "string" || !uuid.test(value)) throw failure("Invalid Shopping identity.");
  return value;
}
function nonblank(value) {
  if (typeof value !== "string" || !value.trim()) throw failure("Enter nonblank text.");
  return value;
}

export function automaticShoppingCategory(text, categories) {
  const words = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ");
  const match = categoryTerms.find(([, terms]) => terms.some((term) => ` ${words} `.includes(` ${term} `)));
  return categories.find((category) => category.predefined_order !== null && category.name === match?.[0])?.id ?? null;
}

export function orderShoppingCategories(categories) {
  return [...categories].sort((a, b) => (a.predefined_order ?? 29) - (b.predefined_order ?? 29)
    || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

export function orderShoppingItems(items) {
  return [...items].sort((a, b) => Number(a.checked) - Number(b.checked)
    || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

export function shoppingError(error) {
  const code = error?.code;
  if (code === "VALIDATION" || code === "CONFLICT") return error.message;
  if (["42501", "PGRST301", "PGRST302"].includes(code)) return "Shopping change failed: access denied. Sign in as the owner and retry.";
  if (code === "23503") return "Shopping change failed: the category is in use or no longer available. Reload and retry.";
  if (code === "23505") return "Shopping change failed: that category name or identity already exists.";
  if (code === "23514" || code === "22023") return "Shopping change failed: a value is invalid. Check the entered text.";
  if (error instanceof TypeError || code === "NETWORK") return "Shopping request could not be confirmed because of a network failure. Retry the same action.";
  return "Shopping change could not be confirmed. Your current values are kept; retry or reload.";
}

export function createShoppingService(clientProvider = getSupabaseClient) {
  const table = (name) => clientProvider().from(`meals_shopping_${name}`);
  async function result(query) {
    let response;
    try { response = await query; } catch (error) {
      if (error instanceof TypeError) throw failure("Network request failed.", "NETWORK");
      throw error;
    }
    if (response.error) {
      const { code, message } = response.error;
      throw failure(message || "Shopping request failed.", code || (response.status === 0 ? "NETWORK" : "UNKNOWN"));
    }
    return response;
  }
  async function complete(name, columns) {
    const all = [];
    let cursor = null, total;
    for (;;) {
      let query = table(name).select(columns, cursor ? undefined : { count: "exact" })
        .order("id", { ascending: true }).limit(500);
      if (cursor) query = query.gt("id", cursor);
      const { data, count } = await result(query);
      if (!cursor) total = count;
      if (!Number.isInteger(total) || total < 0 || !Array.isArray(data)) throw failure("Shopping load was incomplete. Retry.", "CONFLICT");
      if (!data.length) {
        if (all.length !== total) throw failure("Shopping changed while loading. Retry.", "CONFLICT");
        return all;
      }
      for (const row of data) {
        id(row.id);
        if (cursor && row.id <= cursor) throw failure("Shopping pagination did not advance. Retry.", "CONFLICT");
        all.push(row);
        cursor = row.id;
      }
    }
  }
  async function insert(name, columns, values, fields) {
    const existing = (await result(table(name).select(columns).eq("id", id(values.id)).maybeSingle())).data;
    if (existing) {
      if (fields.every((field) => existing[field] === values[field])) return existing;
      throw failure("Shopping identity already has different values. Reload before retrying.", "CONFLICT");
    }
    return (await result(table(name).insert(values).select(columns).single())).data;
  }
  async function update(name, columns, key, values) {
    return (await result(table(name).update(values).eq("id", id(key)).select(columns).single())).data;
  }
  async function remove(name, apply, expected) {
    const response = await result(apply(table(name).delete({ count: "exact" })));
    if (!Number.isInteger(response.count) || response.count < 0
      || (expected !== undefined && response.count !== expected)) {
      throw failure("Shopping deletion was not confirmed. Reload before retrying.", "CONFLICT");
    }
  }
  return {
    load: async () => {
      const [items, categories] = await Promise.all([complete("items", itemColumns), complete("categories", categoryColumns)]);
      return { items, categories };
    },
    add: async (draft) => insert("items", itemColumns, {
      id: id(draft.id), text: nonblank(draft.text),
      category_id: draft.category_id === null ? null : id(draft.category_id), checked: false,
    }, ["text", "category_id", "checked"]),
    edit: (key, text) => update("items", itemColumns, key, { text: nonblank(text) }),
    categorize: (key, category) => update("items", itemColumns, key, { category_id: category === null ? null : id(category) }),
    check: (key, checked) => {
      if (typeof checked !== "boolean") throw failure("Checked must be true or false.");
      return update("items", itemColumns, key, { checked });
    },
    remove: (key) => remove("items", (query) => query.eq("id", id(key)), 1),
    clearChecked: () => remove("items", (query) => query.eq("checked", true)),
    clearList: () => remove("items", (query) => query.not("id", "is", null)),
    createCategory: (draft) => insert("categories", categoryColumns,
      { id: id(draft.id), name: nonblank(draft.name).trim() }, ["name"]),
    renameCategory: (key, name) => update("categories", categoryColumns, key, { name: nonblank(name).trim() }),
    removeCategory: (key) => remove("categories", (query) => query.eq("id", id(key)), 1),
  };
}
