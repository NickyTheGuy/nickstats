const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const worker = fs.readFileSync(path.join(__dirname, "../js/demo-worker.js"), "utf8");
const context = vm.createContext({ console, importScripts() {}, self: { addEventListener() {}, deademCs2: {}, postMessage() {} } });
vm.runInContext(worker, context);
// Build the sets inside the VM to match the freeze-end inventory snapshot.
const holder = (buy, equipment) => {
  context.sample = equipment;
  context.buy = buy;
  return vm.runInContext("heroHolder(sample.map(([value, weapons], row) => ({row, value, weapons: weapons && new Set(weapons)})), buy)", context);
};

test("a saved or dropped lone rifle is a hero on either low-buy category", () => {
  const players = [[3500, ["ak47", "glock"]], [900, ["deagle"]], [400, ["glock"]]];
  assert.equal(holder("force", players), 0);
  assert.equal(holder("eco", players), 0);
  assert.equal(holder("full", players), null);
});

test("two primary weapons, an SMG alone, or missing inventory cannot mark a hero", () => {
  assert.equal(holder("force", [[3500, ["awp"]], [1200, ["mp9"]]]), null);
  assert.equal(holder("force", [[3500, ["awp"]], [4000, ["ak47"]]]), null);
  assert.equal(holder("eco", [[2100, ["mac10"]], [200, ["glock"]]]), null);
  assert.equal(holder("force", [[3500, ["awp"]], [0, null]]), null);
});

test("Hero profile slice combines eco and force holders without counting aggregate slices twice", () => {
  const source = fs.readFileSync(path.join(__dirname, "../js/players.js"), "utf8");
  const start = source.indexOf("  function economyRowMatches(");
  const end = source.indexOf("  function matchView(", start);
  const profile = vm.createContext({});
  vm.runInContext(`${source.slice(start, end)}; this.matches = economyRowMatches`, profile);
  const slice = (buy, enemy, result, hero = true) => ({ buy_type: buy, opponent_buy_type: enemy, round_result: result, hero, round_phase: "ALL" });
  assert.equal(profile.matches(slice("ALL", "ALL", "ALL"), "hero", "ALL", "ALL", "ALL", true), true);
  assert.equal(profile.matches(slice("force", "ALL", "ALL"), "hero", "ALL", "ALL", "ALL", true), false);
  assert.equal(profile.matches(slice("eco", "full", "win"), "hero", "full", "ALL", "ALL", true), true);
  assert.equal(profile.matches(slice("force", "full", "loss"), "hero", "full", "ALL", "ALL", true), true);
  assert.equal(profile.matches(slice("full", "full", "win"), "hero", "full", "ALL", "ALL", true), false);
  assert.equal(profile.matches(slice("eco", "full", "win", false), "hero", "full", "ALL", "ALL", true), false);
});

test("Hero graph and timeline include both low-buy holder rounds", () => {
  const availabilitySource = fs.readFileSync(path.join(__dirname, "../js/stat-availability.js"), "utf8");
  const graphSource = fs.readFileSync(path.join(__dirname, "../js/graphs.js"), "utf8");
  const graph = vm.createContext({ window: {}, document: {} });
  vm.runInContext(availabilitySource, graph); vm.runInContext(graphSource, graph);
  const sides = [
    { side: "T", buy_type: "ALL", opponent_buy_type: "ALL", round_result: "ALL", round_phase: "ALL", hero: true, stats: { rounds: 2, kills: 3 } },
    { side: "T", buy_type: "eco", opponent_buy_type: "full", round_result: "win", round_phase: "ALL", hero: true, stats: { rounds: 1, kills: 1 } },
    { side: "T", buy_type: "force", opponent_buy_type: "full", round_result: "loss", round_phase: "ALL", hero: true, stats: { rounds: 1, kills: 2 } }
  ];
  const sample = { id: 42, schema: "nickstats.match/23", sides };
  assert.equal(graph.window.NickStatsGraphs.statsForMatch(sample, "T", "hero", "ALL", "ALL", "ALL", true).rounds, 2);
  assert.equal(graph.window.NickStatsGraphs.statsForMatch(sample, "T", "hero", "ALL", "full", "ALL", true).kills, 3);

  const timelineContext = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/round-timeline.js"), "utf8"), timelineContext);
  const timeline = timelineContext.window.NickStatsRoundTimeline;
  assert.equal(timeline.matchesFilters({ round: 1, buy: "eco", hero: true }, { buy: "hero" }), true);
  assert.equal(timeline.matchesFilters({ round: 2, buy: "force", hero: true }, { buy: "hero" }), true);
  assert.equal(timeline.matchesFilters({ round: 3, buy: "full", hero: false }, { buy: "hero" }), false);
});

test("match scoreboard reads the hero holder aggregate and enemy matchup", () => {
  const source = fs.readFileSync(path.join(__dirname, "../js/demo.js"), "utf8");
  const start = source.indexOf("  function teamsForSide(result) {");
  const end = source.indexOf("  function setSideFilter(", start);
  const player = { kills: 3, round_wins: 1, by_side: { T: { kills: 3 } },
    by_economy_matchup: { full: { ALL: { ALL: { ALL: { kills: 3, round_wins: 1 } } } } } };
  const teams = [{ score: 13, players: [player] }];
  const state = { sideFilter: "ALL", buyFilter: "hero", heroOnly: true, enemyBuyFilter: "ALL",
    roundResultFilter: "ALL", roundPhaseFilter: "ALL", storedPayload: {} };
  const detail = vm.createContext({ state, expandStoredMatch: () => ({ teams }), compactMatchResult: () => ({}) });
  vm.runInContext(`${source.slice(start, end)}; this.teamsForSide = teamsForSide`, detail);
  assert.equal(detail.teamsForSide({ teams })[0].players[0].kills, 3);
  assert.equal(detail.teamsForSide({ teams })[0].score, null);
  state.enemyBuyFilter = "full";
  assert.equal(detail.teamsForSide({ teams })[0].players[0].kills, 3);
});
