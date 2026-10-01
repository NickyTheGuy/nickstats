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
    f.candidate.saveBaseline = context.clutchSaveBaseline(3, true, { 2: 1, 3: 1 }, vm.runInContext("CLUTCH_CASH_RULES", context));
    f.candidate.economicsTargets = [target, slice];
    const state = vm.createContext({ calculateClutchEconomics: calculate, calculateClutchSaveImpact: context.calculateClutchSaveImpact,
      pendingClutchEconomics: { winner: won ? 3 : 2, endTick: 10,
        round: { clutchCandidates: [f.candidate], deaths: new Set(survives ? [2] : [1, 2]),
          clutchResources: f.resources, clutchResourceTick: 11 } } });
    vm.runInContext(worker.slice(start, end), state);
    state.settleClutchEconomics(); state.settleClutchEconomics();
    const key = `${won ? "win" : "loss"}_${survives ? "survive" : "die"}`;
    assert.equal(target.clutchEconomics[`${key}_count`], 1);
    assert.equal(slice.clutchEconomics[`${key}_measured`], 1);
    assert.equal(slice.clutchEconomics[`${key}_save_measured`], 1);
    assert.equal(target.clutchEconomics[`${key}_save_impact`], slice.clutchEconomics[`${key}_save_impact`]);
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

const cashRules = vm.runInContext("CLUTCH_CASH_RULES", context);
function counterfactualFixture(side = 3, planted = true) {
  const f = fixture();
  f.candidate.side = side;
  for (const [row, initial] of f.resources) initial.side = row === f.foe ? side === 2 ? 3 : 2 : side;
  f.candidate.saveBaseline = context.clutchSaveBaseline(side, planted, { 2: 1, 3: 1 }, cashRules);
  return f;
}
function impact(f, balances, deaths) {
  const end = new Map([...f.resources].map(([row, initial]) => [row, { ...initial }]));
  const cash = new Map([[f.hero, balances[0]], [f.mate, balances[1]], [f.foe, balances[2]]]);
  return context.calculateClutchSaveImpact(f.candidate, calculate(f.candidate, end, new Set(deaths), cash, false));
}
test("a plain CT save and T saves with or without a plant are neutral", () => {
  assert.equal(impact(counterfactualFixture(3, true), [2900, 3900, 4000], [2]), 0);
  // Without an existing plant, the conceded T objective includes its $300 plant reward.
  assert.equal(impact(counterfactualFixture(3, false), [2900, 3900, 4300], [2]), 0);
  // A conceded planted T round pays loss + plant bonus, and the CT defuser gets $300.
  assert.equal(impact(counterfactualFixture(2, true), [3500, 4500, 4300], [2]), 0);
  assert.equal(impact(counterfactualFixture(2, false), [1000, 3900, 3750], [2]), 0);
});
test("failed attempts charge saved equipment and enemy kill income, offset by kill value", () => {
  const f = counterfactualFixture();
  assert.equal(impact(f, [2900, 3900, 4300], [1, 2]), -4300);
  // Killing the enemy removes their $5,000 kit and earns $300 despite a round loss.
  assert.equal(impact(f, [3200, 3900, 4000], [1, 2, 3]), 1300);
  // T death before timeout earns loss income that a successful T timeout save would forgo.
  assert.equal(impact(counterfactualFixture(2, false), [2900, 3900, 4050], [1, 2]), -2400);
});
test("wins compare payouts and retained gear against the same save baseline", () => {
  const f = counterfactualFixture();
  const survived = impact(f, [4500, 5500, 2400], [2, 3]);
  const died = impact(f, [4500, 5500, 2400], [1, 2, 3]);
  assert.equal(survived, 9800);
  assert.equal(died, 5800);
  assert.equal(survived - died, 4000);
  // Earlier economy differences cancel when they don't change a capped payout.
  f.resources.get(f.mate).cash += 100;
  assert.equal(impact(f, [4500, 5600, 2400], [2, 3]), survived);
});
test("save baseline respects individual cash caps and the observed objective recipient", () => {
  const f = counterfactualFixture(2, true);
  f.resources.get(f.hero).cash = 15900;
  f.resources.get(f.mate).cash = 15900;
  f.resources.get(f.foe).cash = 15900;
  f.candidate.baselineObjectiveRow = f.foe;
  assert.equal(impact(f, [16000, 16000, 16000], [2]), 0);
  assert.equal(impact(f, [16000, 16000, 16000], [1, 2]), -4000);
  assert.equal(context.calculateClutchSaveImpact({ ...f.candidate, saveBaseline: null }, { differential: 1 }), null);
});
test("loss bonuses rise, cap, decline after wins, and accept recorded cash-rule overrides", () => {
  let levels = { 2: 1, 3: 1 };
  for (let i = 0; i < 6; i++) levels = context.clutchNextLossLevels(levels, 3, cashRules);
  assert.equal(context.clutchSaveBaseline(2, true, levels, cashRules).teamAward, 4000);
  levels = context.clutchNextLossLevels(levels, 2, cashRules);
  assert.equal(context.clutchSaveBaseline(2, true, levels, cashRules).teamAward, 3500);
  const historical = { ...cashRules, cash_team_planted_bomb_but_defused: 800, mp_maxmoney: 8000 };
  const baseline = context.clutchSaveBaseline(2, true, { 2: 1, 3: 1 }, historical);
  assert.equal(baseline.teamAward, 2700);
  assert.equal(baseline.maxCash, 8000);
});
test("recorded server cash rules override defaults without accepting unknown or invalid values", () => {
  const start = worker.indexOf("    if (messagePacket.type === MessagePacketType.NET_SET_CON_VAR)");
  const end = worker.indexOf("    if (messagePacket.type === MessagePacketType.SVC_SERVER_INFO)", start);
  const rules = { ...cashRules };
  const ctx = vm.createContext({ MessagePacketType: { NET_SET_CON_VAR: 6 },
    CLUTCH_CASH_RULES: cashRules, clutchCashRules: rules, clutchResourceNumber: context.clutchResourceNumber });
  const accept = vm.runInContext(`(function(messagePacket) { ${worker.slice(start, end)} })`, ctx);
  accept({ type: 6, data: { convars: { cvars: [
    { name: "cash_team_planted_bomb_but_defused", value: "800" },
    { name: "mp_maxmoney", value: "8000" },
    { name: "cash_team_loser_bonus", value: "-1" },
    { name: "mp_starting_losses", value: "unknown" },
    { name: "unrelated", value: "1" }
  ] } } });
  assert.equal(rules.cash_team_planted_bomb_but_defused, 800);
  assert.equal(rules.mp_maxmoney, 8000);
  assert.equal(rules.cash_team_loser_bonus, 1400);
  assert.equal(rules.mp_starting_losses, 1);
  assert.equal(rules.unrelated, undefined);
});
test("schema-aware profile economics excludes older compatible combat matches", () => {
  const ctx = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync(path.join(root, "js/stat-availability.js"), "utf8"), ctx);
  const availability = ctx.window.NickStatsAvailability, stats = {};
  availability.add(stats, { rounds: 20, clutch_econ_win_survive_save_measured: 2, clutch_econ_win_survive_save_impact: 20000 }, "nickstats.match/26");
  availability.add(stats, { rounds: 30, clutch_econ_win_survive_save_measured: 99, clutch_econ_win_survive_save_impact: 99 }, "nickstats.match/23");
  availability.add(stats, { rounds: 30, clutch_econ_win_survive_count: 99, clutch_econ_win_survive_measured: 99,
    clutch_econ_win_survive_swing: 999999 }, "nickstats.match/25");
  const scoped = availability.scope(stats, "clutchEconomics");
  assert.equal(scoped.rounds, 20);
  assert.equal(scoped.clutch_econ_win_survive_save_measured, 2);
  assert.equal(scoped.clutch_econ_win_survive_save_impact, 20000);
});

