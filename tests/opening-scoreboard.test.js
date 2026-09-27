"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/scoreboard.js"), "utf8");
const context = { window: {} };
vm.runInNewContext(source, context);
const { columns, subgroups, focus, cycle } = context.window.NickStatsScoreboard;

test("opening detail keeps every stat in readable sections", () => {
  const sections = subgroups.opening;
  const indices = Array.from(sections).flatMap(([, , values]) => Array.from(values));
  assert.deepEqual(indices.slice().sort((a, b) => a - b), Array.from(columns.opening[0], (_, index) => index));
  assert.ok(sections.every(([, , values]) => values.length <= 5));
  assert.deepEqual(Array.from(sections).slice(3).map(([key]) => key), ["flashKills", "flashDeaths", "enemyAssists"]);

  const state = { expanded: { opening: true }, subgroups: { opening: "flashKills" } };
  assert.deepEqual(Array.from(focus(state, "opening", columns.opening[0])),
    ["Enemy blind K", "Blind K", "Own flash K", "Victim-side flash K", "Unknown flash K"]);
  assert.equal(cycle(state, "opening")[0], "flashDeaths");
  assert.equal(cycle(state, "opening")[0], "enemyAssists");
  assert.deepEqual(Array.from(focus(state, "opening", columns.opening[0])),
    ["Enemy assisted D", "Enemy dmg A D", "Enemy flash A D"]);
});
