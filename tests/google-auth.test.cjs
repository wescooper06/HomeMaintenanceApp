const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "src", "services", "googleAuth.js"), "utf8")
  .split("export const googleAuth =")[0].replace(/^export /gm, "");
const { createGoogleAuth, GOOGLE_SCOPES } = vm.runInNewContext(
  `(() => { ${source}; return { createGoogleAuth, GOOGLE_SCOPES }; })()`
);
const storage = () => {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key) };
};
function fixture(clientId = "fixture-client") {
  const requests = [];
  let callback;
  const root = {
    localStorage: storage(), sessionStorage: storage(), setTimeout, clearTimeout,
    google: { accounts: { oauth2: {
      initTokenClient(config) {
        callback = config.callback;
        return { requestAccessToken(options) { requests.push({ ...config, ...options }); } };
      },
      revoke: (_token, done) => done({}),
    } } },
  };
  const auth = createGoogleAuth({ root, clientId, now: () => 100000 });
  const grant = (overrides = {}) => callback({
    access_token: "fixture-token", expires_in: 3600,
    scope: `${GOOGLE_SCOPES.calendarRead} ${GOOGLE_SCOPES.calendarEvents}`, ...overrides,
  });
  return { auth, root, requests, grant };
}

test("mount-time authentication requires an explicit Connect action and never opens a popup", async () => {
  const { auth, requests } = fixture();
  await assert.rejects(auth.ensureAuthenticated(), /Connect Google Calendar/);
  assert.equal(requests.length, 0);
});

test("explicit sign-in grants Calendar scopes and reuses the token without a global Auth", async () => {
  const { auth, root, requests, grant } = fixture();
  const pending = auth.signIn();
  await new Promise(setImmediate);
  grant();
  assert.equal(await pending, "fixture-token");
  assert.equal(await auth.ensureAuthenticated(), "fixture-token");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].client_id, "fixture-client");
  assert.equal(requests[0].prompt, "consent");
  assert(!requests[0].scope.includes("spreadsheets"));
  assert.equal(root.Auth, undefined);
});

test("only modern Calendar tokens with explicit granted scopes authorize access", async () => {
  const { auth, root } = fixture();
  root.localStorage.setItem("hm_google_access_token", "historical-token");
  root.localStorage.setItem("hm_google_access_token_expires_at", "500000");
  assert.equal(auth.getToken(), "");
  root.localStorage.setItem("life_manager_calendar_token", "modern-token");
  root.localStorage.setItem("life_manager_calendar_token_expires_at", "500000");
  assert.equal(auth.getToken(), "", "Missing scope tracking never implies Calendar authorization");
  root.localStorage.setItem("life_manager_calendar_token_scopes",
    `${GOOGLE_SCOPES.calendarRead} ${GOOGLE_SCOPES.calendarEvents}`);
  assert.equal(await auth.ensureAuthenticated(), "modern-token");
});

test("expired and Sheets-only tokens cannot authorize Calendar access", async () => {
  const { auth, root } = fixture();
  root.localStorage.setItem("life_manager_calendar_token", "old-token");
  root.localStorage.setItem("life_manager_calendar_token_expires_at", "129999");
  assert.equal(auth.getToken(), "");
  root.localStorage.setItem("life_manager_calendar_token", "sheets-token");
  root.localStorage.setItem("life_manager_calendar_token_expires_at", "500000");
  root.localStorage.setItem("life_manager_calendar_token_scopes", "https://www.googleapis.com/auth/spreadsheets");
  await assert.rejects(auth.ensureAuthenticated(), /Connect Google Calendar/);
});

test("denied scopes, invalid expiry, and popup errors reject explicitly", async () => {
  for (const response of [{ scope: "https://www.googleapis.com/auth/spreadsheets" }, { expires_in: 0 }, { error: "access_denied" }]) {
    const { auth, grant } = fixture();
    const pending = auth.signIn();
    await new Promise(setImmediate);
    grant(response);
    await assert.rejects(pending);
    assert.equal(auth.getToken(), "");
  }
  const { auth, requests } = fixture();
  const pending = auth.signIn();
  await new Promise(setImmediate);
  requests[0].error_callback({ type: "popup_closed" });
  await assert.rejects(pending, /popup_closed/);
});

test("missing client configuration reports an actionable error", async () => {
  await assert.rejects(fixture("").auth.signIn(), /VITE_GOOGLE_CLIENT_ID/);
});

test("sign-out clears modern credentials and revokes Google access", async () => {
  const { auth, root } = fixture();
  let revoked;
  root.google.accounts.oauth2.revoke = (token, done) => { revoked = token; done({}); };
  for (const target of ["localStorage", "sessionStorage"]) {
    root[target].setItem("life_manager_calendar_token", "old-token");
    root[target].setItem("life_manager_calendar_token_expires_at", "500000");
  }
  await auth.signOut();
  assert.equal(auth.getToken(), "");
  assert.equal(revoked, "old-token");
});

test("concurrent sign-in requests share a popup and sign-out cannot resurrect a token", async () => {
  const { auth, requests, grant } = fixture();
  const first = auth.signIn();
  const second = auth.signIn();
  await new Promise(setImmediate);
  assert.equal(requests.length, 1);
  await auth.signOut();
  grant();
  await assert.rejects(first, /cancelled by sign-out/);
  await assert.rejects(second, /cancelled by sign-out/);
  assert.equal(auth.getToken(), "");
});
