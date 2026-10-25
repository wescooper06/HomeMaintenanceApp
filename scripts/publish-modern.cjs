const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const source = path.join(root, "dist", "trips");
const destination = path.join(root, "www", "trips");

if (!fs.readFileSync(path.join(source, "index.html"), "utf8").includes('id="root"')) {
  throw new Error("Build the modern React application before publishing.");
}
fs.mkdirSync(destination, { recursive: true });
// This directory is generated exclusively by the main Vite build.
fs.rmSync(path.join(destination, "assets"), { recursive: true, force: true });
fs.cpSync(source, destination, { recursive: true });
console.log("Published modern React output to www\\trips. No historical inputs were read.");
