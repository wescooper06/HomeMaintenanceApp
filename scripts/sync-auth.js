"use strict";

const { copyFileSync } = require("node:fs");
const { resolve } = require("node:path");

copyFileSync(
  resolve(__dirname, "../auth.js"),
  resolve(__dirname, "../www/auth.js")
);
