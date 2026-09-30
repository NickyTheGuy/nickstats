"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
const root = path.join(__dirname, "..");
const worker = fs.readFileSync(path.join(root, "js/demo-worker.js"), "utf8");
const context = vm.createContext({ importScripts() {}, self: { postMessage() {}, addEventListener() {} } });
vm.runInContext(worker, context);
const calculate = context.calculateClutchEconomics;
const player = id => ({ userIds: new Set([id]) });
function fixture() {
  const hero = player(1), mate = player(2), foe = player(3);
  const resources = new Map([[hero, { side: 3, cash: 1000, equipment: 4000 }],
    [mate, { side: 3, cash: 2000, equipment: null }], [foe, { side: 2, cash: 500, equipment: 5000 }]]);
  return { hero, mate, foe, resources, candidate: { row: hero, side: 3, resources, deaths: new Set([2]),
    kills: 1, stripped: 5000, equipmentComplete: true, rosterComplete: true } };
}
test("winning clutch includes actual payout and excludes gear lost before entry", () => {
  const f = fixture();
  const end = new Map([[f.hero, { cash: 4500, equipment: 3800 }], [f.mate, { cash: 5500 }], [f.foe, { cash: 1900 }]]);
  const result = calculate(f.candidate, end, new Set([2, 3]), null, true);
  assert.equal(result.team_resources, 13800);
  assert.equal(result.enemy_resources, 1900);
  assert.equal(result.differential, 11900);
  assert.equal(result.swing, 10400);
  assert.equal(result.team_cash_change, 7000);
  assert.equal(result.saved, 3800);
  assert.equal(result.stripped, 5000);
  const died = calculate(f.candidate, end, new Set([1, 2, 3]), null, true);
  assert.equal(died.saved, 0);
  assert.equal(died.swing, 6600);
});
test("next-round pre-purchase accounts include capped awards without counting purchases", () => {
  const f = fixture(), cash = new Map([[f.hero, 4300], [f.mate, 5200], [f.foe, 16000]]);
  const result = calculate(f.candidate, f.resources, new Set([2]), cash, false);
  assert.equal(result.team_resources, 13500);
  assert.equal(result.enemy_resources, 21000);
  assert.equal(result.swing, -9000);
});
test("T timeout save retains gear and uses observed zero loss payout for the saver", () => {
  const f = fixture(); f.candidate.side = 2;
  f.resources.get(f.hero).side = 2; f.resources.get(f.mate).side = 2; f.resources.get(f.foe).side = 3;
  const cash = new Map([[f.hero, 1000], [f.mate, 3900], [f.foe, 3750]]);
  const result = calculate(f.candidate, f.resources, new Set([2]), cash, false);
  assert.equal(result.saved, 4000);
  assert.equal(result.team_cash_change, 1900);
  assert.equal(result.enemy_cash_change, 3250);
});
test("incomplete snapshots and unsettled final-round cash are excluded", () => {
  const f = fixture();
  assert.equal(calculate(f.candidate, f.resources, new Set([2]), null, false), null);
  f.resources.get(f.foe).cash = null;
  assert.equal(calculate(f.candidate, f.resources, new Set([2]), null, true), null);
  f.resources.get(f.foe).cash = 500; f.candidate.rosterComplete = false;
  assert.equal(calculate(f.candidate, f.resources, new Set([2]), null, true), null);
});
test("post-round settlement records all four outcomes once in every persisted scope", () => {
  const start = worker.indexOf("  function settleClutchEconomics(");
  const end = worker.indexOf("  function resetMatchCounters()", start);
  for (const won of [true, false]) for (const survives of [true, false]) {
    const f = fixture(), target = {}, slice = {};
    f.candidate.economicsTargets = [target, slice];
    const state = vm.createContext({ calculateClutchEconomics: calculate,
      pendingClutchEconomics: { winner: won ? 3 : 2, endTick: 10,
        round: { clutchCandidates: [f.candidate], deaths: new Set(survives ? [2] : [1, 2]),
          clutchResources: f.resources, clutchResourceTick: 11 } } });
    vm.runInContext(worker.slice(start, end), state);
    state.settleClutchEconomics(); state.settleClutchEconomics();
    const key = `${won ? "win" : "loss"}_${survives ? "survive" : "die"}`;
    assert.equal(target.clutchEconomics[`${key}_count`], 1);
    assert.equal(slice.clutchEconomics[`${key}_measured`], 1);
    assert.equal(target.clutchEconomics[`${key}_saved`], survives ? 4000 : 0);
  }
});
test("compact aggregation retains signed economics and supports round filters", () => {
  const source = fs.readFileSync(path.join(root, "js/demo.js"), "utf8");
  const helpers = source.slice(source.indexOf("  function numberValue("), source.indexOf("  function setMatchBrowserView("));
  const economy = source.slice(source.indexOf("  function economyBuyType("), source.indexOf("  async function parseDemo()"));
  const ctx = vm.createContext({}); vm.runInContext(`${helpers}\n${economy}`, ctx);
  assert.equal(ctx.mergeCompactSides({ clutch_economics: { loss_die_swing: -5000 } },
    { clutch_economics: { loss_die_swing: 1000 } }).clutch_economics.loss_die_swing, -4000);
  const stats = { rounds: [1, 0], clutch_economics: { loss_die_count: 1, loss_die_measured: 1, loss_die_swing: -5000 } };
  const payload = { schema: "nickstats.match/24", rounds: 1, teams: [{ id: "2", players: [0] }],
    players: [{ name: "Nick", sides: [stats, {}], round_slices: [{ round: 1, side: "T", stats, buy: "full", result: "loss" }] }] };
  assert.equal(ctx.expandStoredMatch(payload, 1).teams[0].players[0].clutch_economics.loss_die_swing, -5000);
  assert.equal(ctx.expandStoredMatch(payload, 1, "REGULATION").teams[0].players[0].clutch_economics.loss_die_count, 1);
});
test("missing network values cannot become false zero balances", () => {
  for (const value of [null, undefined, "", "unavailable"]) assert.equal(context.clutchResourceNumber(value), null);
  assert.equal(context.clutchResourceNumber(0), 0);
  assert.equal(context.clutchResourceNumber("16000"), 16000);
});
test("schema-aware profile economics excludes older compatible combat matches", () => {
  const ctx = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync(path.join(root, "js/stat-availability.js"), "utf8"), ctx);
  const availability = ctx.window.NickStatsAvailability, stats = {};
  availability.add(stats, { rounds: 20, clutch_econ_win_survive_measured: 2, clutch_econ_win_survive_swing: 20000 }, "nickstats.match/24");
  availability.add(stats, { rounds: 30, clutch_econ_win_survive_measured: 99, clutch_econ_win_survive_swing: 99 }, "nickstats.match/23");
  const scoped = availability.scope(stats, "clutchEconomics");
  assert.equal(scoped.rounds, 20);
  assert.equal(scoped.clutch_econ_win_survive_measured, 2);
  assert.equal(scoped.clutch_econ_win_survive_swing, 20000);
});

