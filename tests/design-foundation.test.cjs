const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const layout = path.join(root, "src", "components", "layout");
const foundation = fs.readFileSync(path.join(layout, "lifeManagerFoundation.css"), "utf8");

function token(name) {
  const match = foundation.match(new RegExp(`--lm-color-${name}:\\s*(#[0-9a-f]{6})`, "i"));
  assert(match, `missing hex color token --lm-color-${name}`);
  return match[1];
}

function luminance(hex) {
  const channels = hex.slice(1).match(/.{2}/g).map((value) => parseInt(value, 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(first, second) {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test("foundation palette meets WCAG AA contrast for normal text states", () => {
  const pairs = [
    ["navigation", "navigation-muted"],
    ["navigation", "navigation-text"],
    ["primary", "text-on-primary"],
    ["primary-hover", "text-on-primary"],
    ["primary-pressed", "text-on-primary"],
    ["danger", "text-on-primary"],
    ["danger-hover", "text-on-primary"],
    ["text", "surface"],
    ["text-secondary", "surface"],
    ["text-secondary", "surface-subtle"],
    ["primary-selected-text", "primary-subtle"],
    ["primary-selected-text", "surface-selected"],
    ["success", "success-surface"],
    ["info", "info-surface"],
    ["error", "danger-subtle"],
  ];

  for (const [foreground, background] of pairs) {
    assert(contrast(token(foreground), token(background)) >= 4.5,
      `${foreground} on ${background} must meet 4.5:1`);
  }
});

test("shared primitives provide focus, responsive, overlay and state foundations", () => {
  for (const selector of [
    ".lm-page-header", ".lm-button--primary", ".lm-button--secondary", ".lm-button--danger",
    ".lm-icon-button", ".lm-form-control", ".lm-dense-row", ".lm-tabs", ".lm-badge",
    ".lm-overlay-panel", ".lm-popover", ".lm-feedback--error", ".lm-feedback--success",
    ".lm-empty-state", ".lm-skeleton", ":focus-visible", "prefers-reduced-motion",
  ]) {
    assert(foundation.includes(selector), `missing shared foundation primitive ${selector}`);
  }
  assert.match(foundation, /--lm-control-mobile:\s*44px/);
  assert.match(foundation, /@media \(max-width:\s*600px\)/);
});
