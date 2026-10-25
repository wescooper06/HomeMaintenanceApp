import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const location = (path) => fileURLToPath(new URL(path, import.meta.url));
const require = createRequire(import.meta.url);

export default defineConfig(({ command }) => ({
  root: location("../src/activity-planner/"),
  envDir: location("./"),
  plugins: [react()],
  base: command === "serve" ? "/" : "./",
  resolve: {
    alias: [
      "react", "react/jsx-runtime", "react/jsx-dev-runtime",
      "react-dom", "react-dom/client", "react-router", "react-router/dom", "react-router-dom",
    ].map((name) => ({ find: new RegExp(`^${name}$`), replacement: require.resolve(name) })),
  },
  server: { port: 5174, strictPort: true },
  build: { outDir: location("../www/activity-planner/"), emptyOutDir: true },
}));