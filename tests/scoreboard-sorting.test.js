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
const matchSorts = vm.runInNewContext(`${demoSource.slice(demoSource.indexOf("  const sortSpecs ="), demoSource.indexOf("  function setStatus("))}\nsortSpecs`);

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

test("match clutch and combined percentage columns rank rates over raw counts", () => {
  const highRate = { clutch_wins: { 1: 1 }, clutch_attempts: { 1: 1 }, trade_kills: 1,
    trade_success_percent: 100, opening_kills: 1, opening_deaths: 0, rounds_played: 2 };
  const highCount = { clutch_wins: { 1: 8 }, clutch_attempts: { 1: 20 }, trade_kills: 8,
    trade_success_percent: 40, opening_kills: 8, opening_deaths: 12, rounds_played: 100 };
  for (const spec of [matchSorts.clutchTotal, matchSorts.clutch1, matchSorts.tradeKResult, matchSorts.openingSummary]) {
    assert.ok(spec.modes[0].value(highRate) > spec.modes[0].value(highCount), spec.id);
  }
  assert.equal(matchSorts.clutch1.modes[0].value({ clutch_attempts: { 1: 0 } }), null);
  assert.equal(Scoreboard.compareSortValues(100, null, "desc"), -1);
  assert.match(quickSource, /key: "opening", label: "K-D · Att%", value: item => item\.stats\.openingAttemptRate/);
  assert.match(quickSource, /\["opening", "trade-kills", "traded-deaths", "clutches"\]/);
});
