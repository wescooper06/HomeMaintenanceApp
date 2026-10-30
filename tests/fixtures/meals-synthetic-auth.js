// Test-build-only Auth transport. Never imported by the application or production Vite configuration.
import { createMemoryMealPlannerClient, createMemoryWeeklyClient } from "../../tests/fixtures/meal-planner-memory-client.js";
import { createMemoryRecipeClient } from "../../tests/fixtures/recipe-memory-client.js";
import { createMemoryShoppingClient } from "../../tests/fixtures/shopping-memory-client.js";

const owner = "e72bccd9-ec2b-4822-bb5c-b7c1f39dcf60";
const other = "11111111-1111-4111-8111-111111111111";
const key = "meals-synthetic-test-user";
let listener;
const session = () => globalThis.sessionStorage.getItem(key) ? {
  access_token: "synthetic-only", expires_at: Math.floor(Date.now() / 1000) + 3600,
} : null;
const recipes = createMemoryRecipeClient();
const shopping = createMemoryShoppingClient();
const meals = createMemoryMealPlannerClient();
const weekly = createMemoryWeeklyClient();
globalThis.__mealPlannerTest = meals.control;
globalThis.__shoppingTest = shopping.control;
const client = { from: (name) => name === "meals_planner_entries" ? meals.from(name)
  : name.startsWith("meals_shopping_") ? shopping.from(name)
    : name.startsWith("meals_recipe") ? recipes.from(name) : weekly.from(name), auth: {
  onAuthStateChange(callback) {
    listener = callback;
    return { data: { subscription: { unsubscribe() { listener = undefined; } } } };
  },
  async getSession() { return { data: { session: session() }, error: null }; },
  async getUser() { return { data: { user: { id: globalThis.sessionStorage.getItem(key) } }, error: null }; },
  async signInWithPassword({ email }) {
    globalThis.sessionStorage.setItem(key, email === "non-owner@example.test" ? other : owner);
    listener?.("SIGNED_IN", session());
    return { data: { session: session() }, error: null };
  },
  async signOut() {
    globalThis.sessionStorage.removeItem(key);
    listener?.("SIGNED_OUT", null);
    return { error: null };
  },
} };
export function getSupabaseClient() { return client; }
