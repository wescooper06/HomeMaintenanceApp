import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import importX from "eslint-plugin-import-x";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";

const root = dirname(fileURLToPath(import.meta.url));
const requireTrips = createRequire(new URL("./trips/package.json", import.meta.url));
const reactVersion = requireTrips("react/package.json").version;
const browserFiles = ["src/**/*.{js,jsx}", "trips/src/**/*.{js,jsx}", "www/js/modern-entry.js"];
const nodeFiles = ["scripts/**/*.{js,cjs,mjs}", "tests/**/*.{js,cjs,mjs}",
  "*.{js,cjs,mjs}", "trips/*.{js,cjs,mjs}"];

export default defineConfig([
  globalIgnores([
    "**/node_modules/**", "**/dist/**", "**/build/**", "**/coverage/**",
    "android/**", "spec/**", "supabase/**",
    "www/**/*", "!www/js/", "!www/js/modern-entry.js",
  ]),
  {
    files: [...browserFiles, ...nodeFiles],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
    plugins: { "import-x": importX },
    settings: {
      "import-x/resolver": {
        node: {
          extensions: [".js", ".jsx", ".mjs", ".cjs", ".json"],
          moduleDirectory: ["node_modules", join(root, "node_modules"), join(root, "trips", "node_modules")],
        },
      },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
      "no-undef": "error",
      "no-shadow": "error",
      "eqeqeq": ["error", "always", { null: "ignore" }],
      "import-x/no-unresolved": "error",
      "import-x/no-duplicates": "error",
      "import-x/order": ["warn", {
        groups: ["builtin", "external", "internal", "parent", "sibling", "index", "object", "type"],
        "newlines-between": "always",
        alphabetize: { order: "asc", caseInsensitive: true },
      }],
    },
  },
  {
    files: browserFiles,
    extends: [react.configs.flat.recommended, react.configs.flat["jsx-runtime"],
      reactHooks.configs.flat.recommended],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: {
      react: { version: reactVersion },
    },
    rules: {
      "react/prop-types": "off",
    },
  },
  {
    files: ["src/**/*.jsx", "trips/src/**/*.jsx"],
    plugins: { "react-refresh": reactRefresh },
    rules: {
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
  {
    files: nodeFiles,
    languageOptions: { globals: globals.node },
  },
  {
    files: ["**/*.cjs"],
    languageOptions: { sourceType: "commonjs" },
  },
  {
    files: ["tests/planner-react.test.cjs"],
    languageOptions: { globals: { window: "readonly" } },
  },
]);
