"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const compareSource = fs.readFileSync(path.join(__dirname, "..", "js", "compare.js"), "utf8");
const styles = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");

test("quick comparison uses the scoreboard rating colors", () => {
  assert.match(compareSource, /demo-rating.*rating-good.*rating-bad.*rating-average/);
});

test("quick comparison shows filtered rounds instead of redundant match count", () => {
  assert.match(compareSource, /key: "rounds", label: "Rounds"/);
  assert.doesNotMatch(compareSource, /key: "matches", label: "Matches"/);
});

test("quick comparison openings and clutches are expandable scoreboard groups", () => {
  assert.match(compareSource, /quickExpandedGroups: \{ opening: false, clutches: false \}/);
  assert.match(compareSource, /group: "opening", label: "Opening"/);
  assert.match(compareSource, /group: "clutches", label: "Clutches"/);
  assert.match(compareSource, /demo-toggle-heading.*-heading/);
  assert.match(styles, /\.combo-quick-table :is\(th, td\)\.demo-group-start/);
  assert.match(styles, /\.opening-cell \{ background:/);
  assert.match(styles, /\.clutches-cell \{ background:/);
  assert.match(styles, /\.player-profile-table\.combo-quick-table :is\(th, td\) \{ text-align: center; \}/);
  assert.match(styles, /th\.demo-toggle-heading,[\s\S]*?th\.demo-group-detail \{ padding: 0; \}/);
  assert.match(styles, /\.player-profile-table\.combo-quick-table \.player-table-sort-button \{[\s\S]*?min-height: 38px;[\s\S]*?text-align: center;/);
});
