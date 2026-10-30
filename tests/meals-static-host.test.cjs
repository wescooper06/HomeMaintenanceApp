const assert = require("node:assert/strict");
const test = require("node:test");
const vm = require("node:vm");

const { createMealsStaticFixture } = require("../scripts/meals-static-fixture.cjs");

test("production build: real 404-only static host recovers every approved Meals deep link with valid assets and no broker/secret", async () => {
  const { server, output, prefix, origin } = await createMealsStaticFixture();
  try {
    const scripts = output.filter((entry) => entry.type === "chunk").map((entry) => entry.code).join("\n");
    for (const required of ["Loading Recipes...", "Phase 0A foundation preview", "/meals/recipes", "/meals/shopping",
      "e72bccd9-ec2b-4822-bb5c-b7c1f39dcf60"]) assert(scripts.includes(required), required);
    assert.doesNotMatch(scripts, /planner_curated_api|planner_broker_access_token_hook|c01098c9-ffa6-4134-a1ad-025a076e9855/);
    assert.doesNotMatch(scripts, /meals-synthetic-test-user|synthetic-local-token|synthetic-only|meals-recipe-synthetic-data|meals-recipe-test-control|__shoppingTest|__mealPlannerTest|meals-planner-synthetic-data|meals-weekly-synthetic-data/);
    assert.doesNotMatch(scripts, /sb_secret_[a-zA-Z0-9_-]{20,}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/);
    for (const jwt of scripts.matchAll(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g)) {
      const payload = JSON.parse(Buffer.from(jwt[0].split(".")[1], "base64url").toString());
      assert.notEqual(payload.role, "service_role");
    }
    const entry = await fetch(origin + prefix + "index.html");
    assert.equal(entry.status, 200);
    assert.match(entry.headers.get("content-security-policy"), /connect-src 'none'/);
    const planner = await fetch(origin + prefix.slice(0, -1) + "?mealDate=2026-11-02");
    assert.equal(planner.status, 200);
    assert.equal(new URL(planner.url).pathname, prefix);
    assert.equal(new URL(planner.url).searchParams.get("mealDate"), "2026-11-02");
    const html = await entry.text();
    const assets = [...html.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g)].map((match) => match[1]);
    assert(assets.some((asset) => asset.endsWith(".js")));
    assert(assets.some((asset) => asset.endsWith(".css")));
    for (const asset of assets) {
      const response = await fetch(new URL(asset, entry.url));
      assert.equal(response.status, 200, asset);
      assert.match(response.headers.get("content-type"), /javascript|css/);
    }
    for (const suffix of ["meals", "meals/recipes", "meals/recipes/new", "meals/recipes/test-id", "meals/shopping"]) {
      const direct = await fetch(origin + prefix + suffix + "?fixture=1");
      assert.equal(direct.status, 404, "Fixture must not supply a Vite/SPA fallback.");
      const fallback = (await direct.text()).match(/<script>([\s\S]*?)<\/script>/)[1];
      let destination;
      const location = new URL(direct.url);
      location.replace = (value) => { destination = value; };
      vm.runInNewContext(fallback, { window: { location }, encodeURIComponent });
      const boot = await fetch(new URL(destination, origin));
      assert.equal(boot.status, 200);
      assert.equal(new URL(boot.url).searchParams.get("__meals"), "/" + suffix + "?fixture=1");
    }
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
