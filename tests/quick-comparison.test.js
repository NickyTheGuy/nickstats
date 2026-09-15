"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const componentSource = fs.readFileSync(path.join(__dirname, "..", "js", "quick-comparison.js"), "utf8");
const compareSource = fs.readFileSync(path.join(__dirname, "..", "js", "compare.js"), "utf8");
const playersSource = fs.readFileSync(path.join(__dirname, "..", "js", "players.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const styles = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");

test("quick comparison uses the scoreboard rating colors", () => {
  assert.match(componentSource, /demo-rating.*rating-good.*rating-bad.*rating-average/);
});

test("quick comparison shows filtered rounds instead of redundant match count", () => {
  assert.match(componentSource, /key: "rounds", label: "Rounds"/);
  assert.doesNotMatch(componentSource, /key: "matches", label: "Matches"/);
});

test("quick comparison openings and clutches are expandable scoreboard groups", () => {
  assert.match(componentSource, /expandedGroups: \{ opening: false, clutches: false \}/);
  assert.match(componentSource, /group: "opening", label: "Opening"/);
  assert.match(componentSource, /key: "opening-assisted", label: "Assisted K"/);
  assert.match(componentSource, /key: "opening-damage-assisted", label: "Dmg A"/);
  assert.match(componentSource, /key: "opening-flash-assisted", label: "Flash A"/);
  assert.match(componentSource, /group: "clutches", label: "Clutches"/);
  assert.match(componentSource, /demo-toggle-heading.*-heading/);
  assert.match(styles, /\.quick-comparison-table :is\(th, td\)\.demo-group-start/);
  assert.match(styles, /\.opening-cell \{ background:/);
  assert.match(styles, /\.clutches-cell \{ background:/);
  assert.match(styles, /\.player-profile-table\.quick-comparison-table :is\(th, td\) \{ text-align: center; \}/);
  assert.match(styles, /th\.demo-toggle-heading,[\s\S]*?th\.demo-group-detail \{ padding: 0; \}/);
  assert.match(styles, /\.player-profile-table\.quick-comparison-table \.player-table-sort-button \{[\s\S]*?min-height: 38px;[\s\S]*?text-align: center;/);
});

test("quick comparison serves the group scoreboard and standalone player profiles", () => {
  assert.match(componentSource, /window\.NickStatsQuickComparison = \{ create \}/);
  assert.match(playersSource, /NickStatsQuickComparison\.create\(\{ prefix: "player" \}\)/);
  assert.match(compareSource, /NickStatsQuickComparison\.create\(\{ prefix: "combo" \}\)/);
  assert.match(html, /data-player-view="quick" data-standalone-profile-only>Quick comparison/);
  assert.match(html, /data-player-profile-view="quick" data-standalone-profile-only hidden/);
  assert.match(html, /id="playerQuickPlayers"/);
  assert.match(html, /id="playerQuickTable"/);
  assert.match(html, /data-combo-display="quick">Quick comparison/);
  assert.match(html, /id="comboQuickTable"/);
});

test("graphs and quick comparison share the same selected open profiles", () => {
  assert.match(playersSource, /comparisonPlayers: new Set\(\)/);
  assert.match(playersSource, /\[\["playerGraphPlayers", "playerGraphPlayerStatus"\], \["playerQuickPlayers", "playerQuickPlayerStatus"\]\]/);
  assert.match(playersSource, /renderComparisonPlayers\(\); renderGraphs\(\); renderQuickComparison\(\);/);
});
