const fs = require("node:fs");
const path = require("node:path");

const resultFolder = path.join(__dirname, "..", "..", "supabase", "review", "inspection-results");
const columns = fs.readFileSync(path.join(resultFolder,
  "supabasereviewinspection_queries02_columns.sql.csv"), "utf8").trim().split(/\r?\n/);
const header = columns.shift().split(",");
const liveColumns = columns.map((line) => {
  const values = line.split(",");
  if (values.length !== header.length) throw new Error("Live column CSV requires a full CSV parser.");
  return Object.fromEntries(header.map((key, index) => [key, values[index]]));
});
const viewCsv = fs.readFileSync(path.join(resultFolder,
  "supabasereviewinspection-queries09_projects_all_view.sql.csv"), "utf8").trim();
const quotedView = viewCsv.slice(viewCsv.indexOf("\n") + 1).trim();
if (!quotedView.startsWith('"') || !quotedView.endsWith('"')) throw new Error("Unexpected view CSV shape.");
const view = quotedView.slice(1, -1).replace(/""/g, '"');
const kinds = ["home", "vehicle", "repeating", "misc"];
const schema = kinds.map((kind) => {
  const definitions = liveColumns.filter((column) => column.table_name === `projects_${kind}`).map((column) =>
    `"${column.column_name}" ${column.data_type}`
      + (column.is_nullable === "NO" ? " not null" : "")
      + (column.column_default !== "null" ? ` default ${column.column_default}` : "")
      + (column.column_name === "id" ? " primary key" : ""));
  return `create table public.projects_${kind} (${definitions.join(",\n")});`;
}).join("\n") + `\ncreate view public.projects_all as ${view}
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete, truncate, references, trigger
  on projects_home, projects_vehicle, projects_repeating, projects_misc, projects_all
  to anon, authenticated, service_role;`;

module.exports = { schema, kinds };
