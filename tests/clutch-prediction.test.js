"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
const root = path.join(__dirname, "..");
const ctx = vm.createContext({ window: {}, importScripts() {}, self: { postMessage() {}, addEventListener() {} } });
vm.runInContext(fs.readFileSync(path.join(root, "js/scoreboard.js"), "utf8"), ctx);
const worker = fs.readFileSync(path.join(root, "js/demo-worker.js"), "utf8");
vm.runInContext(worker, ctx);
const rules = vm.runInContext("CLUTCH_CASH_RULES", ctx);
const summarize = ctx.window.NickStatsScoreboard.clutchEconomics;
function inputs(gear = 4000) {
  const hero = { userIds: new Set([1]) }, mate = { userIds: new Set([2]) }, enemy = { userIds: new Set([3]) };
  const candidate = { row: hero, side: 2, opponents: 1, deaths: new Set([2]), rosterComplete: true,
    resources: new Map([[hero, { side: 2, cash: 1000, equipment: gear }],
      [mate, { side: 2, cash: 2000, equipment: null }], [enemy, { side: 3, cash: 500, equipment: 5000 }]]) };
  const levels = { 2: 1, 3: 1 };
  candidate.saveBaseline = ctx.clutchSaveBaseline(2, false, levels, rules);
  return { candidate, levels };
}
function history(wins = 2, failures = 3, saves = 0, late = 0, bucket = "t1") {
  const values = { victory: 6000, victory_dead: 2000, failure: -3000, failure_late: -5000 };
  const counters = {};
  for (const [outcome, count] of [["win_survive", wins], ["loss_die", failures], ["loss_survive", saves]]) {
    counters[`${outcome}_count`] = count;
    counters[`${outcome}_${bucket}_count`] = count;
    counters[`${outcome}_${bucket}_forecast`] = count;
    for (const [key, value] of Object.entries(values)) counters[`${outcome}_${bucket}_${key}`] = value * count;
  }
  counters[`loss_die_${bucket}_late`] = late;
  return counters;
}
test("prediction uses entry payouts and equipment, with no income for post-timeout T deaths", () => {
  const { candidate, levels } = inputs();
  const values = ctx.clutchPredictionValues(candidate, false, levels, rules);
  assert.equal(values.victory, 5950);
  assert.equal(values.victory_dead, 1950);
  assert.equal(values.failure, -2100);
  assert.equal(values.failure_late, -4000);
  assert.equal(values.victory - values.victory_dead, 4000);
  assert.equal(values.failure - values.failure_late, 1900);
  const cheap = inputs(100);
  assert.equal(ctx.clutchPredictionValues(cheap.candidate, false, cheap.levels, rules).failure, 1800);
  candidate.resources.get(candidate.row).cash = null;
  assert.equal(ctx.clutchPredictionValues(candidate, false, levels, rules), null);
});
test("expected value combines observed success, win survival and failure timing probabilities", () => {
  const ordinary = summarize(history());
  // Two wins from five attempts, both survived; failed attempt=-3000.
  assert.ok(Math.abs(ordinary.average - (2 / 5 * 6000 - 3 / 5 * 3000)) < 1e-9);
  const late = summarize(history(2, 3, 0, 3));
  assert.ok(late.average < ordinary.average);
  assert.ok(Math.abs(late.average - (2 / 5 * 6000 - 3 / 5 * 5000)) < 1e-9);
});
test("lost-round survivors are saves and do not lower the attempt win probability", () => {
  const original = summarize(history());
  const withSaves = summarize(history(2, 3, 20));
  assert.ok(Math.abs(withSaves.average - original.average) < 1e-9);
  assert.equal(withSaves.measured, 25);
  assert.ok(Math.abs(withSaves.total - original.average * 25) < 1e-9);
});
test("zero observed wins never receive hypothetical victory value", () => {
  const counters = history(0, 5, 0, 0, "t5");
  counters.loss_die_t5_victory = 1000000;
  counters.loss_die_t5_victory_dead = 1000000;
  assert.equal(summarize(counters).average, -3000);
  assert.equal(summarize(counters).bySize[5].average, -3000);
  // A cheap T kit can still make early-death loss income exceed saving.
  counters.loss_die_t5_failure = 5000;
  assert.equal(summarize(counters).average, 1000);
});
test("winning survival uses observed deaths without adding imaginary deaths", () => {
  assert.equal(summarize(history(5, 0)).average, 6000);
  const counters = history(3, 2);
  for (const key of ["count", "forecast", "victory", "victory_dead", "failure", "failure_late"]) {
    const original = counters[`win_survive_t1_${key}`];
    counters[`win_die_t1_${key}`] = original / 3;
    counters[`win_survive_t1_${key}`] = original * 2 / 3;
  }
  counters.win_survive_count = 2;
  counters.win_die_count = 1;
  assert.ok(Math.abs(summarize(counters).average - 1600) < 1e-9);
});
test("side and 1vX histories stay separate and sparse contexts never become zero estimates", () => {
  assert.equal(summarize(history(1, 3)).total, null);
  const t = history(2, 3, 0, 0, "t1"), ct = history(0, 5, 0, 0, "ct1"), big = history(5, 0, 0, 0, "t5");
  const merge = (...sources) => sources.reduce((all, source) => {
    for (const [key, value] of Object.entries(source)) all[key] = (all[key] || 0) + value;
    return all;
  }, {});
  const combined = summarize(merge(t, ct, big));
  assert.ok(Math.abs(combined.total - summarize(t).total - summarize(ct).total - summarize(big).total) < 1e-9);
  assert.equal(combined.measured, 15);
  assert.equal(summarize({ loss_die_count: 3, loss_die_save_measured: 3, loss_die_save_impact: -12000 }).total, null);
});
test("settlement records a post-timeout death as a failed attempt, not a save", () => {
  const { candidate, levels } = inputs();
  const target = {};
  candidate.prediction = ctx.clutchPredictionValues(candidate, false, levels, rules);
  candidate.survivedTimeout = true;
  candidate.economicsTargets = [target];
  const state = vm.createContext({ calculateClutchEconomics: () => null,
    pendingClutchEconomics: { winner: 3, endTick: 10, round: { clutchCandidates: [candidate],
      deaths: new Set([1, 2]), clutchResourceTick: 11 } } });
  const start = worker.indexOf("  function settleClutchEconomics(");
  const end = worker.indexOf("  function resetMatchCounters()", start);
  vm.runInContext(worker.slice(start, end), state);
  state.settleClutchEconomics(); state.settleClutchEconomics();
  assert.equal(target.clutchEconomics.loss_die_t1_count, 1);
  assert.equal(target.clutchEconomics.loss_die_t1_late, 1);
  assert.equal(target.clutchEconomics.loss_die_t1_forecast, 1);
  assert.equal(target.clutchEconomics.loss_survive_count, undefined);
});

test("size averages combine eligible sides and the aggregate weights covered attempts", () => {
  const t = history(2, 3, 0, 0, "t1"), ct = history(0, 5, 0, 0, "ct1"), big = history(5, 0, 15, 0, "t5");
  const combined = {};
  for (const source of [t, ct, big]) for (const [key, value] of Object.entries(source)) combined[key] = (combined[key] || 0) + value;
  const result = summarize(combined);
  const one = (summarize(t).average + summarize(ct).average) / 2;
  const five = summarize(big).average;
  assert.ok(Math.abs(result.bySize[1].average - one) < 1e-9);
  assert.equal(result.bySize[1].measured, 10);
  assert.equal(result.bySize[5].measured, 20);
  assert.ok(Math.abs(result.average - (one * 10 + five * 20) / 30) < 1e-9);
  assert.equal(result.bySize[2].average, null);
  assert.equal(summarize(null).bySize[1].average, null);
});
