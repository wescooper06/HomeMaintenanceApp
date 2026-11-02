const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const projectReference = "tawvchmjtkgykwwvnnnn";
const supabaseUrl = `https://${projectReference}.supabase.co`;
const jwt = (payload) => `eyJ.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.fixture-signature`;
const validEnvironment = {
  VITE_SUPABASE_URL: supabaseUrl,
  VITE_SUPABASE_PUBLISHABLE_KEY: jwt({ role: "anon" }),
};

let assertProductionSupabaseConfig;
test.before(async () => {
  ({ assertProductionSupabaseConfig } = await import("../trips/supabaseBuildConfig.mjs"));
});

test("production Supabase build config rejects missing public URL or key", () => {
  assert.throws(() => assertProductionSupabaseConfig({}), /VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY/);
  assert.throws(() => assertProductionSupabaseConfig({ VITE_SUPABASE_URL: supabaseUrl }),
    /VITE_SUPABASE_PUBLISHABLE_KEY/);
});

test("production Supabase build config requires the approved HTTPS project", () => {
  assert.throws(() => assertProductionSupabaseConfig({
    ...validEnvironment, VITE_SUPABASE_URL: "https://other-project.supabase.co",
  }), /approved production Supabase project/);
  assert.throws(() => assertProductionSupabaseConfig({
    ...validEnvironment, VITE_SUPABASE_URL: `http://${projectReference}.supabase.co`,
  }), /approved production Supabase project/);
});

test("production Supabase build config accepts only public anon or publishable keys", () => {
  assert.doesNotThrow(() => assertProductionSupabaseConfig(validEnvironment));
  assert.doesNotThrow(() => assertProductionSupabaseConfig({
    ...validEnvironment, VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture-key",
  }));
  assert.throws(() => assertProductionSupabaseConfig({
    ...validEnvironment, VITE_SUPABASE_PUBLISHABLE_KEY: jwt({ role: "service_role" }),
  }), /public anon role/);
  assert.throws(() => assertProductionSupabaseConfig({
    ...validEnvironment, VITE_SUPABASE_PUBLISHABLE_KEY: "sb_secret_fixture-key",
  }), /must not contain a Supabase secret key/);
});

test("both production Vite builds validate config before bundling", () => {
  for (const file of ["trips/vite.config.js", "trips/activity-planner.vite.config.js"]) {
    const config = fs.readFileSync(path.join(root, file), "utf8");
    assert.match(config, /command === ["']build["'] && mode === ["']production["']/);
    assert.match(config, /assertProductionSupabaseConfig\(loadEnv\(mode, envDir, ["']["']\)\)/);
  }
});
