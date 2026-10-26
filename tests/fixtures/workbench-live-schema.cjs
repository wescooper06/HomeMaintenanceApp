const fs = require("node:fs");
const path = require("node:path");

const fixture = fs.readFileSync(path.join(__dirname, "workbench-schema.sql"), "utf8");
const [schema, plannerSchema] = fixture.split("-- MODERN PLANNER FIXTURE");
if (!schema || !plannerSchema) throw new Error("Workbench test schema sections are required.");
const kinds = ["home", "vehicle", "repeating", "misc"];

module.exports = { schema, plannerSchema, kinds };
