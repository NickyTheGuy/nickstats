"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const styles = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");

test("site chrome uses the cold-white orange and gold palette", () => {
  assert.match(styles, /color-scheme: light/);
  assert.match(styles, /--bg: rgb\(250, 250, 255\)/);
  assert.match(styles, /--accent: rgb\(233, 86, 49\)/);
  assert.match(styles, /--secondary-accent: rgb\(228, 182, 82\)/);
  assert.match(styles, /\.button-primary \{[\s\S]*?background: var\(--accent\)/);
  assert.match(styles, /\.tab-button\[aria-selected="true"\] \{[\s\S]*?background: var\(--accent\)/);
});

test("existing statistic section highlight colors remain intact", () => {
  assert.match(styles, /\.killContext-cell \{ background: rgba\(255, 151, 92, \.13\); \}/);
  assert.match(styles, /\.clutches-cell \{ background: rgba\(98, 212, 157, \.12\); \}/);
  assert.match(styles, /\.movement-cell \{ background: rgba\(190, 130, 255, \.08\); \}/);
  assert.match(styles, /\.trades-cell \{ background: rgba\(85, 214, 210, \.045\); \}/);
});
