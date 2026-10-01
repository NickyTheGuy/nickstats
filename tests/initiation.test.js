"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
const root = path.join(__dirname, "..");
const worker = fs.readFileSync(path.join(root, "js/demo-worker.js"), "utf8");
function context() {
  const ctx = vm.createContext({ importScripts() {}, self: { postMessage() {}, addEventListener() {} } });
  vm.runInContext(worker, ctx); return ctx;
}
const row = id => ({ userId: id, userIds: new Set([id]) });
const count = (player, key) => player.initiation?.[`initiation_${key}`] || 0;
const hit = (ctx, round, a, v, tick, options = {}) => ctx.noteInitiationContact(round, a, v, 2, 3, tick,
  options.damage ?? 20, options.kill ?? false, options.trade ?? false, options.interval ?? 1 / 64);

test("late contact without kill/death credits both teams' first participants", () => {
  const ctx = context(), r = ctx.freshRound(), a = row(0), v = row(1);
  hit(ctx, r, a, v, 6000);
  ctx.finishInitiationEngagements(r); ctx.finishInitiationEngagements(r);
  assert.equal(count(a, "damage_first"), 1);
  assert.equal(count(v, "damage_taken_first"), 1);
  assert.equal(count(a, "first_damage_dealt"), 20);
  assert.equal(count(v, "first_damage_taken"), 20);
  assert.equal(count(a, "nonlethal_contacts"), 1);
  assert.equal(count(v, "nonlethal_contacts"), 1);
});
test("unrelated simultaneous fights have separate initiators; joining a fight does not", () => {
  const ctx = context(), r = ctx.freshRound(), a = row(1), b = row(2), x = row(3), y = row(4), helper = row(5);
  hit(ctx, r, a, x, 10); hit(ctx, r, b, y, 10); hit(ctx, r, helper, x, 11);
  assert.equal(r.initiationEngagements.length, 2);
  assert.equal(count(a, "contacts"), 1); assert.equal(count(b, "contacts"), 1);
  assert.equal(count(helper, "contacts"), 0);
});
test("return damage, repeated hits and hurt-then-death count one contact", () => {
  const ctx = context(), r = ctx.freshRound(), a = row(1), v = row(2);
  hit(ctx, r, a, v, 100);
  ctx.noteInitiationContact(r, v, a, 3, 2, 120, 10, false, false, 1 / 64);
  hit(ctx, r, a, v, 121, { damage: 70 }); hit(ctx, r, a, v, 121, { damage: 0, kill: true });
  ctx.finishInitiationEngagements(r);
  assert.equal(count(a, "contacts"), 1); assert.equal(count(v, "contacts"), 1);
  assert.equal(count(a, "damage_first"), 1); assert.equal(count(v, "damage_first"), 0);
  assert.equal(count(a, "nonlethal_contacts"), 0); assert.equal(count(v, "nonlethal_contacts"), 0);
});
test("merging active fights preserves starter credits without duplicates", () => {
  const ctx = context(), r = ctx.freshRound(), a = row(1), b = row(2), x = row(3), y = row(4);
  hit(ctx, r, a, x, 10); hit(ctx, r, b, y, 11); hit(ctx, r, a, y, 12, { kill: true });
  assert.equal(r.initiationEngagements.length, 1);
  ctx.finishInitiationEngagements(r);
  for (const p of [a, b, x, y]) assert.equal(count(p, "contacts"), 1);
  assert.equal(count(b, "nonlethal_contacts"), 1); assert.equal(count(x, "nonlethal_contacts"), 1);
  assert.equal(count(a, "nonlethal_contacts"), 0); assert.equal(count(y, "nonlethal_contacts"), 0);
});
test("two-second lull permits another initiation while round participation counts once", () => {
  for (const hz of [64, 128]) {
    const ctx = context(), r = ctx.freshRound(), a = row(1), v = row(2), interval = 1 / hz;
    hit(ctx, r, a, v, 0, { interval }); hit(ctx, r, a, v, 2 * hz, { interval });
    assert.equal(count(a, "contacts"), 1);
    hit(ctx, r, a, v, 4 * hz + 1, { interval });
    assert.equal(count(a, "contacts"), 2); assert.equal(count(a, "rounds"), 1);
    const next = ctx.freshRound(); hit(ctx, next, a, v, 10, { interval });
    assert.equal(count(a, "rounds"), 2);
  }
});
test("initial trade windows and uninterrupted chains exclude both combat directions", () => {
  const ctx = context();
  const prior = { killer: 0, victim: 1, victimTeam: 3, tick: 100, engagementTicks: new Map() };
  const blocked = (a, v, as, vs, tick) => ctx.initiationTradeExchange([prior], a, v, as, vs, tick, 1 / 64);
  assert.equal(blocked(2, 0, 3, 2, 292), true);
  assert.equal(blocked(0, 2, 2, 3, 292), true);
  assert.equal(blocked(2, 0, 3, 2, 293), false);
  prior.engagementTicks.set(2, 300);
  assert.equal(blocked(2, 0, 3, 2, 420), true);
  assert.equal(blocked(0, 2, 2, 3, 420), true);
  assert.equal(blocked(2, 0, 3, 2, 429), false);
  assert.equal(blocked(2, 4, 3, 2, 110), false); // Separate opponent during same team's trade window.
});
test("excluded trade contacts do not become damage-first initiation on a follow-up hit", () => {
  const ctx = context(), r = ctx.freshRound(), a = row(1), v = row(2);
  hit(ctx, r, a, v, 0, { trade: true }); hit(ctx, r, a, v, 10);
  ctx.finishInitiationEngagements(r);
  assert.equal(count(a, "contacts"), 0); assert.equal(count(v, "nonlethal_contacts"), 0);
});
test("direct gunfight contact excludes grenades, fire, bomb and world damage", () => {
  const ctx = context();
  for (const weapon of ["hegrenade", "molotov", "inferno", "incgrenade", "c4", "world", ""]) assert.equal(ctx.isInitiationDirectWeapon(weapon), false);
  for (const weapon of ["ak47", "weapon_m4a1_silencer", "usp_silencer", "knife", "knife_butterfly", "taser"]) assert.equal(ctx.isInitiationDirectWeapon(weapon), true);
});
test("near-opponent misses sustain an established fight, distant shots do not", () => {
  const ctx = context(), r = ctx.freshRound(), a = row(1), v = row(2);
  const positions = new Map([[v.userId, { x: 100, y: 0, z: 0 }]]);
  hit(ctx, r, a, v, 0);
  ctx.refreshInitiationShot(r, a, positions, { x: 0, y: 0, z: 40 }, { x: 200, y: 0, z: 40 }, 120, 1 / 64);
  hit(ctx, r, a, v, 200); assert.equal(count(a, "contacts"), 1);
  ctx.refreshInitiationShot(r, a, positions, { x: 0, y: 1000, z: 40 }, { x: 200, y: 1000, z: 40 }, 310, 1 / 64);
  hit(ctx, r, a, v, 329); assert.equal(count(a, "contacts"), 2);
  const empty = ctx.freshRound(); ctx.refreshInitiationShot(empty, a, positions, { x: 0, y: 0, z: 40 }, { x: 200, y: 0, z: 40 }, 0, 1 / 64);
  assert.equal(empty.initiationEngagements.length, 0);
});
test("schema scopes exclude older matches from initiation totals and denominators", () => {
  const ctx = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync(path.join(root, "js/stat-availability.js"), "utf8"), ctx);
  const availability = ctx.window.NickStatsAvailability, stats = {};
  availability.add(stats, { rounds: 20, initiation_contacts: 6 }, "nickstats.match/25");
  availability.add(stats, { rounds: 30, initiation_contacts: 100 }, "nickstats.match/24");
  assert.equal(availability.value(stats, "initiation_contacts"), 6);
  assert.equal(availability.rounds(stats, "initiation_contacts"), 20);
  assert.equal(availability.available({ __schema: "nickstats.match/24", rounds: 30 }, "initiation_contacts"), false);
});
test("entry player keeps contact credit when a teammate secures the kill", () => {
  const ctx = context(), r = ctx.freshRound(), entry = row(1), helper = row(2), enemy = row(3);
  hit(ctx, r, entry, enemy, 0);
  hit(ctx, r, helper, enemy, 10, { kill: true });
  ctx.finishInitiationEngagements(r);
  assert.equal(count(entry, "contacts"), 1);
  assert.equal(count(entry, "nonlethal_contacts"), 1);
  assert.equal(count(helper, "contacts"), 0);
  assert.equal(count(enemy, "nonlethal_contacts"), 0);
});
test("compact initiation composes across side, phase, buy, enemy buy, result and hero filters", () => {
  const source = fs.readFileSync(path.join(root, "js/demo.js"), "utf8");
  const helpers = source.slice(source.indexOf("  function numberValue("), source.indexOf("  function setMatchBrowserView("));
  const economy = source.slice(source.indexOf("  function economyBuyType("), source.indexOf("  async function parseDemo()"));
  const ctx = vm.createContext({}); vm.runInContext(`${helpers}\n${economy}`, ctx);
  const stats = count => ({ rounds: [1, 1], initiation: { initiation_contacts: count, initiation_damage_first: count } });
  const slices = [
    { round: 24, side: "T", buy: "full", opponent_buy: "eco", result: "win", hero: false, stats: stats(2) },
    { round: 25, side: "CT", buy: "force", opponent_buy: "full", result: "loss", hero: true, stats: stats(3) }
  ];
  const payload = { schema: "nickstats.match/25", rounds: 25, players: [{ name: "Entry", sides: [stats(2), stats(3)], round_slices: slices }],
    teams: [{ id: "2", players: [0] }], round_timing: [], round_economy: [] };
  assert.equal(ctx.expandStoredMatch(payload, 1).teams[0].players[0].initiation.initiation_contacts, 5);
  assert.equal(ctx.expandStoredMatch(payload, 1, "REGULATION").teams[0].players[0].initiation.initiation_contacts, 2);
  const scoped = ctx.expandStoredMatch(payload, 1, "OVERTIME", true,
    { side: "CT", buy: "force", enemyBuy: "full", result: "loss" }).teams[0].players[0];
  assert.equal(scoped.initiation.initiation_contacts, 3);
  assert.equal(scoped.initiation_available, true);
  payload.schema = "nickstats.match/24";
  assert.equal(ctx.expandStoredMatch(payload, 1).teams[0].players[0].initiation_available, false);
});

test("Player and Groups focus on contacts and unique-round frequency using compatible rounds", () => {
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
  vm.runInContext(fs.readFileSync(path.join(root, "js/scoreboard.js"), "utf8"), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, "js/profile.js"), "utf8"), ctx);
  const stats = {};
  ctx.window.NickStatsAvailability.add(stats, { rounds: 20, initiation_contacts: 6, initiation_rounds: 4 }, "nickstats.match/25");
  ctx.window.NickStatsAvailability.add(stats, { rounds: 80 }, "nickstats.match/24");
  for (const prefix of ["player", "combo"]) {
    ctx.window.NickStatsProfile.render({ prefix, headlineId: `${prefix}Headline`, side: "ALL", summary: { stats }, maps: [] });
    const target = elements.get(`${prefix}InitiationContactStats`);
    assert.equal(target.children.length, 2);
    assert.equal(target.children[0].children[1].textContent, "6");
    assert.match(target.children[0].children[2].textContent, /^0\.30 per round/);
    assert.equal(target.children[1].children[1].textContent, "20.0%");
    assert.equal(target.children[1].children[2].textContent, "4 of 20 compatible rounds");
  }
});
