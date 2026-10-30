const fs = require("node:fs");
const http = require("node:http");
const { createRequire } = require("node:module");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.join(__dirname, "..");
const requireTrips = createRequire(path.join(root, "trips", "package.json"));
const prefix = "/HomeMaintenanceApp/www/trips/";

async function createMealsStaticFixture(port = 0, { syntheticAuth = false } = {}) {
  const vite = await import(pathToFileURL(requireTrips.resolve("vite")).href);
  const result = await vite.build({
    configFile: path.join(root, "trips", "vite.config.js"), root: path.join(root, "trips"),
    logLevel: "error", build: { write: false },
    plugins: syntheticAuth ? [{
      name: "meals-isolated-synthetic-auth",
      enforce: "pre",
      transform(_code, id) {
        if (id.replaceAll("\\", "/").endsWith("/src/services/supabaseClient.js")) {
          return fs.readFileSync(path.join(root, "tests", "fixtures", "meals-synthetic-auth.js"), "utf8");
        }
      },
    }] : [],
  });
  const output = (Array.isArray(result) ? result : [result]).flatMap((bundle) => bundle.output);
  const files = new Map(output.map((entry) => [entry.fileName, entry.type === "chunk" ? entry.code : entry.source]));
  const fallback = fs.readFileSync(path.join(root, "404.html"));
  const mime = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css",
    ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };
  const server = http.createServer((request, response) => {
    response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; form-action 'none'");
    const url = new URL(request.url, "http://localhost");
    if (url.pathname === prefix.slice(0, -1)) {
      response.writeHead(301, { Location: prefix + url.search });
      response.end();
      return;
    }
    const filename = url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) || "index.html" : null;
    if (filename && files.has(filename)) {
      response.writeHead(200, { "Content-Type": mime[path.extname(filename)] || "application/octet-stream", "Cache-Control": "no-store" });
      response.end(files.get(filename));
    } else {
      response.writeHead(404, { "Content-Type": "text/html", "Cache-Control": "no-store" });
      response.end(fallback);
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return { server, output, prefix, origin: `http://127.0.0.1:${server.address().port}` };
}

if (require.main === module) {
  createMealsStaticFixture(Number(process.argv[2] || 0), { syntheticAuth: process.argv.includes("--synthetic-auth") }).then(({ origin }) => {
    console.log(`Static production fixture ready: ${origin}${prefix}meals`);
  }).catch((error) => { console.error(error); process.exitCode = 1; });
}
module.exports = { createMealsStaticFixture };
