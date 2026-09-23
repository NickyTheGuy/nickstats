"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const scoreboardSource = fs.readFileSync(path.join(__dirname, "..", "js", "scoreboard.js"), "utf8");
const quickSource = fs.readFileSync(path.join(__dirname, "..", "js", "quick-comparison.js"), "utf8");
const demoSource = fs.readFileSync(path.join(__dirname, "..", "js", "demo.js"), "utf8");
const sandbox = { window: {} };
vm.runInNewContext(scoreboardSource, sandbox);
const Scoreboard = sandbox.window.NickStatsScoreboard;

test("normalized scoreboard sort values use the displayed denominator", () => {
  assert.equal(Scoreboard.normalizedSortValue(24, 12, true), 2);
  assert.equal(Scoreboard.normalizedSortValue(24, 6, true), 4);
  assert.equal(Scoreboard.normalizedSortValue(24, 0, true), null);
  assert.equal(Scoreboard.normalizedSortValue(24, 6, false), 24);
});

test("missing normalized values remain last in either sort direction", () => {
  const values = [null, 2, 4];
  assert.deepEqual([...values].sort((a, b) => Scoreboard.compareSortValues(a, b, "desc")), [4, 2, null]);
  assert.deepEqual([...values].sort((a, b) => Scoreboard.compareSortValues(a, b, "asc")), [2, 4, null]);
});

test("quick comparison and match scoreboards sort with their active rate basis", () => {
  assert.match(quickSource, /columnSortValue\(column, left\.item\)/);
  assert.match(quickSource, /columnDenominator\(column, item\)/);
  assert.match(quickSource, /utility-he-damage[\s\S]*?he_grenades_thrown/);
  assert.match(quickSource, /utility-fire-damage[\s\S]*?fire_grenades_thrown/);
  assert.match(demoSource, /scoreboardSortValue\(state\.scoreboardSort\.spec, mode/);
  assert.match(demoSource, /spec\.id === "heDamage"[\s\S]*?high_explosive/);
  assert.match(demoSource, /spec\.id === "fireDamage"[\s\S]*?utility_thrown\?\.fire/);
  assert.match(demoSource, /roundInvariantSorts\.has\(spec\.id\)/);
});
