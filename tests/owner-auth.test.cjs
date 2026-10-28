const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "src", "services", "ownerAuthService.js"), "utf8");
const { createOwnerAuthController } = vm.runInNewContext(`(() => {
  ${source.replace(/^export /gm, "")}
  return { createOwnerAuthController };
})()`, { Date, setTimeout, clearTimeout, Promise });
const owner = "11111111-1111-4111-8111-111111111111";
const wrong = "22222222-2222-4222-8222-222222222222";
const session = { access_token: "synthetic-token", expires_at: 100 };
test("both production builds share the exact public owner UUID without overriding Supabase client configuration", () => {
  const config = fs.readFileSync(path.join(root, "trips", ".env.production"), "utf8").trim();
  assert.equal(config, "VITE_OWNER_AUTH_USER_ID=e72bccd9-ec2b-4822-bb5c-b7c1f39dcf60");
  const standalone = fs.readFileSync(path.join(root, "trips", "activity-planner.vite.config.js"), "utf8");
  assert.match(standalone, /envDir: location\("\.\/"\)/);
});
function fixture({ user = owner, saved = session, invalid = false } = {}) {
  let event, expire, resolveUser, now = 0;
  const calls = [];
  const client = { auth: {
    onAuthStateChange(callback) {
      event = callback;
      return { data: { subscription: { unsubscribe() { calls.push("unsubscribe"); } } } };
    },
    getSession: async () => ({ data: { session: saved }, error: null }),
    async getUser() {
      calls.push("getUser");
      if (resolveUser) return new Promise((resolve) => { resolveUser.value = resolve; });
      return { data: { user: { id: user } }, error: invalid ? Error("SECRET_SENTINEL") : null };
    },
    async signInWithPassword() {
      calls.push("password-login");
      return { data: { session }, error: null };
    },
    async signOut(options) { calls.push(options.scope); return { error: null }; },
  } };
  const controller = createOwnerAuthController(client, owner, {
    now: () => now, setTimeout: (callback) => { expire = callback; return 1; }, clearTimeout() {},
  });
  return { controller, client, calls, emit: (...args) => event(...args),
    expire() { now = 100000; expire(); },
    defer() { resolveUser = {}; return resolveUser; } };
}
test("no session does not unlock private children or make any user/data request", async () => {
  const f = fixture({ saved: null });
  await f.controller.start();
  assert.equal(f.controller.getSnapshot().status, "signed-out");
  assert.deepEqual(f.calls, []);
  f.controller.stop();
});
test("only server-validated designated owner unlocks the application", async () => {
  for (const [user, invalid, expected] of [[owner, false, "owner"], [wrong, false, "signed-out"], [owner, true, "signed-out"]]) {
    const f = fixture({ user, invalid });
    await f.controller.start();
    assert.equal(f.controller.getSnapshot().status, expected);
    assert(!JSON.stringify(f.controller.getSnapshot()).includes("SECRET_SENTINEL"));
    f.controller.stop();
  }
});
test("expiry, logout, and invalid refresh unmount application access; Google auth is untouched", async () => {
  const f = fixture();
  await f.controller.start();
  f.expire();
  assert.equal(f.controller.getSnapshot().status, "signed-out");
  await f.controller.signIn("synthetic@example.test", "synthetic-password");
  assert.equal(f.controller.getSnapshot().status, "signed-out", "expired sessions cannot reopen");
  await f.controller.signOut();
  f.emit("TOKEN_REFRESHED", session);
  await Promise.resolve();
  assert.equal(f.controller.getSnapshot().status, "signed-out");
  assert(f.calls.includes("local"));
  assert(!source.includes("googleAuth"));
  f.controller.stop();
});
test("logout invalidates an in-flight user validation and scheduled notification", async () => {
  const f = fixture();
  await f.controller.start();
  const deferred = f.defer();
  f.emit("TOKEN_REFRESHED", session);
  await Promise.resolve();
  await f.controller.signOut();
  deferred.value({ data: { user: { id: owner } }, error: null });
  await Promise.resolve();
  assert.equal(f.controller.getSnapshot().status, "signed-out");
  f.controller.stop();
});
test("normal password login and refreshed owner session are accepted without credential state", async () => {
  const f = fixture({ saved: null });
  await f.controller.start();
  await f.controller.signIn("synthetic@example.test", "synthetic-password");
  assert.equal(f.controller.getSnapshot().status, "owner");
  f.emit("TOKEN_REFRESHED", session);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.controller.getSnapshot().status, "owner");
  assert(!JSON.stringify(f.controller.getSnapshot()).includes("synthetic"));
  f.controller.stop();
});
test("owner login preserves explicit private selections and otherwise defaults to Planner", async () => {
  const routes = fs.readFileSync(path.join(root, "src", "router", "lifeManagerRoutes.js"), "utf8");
  const { resolveLifeManagerRoute } = vm.runInNewContext(`(() => {
    ${routes.replace(/^export /gm, "")}
    return { resolveLifeManagerRoute };
  })()`);
  for (const hash of ["", "#planner", "#trips", "#calendar", "#workbench", "#dashboard"]) {
    const f = fixture({ saved: null });
    const location = { pathname: "/index.html", hash };
    const privatePage = () => f.controller.getSnapshot().status === "owner"
      ? resolveLifeManagerRoute(location) : "owner-login";
    await f.controller.start();
    assert.equal(privatePage(), "owner-login");
    await f.controller.signIn("synthetic@example.test", "synthetic");
    assert.equal(privatePage(), hash.slice(1) || "planner");
    f.controller.stop();
    await f.controller.start();
    // This fixture has no persisted session: a reload remains gated until login.
    assert.equal(privatePage(), "owner-login");
    await f.controller.signIn("synthetic@example.test", "synthetic");
    assert.equal(privatePage(), hash.slice(1) || "planner");
    await f.controller.signOut();
    assert.equal(privatePage(), "owner-login");
    f.controller.stop();
  }
});
test("both browser entry points gate route mounting and sign-out is exposed", () => {
  for (const file of ["src\\router\\LifeManagerRouter.jsx", "src\\activity-planner\\main.jsx"]) {
    const entry = fs.readFileSync(path.join(root, file), "utf8");
    assert.match(entry, /<OwnerAuthBoundary>[\s\S]*<BrowserRouter/);
  }
  const boundary = fs.readFileSync(path.join(root, "src\\components\\OwnerAuthBoundary.jsx"), "utf8");
  assert.match(boundary, /session.status === "owner"/);
  assert.match(boundary, /controller.signOut/);
  assert.match(boundary, /setPassword\(""\)/);
});
test("StrictMode stop/start and later sign-out suppress stale validations", async () => {
  const f = fixture();
  const deferred = f.defer();
  const first = f.controller.start();
  await new Promise((resolve) => setImmediate(resolve));
  const oldResolve = deferred.value;
  f.controller.stop();
  const second = f.controller.start();
  await new Promise((resolve) => setImmediate(resolve));
  oldResolve({ data: { user: { id: owner } }, error: null });
  await first;
  assert.notEqual(f.controller.getSnapshot().status, "owner");
  deferred.value({ data: { user: { id: owner } }, error: null });
  await second;
  assert.equal(f.controller.getSnapshot().status, "owner");
  await f.controller.signOut();
  assert.equal(f.controller.getSnapshot().status, "signed-out");
  f.controller.stop();
});
test("rendered auth boundary mounts private children only after login and removes them on logout", async () => {
  const { transformWithOxc } = await import("../trips/node_modules/vite/dist/node/index.js");
  const filename = path.join(root, "src", "components", "OwnerAuthBoundary.jsx");
  const boundarySource = fs.readFileSync(filename, "utf8")
    .replace(/^import .*;\r?$/gm, "").replace("export default function", "function")
    .replace("import.meta.env?.VITE_OWNER_AUTH_USER_ID", JSON.stringify(owner));
  const { code } = await transformWithOxc(boundarySource, filename,
    { jsx: { runtime: "classic", pragma: "element", pragmaFrag: "Fragment" } });
  const f = fixture({ saved: null });
  const slots = [];
  let index, cleanup;
  const Boundary = vm.runInNewContext(`(() => { ${code}; return OwnerAuthBoundary; })()`, {
    createOwnerAuthController: () => f.controller, getSupabaseClient: () => ({}), Fragment: "fragment",
    useState(initial) {
      const slot = index++;
      if (!(slot in slots)) slots[slot] = typeof initial === "function" ? initial() : initial;
      return [slots[slot], (value) => { slots[slot] = value; }];
    },
    useEffect(effect) { if (!cleanup) cleanup = effect(); },
    element: (type, props, ...children) => ({ type, props, children }),
  });
  const render = () => { index = 0; return Boundary({ children: "PRIVATE_SENTINEL" }); };
  assert(!JSON.stringify(render()).includes("PRIVATE_SENTINEL"));
  await new Promise((resolve) => setImmediate(resolve));
  assert(JSON.stringify(render()).includes("Life Manager owner login"));
  await f.controller.signIn("synthetic@example.test", "synthetic");
  assert(JSON.stringify(render()).includes("PRIVATE_SENTINEL"));
  await f.controller.signOut();
  assert(!JSON.stringify(render()).includes("PRIVATE_SENTINEL"));
  cleanup();
});
test("default clock does not invoke browser native timers with a custom receiver", async () => {
  const nativeTimer = function () {
    assert.notEqual(typeof this?.now, "function", "Browser timer cannot receive the clock object as this");
    return 1;
  };
  const factory = vm.runInNewContext(`(() => {
    ${source.replace(/^export /gm, "")}
    return createOwnerAuthController;
  })()`, { Date, setTimeout: nativeTimer, clearTimeout: nativeTimer, Promise });
  const f = fixture({ saved: { ...session, expires_at: Math.floor(Date.now() / 1000) + 3600 } });
  const controller = factory(f.client, owner);
  await controller.start();
  assert.equal(controller.getSnapshot().status, "owner");
  await controller.signOut();
  controller.stop();
});