test("profile economy impact pools every clutch/save outcome and weights the average by measured attempts", () => {
  const ctx = vm.createContext({ window: {}, document: { getElementById: () => null } });
  vm.runInContext(fs.readFileSync(path.join(root, "js/stat-availability.js"), "utf8"), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, "js/profile.js"), "utf8"), ctx);
  const stats = {}, availability = ctx.window.NickStatsAvailability;
  availability.add(stats, {
    rounds: 30,
    clutch_econ_win_survive_count: 4, clutch_econ_win_survive_measured: 3, clutch_econ_win_survive_swing: 30000,
    clutch_econ_win_die_count: 1, clutch_econ_win_die_measured: 1, clutch_econ_win_die_swing: 6000,
    clutch_econ_loss_survive_count: 2, clutch_econ_loss_survive_measured: 2, clutch_econ_loss_survive_swing: -4000,
    clutch_econ_loss_die_count: 3, clutch_econ_loss_die_measured: 2, clutch_econ_loss_die_swing: -8000
  }, "nickstats.match/25");
  // Legacy games never enter either the numerator or the denominator.
  availability.add(stats, { rounds: 10, clutch_econ_win_survive_count: 99, clutch_econ_win_survive_measured: 99, clutch_econ_win_survive_swing: 999999 }, "nickstats.match/23");
  const result = ctx.window.NickStatsProfile.clutchEconomySummary(stats);
  assert.equal(result.attempted, 10);
  assert.equal(result.measured, 8);
  assert.equal(result.total, 24000);
  assert.equal(result.average, 3000);
});

