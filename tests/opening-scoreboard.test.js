"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/scoreboard.js"), "utf8");
const matchSource = fs.readFileSync(path.join(__dirname, "../js/demo.js"), "utf8");
const comparisonSource = fs.readFileSync(path.join(__dirname, "../js/quick-comparison.js"), "utf8");
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
    ["Enemy blind K", "K while blind", "K on your flash", "K on their flash"]);
  assert.equal(cycle(state, "opening")[0], "flashDeaths");
  assert.equal(cycle(state, "opening")[0], "enemyAssists");
  assert.deepEqual(Array.from(focus(state, "opening", columns.opening[0])),
    ["Enemy assisted D", "Enemy dmg A D", "D on killer's ally flash"]);
});

test("unknown flash sources remain in stored match payloads but not visible statistics", () => {
  assert.match(matchSource, /opening_blind_source_unknown_kills: numberValue\(stats\.opening\?\.\[19\]\)/);
  assert.match(matchSource, /opening_deaths_blind_source_unknown: numberValue\(stats\.opening\?\.\[22\]\)/);
  assert.match(matchSource, /number\(player\.opening_blind_source_unknown_kills\)/);
  assert.match(matchSource, /number\(player\.opening_deaths_blind_source_unknown\)/);
  for (const file of ["demo.js", "scoreboard.js", "profile.js", "quick-comparison.js", "graphs.js"]) {
    const source = fs.readFileSync(path.join(__dirname, "../js", file), "utf8");
    assert.doesNotMatch(source, /Unknown flash K|Unknown flash D|Blind source unavailable|Opening kills with unknown blind source per round|Opening deaths with unknown blind source per round/, file);
  }
  assert.equal(columns.opening[0].length, 25);
});

test("flash attribution headers stay aligned with both scoreboard implementations", () => {
  for (const label of ["K on ally flash", "A from your flash", "D on killer's ally flash",
    "K on your flash", "K on their flash", "D to killer's flash", "D to your side's flash"]) {
    assert.ok(columns.opening[0].includes(label));
    assert.ok(matchSource.includes(`"${label}": sortSpecs.`), `Missing match sort for ${label}`);
    assert.ok(comparisonSource.includes(`label: "${label}"`), `Missing comparison column for ${label}`);
    assert.ok(source.includes(`"${label}": "`), `Missing explanation for ${label}`);
  }
});