test("profile economy impact pools every clutch/save outcome and weights the average by measured attempts", () => {
  const ctx = vm.createContext({ window: {}, document: { getElementById: () => null } });
  vm.runInContext(fs.readFileSync(path.join(root, "js/stat-availability.js"), "utf8"), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, "js/profile.js"), "utf8"), ctx);
  const stats = {}, availability = ctx.window.NickStatsAvailability;
  availability.add(stats, {
    rounds: 30,
    clutch_econ_win_survive_count: 4, clutch_econ_win_survive_save_measured: 3, clutch_econ_win_survive_save_impact: 30000,
    clutch_econ_win_die_count: 1, clutch_econ_win_die_save_measured: 1, clutch_econ_win_die_save_impact: 6000,
    clutch_econ_loss_survive_count: 2, clutch_econ_loss_survive_save_measured: 2, clutch_econ_loss_survive_save_impact: -4000,
    clutch_econ_loss_die_count: 3, clutch_econ_loss_die_save_measured: 2, clutch_econ_loss_die_save_impact: -8000
  }, "nickstats.match/26");
  // Legacy games never enter either the numerator or the denominator.
  availability.add(stats, { rounds: 10, clutch_econ_win_survive_count: 99, clutch_econ_win_survive_save_measured: 99, clutch_econ_win_survive_save_impact: 999999 }, "nickstats.match/23");
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
  availability.add(negative, { clutch_econ_loss_die_count: 3, clutch_econ_loss_die_save_measured: 2, clutch_econ_loss_die_save_impact: -8000 }, "nickstats.match/26");
  assert.equal(summarize(negative).average, -4000);
  availability.add(zero, { clutch_econ_win_survive_count: 1, clutch_econ_win_survive_save_measured: 1, clutch_econ_win_survive_save_impact: 5000, clutch_econ_loss_die_count: 1, clutch_econ_loss_die_save_measured: 1, clutch_econ_loss_die_save_impact: -5000 }, "nickstats.match/26");
  assert.equal(summarize(zero).total, 0);
  availability.add(incomplete, { clutch_econ_loss_survive_count: 2 }, "nickstats.match/26");
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
    clutch_econ_win_survive_save_measured: 2, clutch_econ_win_survive_save_impact: 12000,
    clutch_econ_loss_die_count: 2, clutch_econ_loss_die_save_measured: 1, clutch_econ_loss_die_save_impact: -3000 }, "nickstats.match/26");
  for (const prefix of ["player", "combo"]) {
    ctx.window.NickStatsProfile.render({ prefix, headlineId: `${prefix}Headline`, side: "ALL", summary: { stats }, maps: [] });
    const target = elements.get(`${prefix}ClutchEconomicsStats`);
    assert.equal(target.children.length, 1);
    assert.equal(target.children[0].children[0].textContent, "Value vs save");
    assert.equal(target.children[0].children[1].textContent, "+$9,000");
    assert.equal(target.children[0].children[2].textContent, "+$3,000 per measured attempt");
    assert.match(elements.get(`${prefix}ClutchEconomicsCoverage`).textContent, /^3 of 5 clutch\/save attempts measured/);
  }
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.ok(html.includes('id="playerClutchEconomicsStats"'));
  assert.ok(!html.includes('id="playerClutchEconomicsTable"'));
});
