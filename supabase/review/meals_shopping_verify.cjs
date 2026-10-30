const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function canonical(value) {
  if (Array.isArray(value)) {
    return value.map(canonical).sort((a, b) => {
      const left = JSON.stringify(a), right = JSON.stringify(b);
      return left < right ? -1 : left > right ? 1 : 0;
    });
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function hash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

function contract(catalog) {
  return Object.fromEntries(Object.keys(catalog).sort().map((key) => [key, hash(catalog[key])]));
}

function verifyPostflight(catalog) {
  const expected = JSON.parse(fs.readFileSync(path.join(__dirname, "meals_shopping_expected_catalog.json"), "utf8"));
  assert.deepEqual(catalog.counts, {
    tables: 2, indexes: 5, policies: 8, triggers: 3, functions: 1, predefined: 28, custom: 0, items: 0,
  }, "Shopping inventory/count mismatch");
  const actual = contract(catalog);
  assert.deepEqual(Object.keys(actual), Object.keys(expected.fields), "Unexpected/missing postflight fields");
  for (const [field, fingerprint] of Object.entries(expected.fields)) {
    assert.equal(actual[field], fingerprint, `Exact catalog mismatch: ${field}; STOP, do not bless drift`);
  }
}

function verifyCleanup(cleanup) {
  assert.deepEqual(cleanup, {
    executor: "postgres", verification_items: 0, verification_categories: 0,
    items: 0, custom: 0, predefined: 28, pass: true,
  }, "Rollback cleanup mismatch");
}

function verifyAuthorization(result) {
  for (const key of ["owner_crud", "anonymous_denied", "nonowner_denied", "null_subject_denied",
    "invalid_subject_denied", "internal_execute_denied"]) {
    assert.equal(result[key], true, `Authorization assertion missing: ${key}`);
  }
  assert.equal(result.scope, "SQL roles and deployed auth.uid()/RLS, not HTTP/JWT validation");
  assert.equal(result.rollback_still_required, true);
}

function verifySnapshot(snapshot) {
  assert.equal(snapshot.contract_version, 2, "Generic preservation contract version required");
  assert.equal(snapshot.executor, "postgres");
  assert.equal(snapshot.read_only, "on");
  assert.equal(snapshot.recipe_tables_present, true, "Three Recipe tables required");
  assert(snapshot.auth_uid, "Deployed auth.uid() definition required");
  assert.deepEqual(snapshot.uncovered, [], "Uncovered catalog objects; STOP");
  for (const [inventory, fingerprints, kind] of [
    ["inventory", "objects", "relation"], ["function_inventory", "functions", "function"], ["type_inventory", "types", "type"],
  ]) {
    assert(Array.isArray(snapshot[inventory]) && Array.isArray(snapshot[fingerprints]) && Array.isArray(snapshot.exclusions));
    const discovered = new Map(snapshot[inventory].map((object) => [objectKey(object), object]));
    assert.equal(discovered.size, snapshot[inventory].length, `Duplicate ${kind} inventory identity`);
    const included = new Set(snapshot[fingerprints].map((object) => objectKey(object)));
    assert.equal(included.size, snapshot[fingerprints].length, `Duplicate ${kind} fingerprint identity`);
    const excluded = snapshot.exclusions.filter((object) => object.class === kind);
    for (const object of excluded) {
      assert(isIntendedShopping(object, kind), `Unjustified exclusion: ${kind} ${objectKey(object)}`);
      const key = objectKey(object, kind === "function");
      assert(discovered.has(key) && !included.has(key), `Invalid excluded object: ${kind} ${key}`);
    }
    const covered = [...included, ...excluded.map((object) => objectKey(object, kind === "function"))].sort();
    assert.deepEqual(covered, [...discovered.keys()].sort(), `Missing/unexpected ${kind} fingerprints: ${
      [...discovered.keys()].filter((key) => !covered.includes(key)).join(", ")}`);
    for (const object of snapshot[fingerprints]) {
      assert.match(object.catalog_sha256, /^[a-f0-9]{64}$/, `Missing ${kind} catalog hash: ${objectKey(object)}`);
      assert(object.catalog, `Missing ${kind} catalog: ${objectKey(object)}`);
      if (kind === "relation") {
        assert.equal(object.kind, discovered.get(objectKey(object)).kind);
      }
    }
  }
  for (const object of snapshot.objects) {
    assert(["r", "p", "v", "m", "S", "i", "I", "c"].includes(object.kind), `Unsupported relation: ${objectKey(object)}`);
    if (["r", "p", "m", "S"].includes(object.kind)) {
      assert.match(object.data?.rows ?? "", /^\d+$/);
      assert.match(object.data?.sha256 ?? "", /^[a-f0-9]{64}$/);
    } else assert.equal(object.data, null);
  }
}

function objectKey(object, withIdentity = Object.hasOwn(object, "identity")) {
  return `${JSON.stringify([object.schema, object.name])}${withIdentity ? `(${object.identity})` : ""}`;
}

const shoppingRelations = {
  meals_shopping_categories: "r", meals_shopping_items: "r", meals_shopping_categories_pkey: "i",
  meals_shopping_items_pkey: "i", meals_shopping_categories_predefined_order_key: "i",
  meals_shopping_categories_name_key: "i", meals_shopping_items_category_id_idx: "i",
};
const shoppingTypes = ["meals_shopping_categories", "_meals_shopping_categories",
  "meals_shopping_items", "_meals_shopping_items"];
function isIntendedShopping(object, kind) {
  if (object.schema !== "public") return false;
  if (kind === "relation") return shoppingRelations[object.name] === (object.kind ?? object.identity);
  if (kind === "function") return object.name === "meals_shopping_before_write" && object.identity === "";
  return shoppingTypes.includes(object.name);
}

function preservationDifferences(before, after) {
  const differences = [];
  for (const [field, label] of [["objects", "relation"], ["functions", "function"], ["types", "type"]]) {
    const first = new Map(before[field].map((object) => [objectKey(object), object]));
    const last = new Map(after[field].map((object) => [objectKey(object), object]));
    for (const [name, object] of first) {
      const actual = last.get(name);
      if (!actual) { differences.push(`Missing ${label}: ${name}`); continue; }
      if (object.catalog_sha256 !== actual.catalog_sha256 || hash(object.catalog) !== hash(actual.catalog)) {
        differences.push(`Changed ${label} catalog fingerprint: ${name}`);
      }
      if (object.data?.rows !== actual.data?.rows) differences.push(`Changed row count: ${name}`);
      if (object.data?.sha256 !== actual.data?.sha256) differences.push(`Changed row fingerprint: ${name}`);
    }
    for (const name of last.keys()) if (!first.has(name)) differences.push(`Unexpected ${label}: ${name}`);
  }
  for (const field of ["scope", "auth_uid", "schemas", "default_acl"]) {
    if (hash(before[field]) !== hash(after[field])) differences.push(`Changed shared catalog: ${field}`);
  }
  return differences;
}

function verifyPreservation(before, after) {
  verifySnapshot(before);
  verifySnapshot(after);
  assert.deepEqual(before.exclusions, [], "Baseline must precede all authorized Shopping objects");
  for (const [field, kind, expected] of [
    ["inventory", "relation", Object.keys(shoppingRelations)],
    ["function_inventory", "function", ["meals_shopping_before_write"]],
    ["type_inventory", "type", shoppingTypes],
  ]) {
    assert.deepEqual(after[field].filter((object) => isIntendedShopping(object, kind)).map((object) => object.name).sort(),
      [...expected].sort(), `Authorized Shopping ${kind} inventory mismatch; exact postflight also required`);
  }
  const differences = preservationDifferences(before, after);
  assert.equal(differences.length, 0, `Non-Shopping preservation mismatch:\n${differences.join("\n")}`);
}

function readResult(file, key) {
  let value = JSON.parse(fs.readFileSync(file, "utf8"));
  if (Array.isArray(value)) {
    assert.equal(value.length, 1, "Save exactly one SELECT result, not a truncated/multi-result export");
    value = value[0];
  }
  return value[key] ?? value;
}

if (require.main === module) {
  try {
    const [mode, first, second] = process.argv.slice(2);
    assert(first, "Usage: node meals_shopping_verify.cjs postflight|authorization|cleanup|snapshot file.json OR preservation before.json after.json");
    if (mode === "postflight") verifyPostflight(readResult(first, "verification"));
    else if (mode === "authorization") verifyAuthorization(readResult(first, "authorization"));
    else if (mode === "cleanup") verifyCleanup(readResult(first, "cleanup"));
    else if (mode === "snapshot") verifySnapshot(readResult(first, "preservation"));
    else if (mode === "preservation") {
      assert(second, "Both before and after snapshot files are required");
      verifyPreservation(readResult(first, "preservation"), readResult(second, "preservation"));
    } else throw new Error(`Unknown verification mode: ${mode}`);
    console.log(`PASS: ${mode}. No production connection was made by this offline comparator.`);
  } catch (error) {
    console.error(`STOP: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { canonical, contract, verifyPostflight, verifyCleanup, verifyAuthorization, verifySnapshot,
  verifyPreservation, preservationDifferences };