test("pooled impact distinguishes negative, zero, incomplete, and unavailable measurements", () => {
  const ctx = vm.createContext({ window: {}, document: { getElementById: () => null } });
  vm.runInContext(fs.readFileSync(path.join(root, "js/stat-availability.js"), "utf8"), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, "js/profile.js"), "utf8"), ctx);
  const availability = ctx.window.NickStatsAvailability, summarize = ctx.window.NickStatsProfile.clutchEconomySummary;
  const negative = {}, zero = {}, incomplete = {};
  availability.add(negative, { clutch_econ_loss_die_count: 3, clutch_econ_loss_die_measured: 2, clutch_econ_loss_die_swing: -8000 }, "nickstats.match/25");
  assert.equal(summarize(negative).average, -4000);
  availability.add(zero, { clutch_econ_win_survive_count: 1, clutch_econ_win_survive_measured: 1, clutch_econ_win_survive_swing: 5000, clutch_econ_loss_die_count: 1, clutch_econ_loss_die_measured: 1, clutch_econ_loss_die_swing: -5000 }, "nickstats.match/25");
  assert.equal(summarize(zero).total, 0);
  availability.add(incomplete, { clutch_econ_loss_survive_count: 2 }, "nickstats.match/25");
  assert.equal(summarize(incomplete).total, null);
  assert.equal(summarize(incomplete).attempted, 2);
  assert.equal(summarize(incomplete).available, true);
  assert.equal(summarize({}).available, false);
  assert.equal(summarize({}).average, null);
});

test("Player and Groups render one signed aggregate with its average and measurement coverage", () => {
  class Element {
    constructor() { this.children = []; this.dataset = {}; this.classList = { add() {} }; }
    append(...nodes) { this.children.push(...nodes); }
    appendChild(node) { this.children.push(node); }
    replaceChildren(...nodes) { this.children = nodes; }
    setAttribute() {} addEventListener() {}
  }
  const elements = new Map();
  const ctx = vm.createContext({ window: {}, document: {
    createElement: () => new Element(), getElementById: id => {
      if (id === "playerProfileBody" || id === "comboProfileBody") return null;
      if (!elements.has(id)) elements.set(id, new Element());
      return elements.get(id);
    }
  } });
  vm.runInContext(fs.readFileSync(path.join(root, "js/stat-availability.js"), "utf8"), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, "js/profile.js"), "utf8"), ctx);
  const stats = {};
  ctx.window.NickStatsAvailability.add(stats, { rounds: 30, clutch_econ_win_survive_count: 3,
    clutch_econ_win_survive_measured: 2, clutch_econ_win_survive_swing: 12000,
    clutch_econ_loss_die_count: 2, clutch_econ_loss_die_measured: 1, clutch_econ_loss_die_swing: -3000 }, "nickstats.match/25");
  for (const prefix of ["player", "combo"]) {
    ctx.window.NickStatsProfile.render({ prefix, headlineId: `${prefix}Headline`, side: "ALL", summary: { stats }, maps: [] });
    const target = elements.get(`${prefix}ClutchEconomicsStats`);
    assert.equal(target.children.length, 1);
    assert.equal(target.children[0].children[0].textContent, "Net economy change");
    assert.equal(target.children[0].children[1].textContent, "+$9,000");
    assert.equal(target.children[0].children[2].textContent, "+$3,000 per measured attempt");
    assert.match(elements.get(`${prefix}ClutchEconomicsCoverage`).textContent, /^3 of 5 clutch\/save attempts measured/);
  }
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.ok(html.includes('id="playerClutchEconomicsStats"'));
  assert.ok(!html.includes('id="playerClutchEconomicsTable"'));
});
