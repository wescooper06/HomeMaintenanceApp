import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const NAV_DIRECTORY = fileURLToPath(new URL("../www/components/nav/", import.meta.url));
const NAV_CONTENT_TYPES = {
  "nav.html": "text/html; charset=utf-8",
  "nav.css": "text/css; charset=utf-8",
  "nav.js": "text/javascript; charset=utf-8",
};

export function sharedNavPlugin() {
  return {
    name: "homemaintenance-shared-nav",
    configureServer(server) {
      server.middlewares.use("/components/nav", (request, response, next) => {
        const fileName = basename(new URL(request.url || "/", "http://localhost").pathname);
        const contentType = NAV_CONTENT_TYPES[fileName];
        if (!contentType) {
          next();
          return;
        }

        readFile(join(NAV_DIRECTORY, fileName))
          .then((content) => {
            response.statusCode = 200;
            response.setHeader("Content-Type", contentType);
            response.setHeader("Cache-Control", "no-store");
            response.end(content);
          })
          .catch(next);
      });
    },
  };
}