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
const matchSorts = vm.runInNewContext(`${demoSource.slice(demoSource.indexOf("  const sortSpecs ="), demoSource.indexOf("  function setStatus("))}\nsortSpecs`, { Scoreboard });

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

test("match body groups match header order with Initiation and Trades independently visible or expanded", () => {
  class Node {
    constructor() {
      this.dataset = {}; this.children = []; this.className = "";
      this.classList = { add: (...names) => { this.className += ` ${names.join(" ")}`; }, contains: name => this.className.split(/\s+/).includes(name) };
    }
    appendChild(node) { this.children.push(node); }
    get cells() { return this.children; }
  }
  const state = { expandedGroups: {}, scoreboardValueMode: "totals", visibleScoreboardSections: new Set(), scoreboardPerGrenadeUtility: false };
  const context = {
    state, Scoreboard, document: { createElement: () => new Node() },
    SCOREBOARD_GROUPS: Scoreboard.groups, SCOREBOARD_GROUP_SECTION: Scoreboard.groupSection,
    numberValue: value => Number(value) || 0, scoreboardFocus: (group, values) => Scoreboard.focus({ expanded: state.expandedGroups, subgroups: state.subgroups || {} }, group, values),
    activeScoreboardSubgroup: group => Scoreboard.activeSubgroup({ subgroups: state.subgroups || {} }, group),
    clutchResult: () => "0/0", speedValue: () => "—",
    enemyFlashMatchups: () => [], teammateFlashMatchups: () => [], selfFlashMatchups: () => []
  };
  const slice = (start, end) => demoSource.slice(demoSource.indexOf(`  function ${start}(`), demoSource.indexOf(`  function ${end}(`));
  const render = vm.runInNewContext(`${slice("cell", "speedValue")}\n${slice("scoreboardGroupVisible", "renderScoreboardControls")}\n${slice("playerRow", "regularHeader")}\nplayerRow`, context);
  const player = { name: "Nick", rating: 1.2, rounds_played: 10, kast: 80, headshot_percent: 50, adr: 100,
    trade_kills: 7, traded_deaths: 5, trade_opportunities: 9,
    initiation_available: true, initiation: { initiation_kills: 3, initiation_deaths: 1, initiation_contacts: 8, initiation_rounds: 4 } };
  for (const mode of ["totals", "round"]) for (const initiation of [false, true]) for (const trades of [false, true]) {
    for (const initiationExpanded of [false, true]) for (const tradesExpanded of [false, true]) {
      state.scoreboardValueMode = mode;
      state.visibleScoreboardSections = new Set(Scoreboard.sections.map(([key]) => key).filter(key => key !== "initiation" && key !== "trades"));
      if (initiation) state.visibleScoreboardSections.add("initiation");
      if (trades) state.visibleScoreboardSections.add("trades");
      state.expandedGroups = { initiation: initiationExpanded, trades: tradesExpanded };
      const row = render(player);
      const groupCells = row.cells.filter(cell => cell.classList.contains("demo-group-cell"));
      const expected = Array.from(Scoreboard.groups).filter(([group]) => state.visibleScoreboardSections.has(Scoreboard.groupSection[group]))
        .flatMap(([group]) => Array(state.expandedGroups[group] ? Scoreboard.columns[group][0].length : 1).fill(group));
      assert.deepEqual(groupCells.map(cell => Scoreboard.groups.find(([group]) => cell.classList.contains(`${group}-cell`))[0]), expected);
      const initiationCells = row.cells.filter(cell => cell.classList.contains("initiation-cell"));
      const tradeCells = row.cells.filter(cell => cell.classList.contains("trades-cell"));
      if (initiation) assert.equal(String(initiationCells[0].textContent), initiationExpanded ? mode === "round" ? "0.80" : "8" : "40.0%");
      if (initiation && initiationExpanded) assert.equal(initiationCells[1].textContent, "40.0%");
      if (trades) assert.equal(String(tradeCells[0].textContent), tradesExpanded ? mode === "round" ? "0.90" : "9" : mode === "round" ? "0.70-0.50" : "7-5");
    }
  }
  state.expandedGroups = { clutches: true };
  state.visibleScoreboardSections = new Set(["rounds"]);
  state.subgroups = { clutches: "economics" };
  player.clutch_economics = { win_survive_count: 2, win_survive_ct1_count: 2, win_survive_ct1_forecast: 2,
    win_survive_ct1_victory: 14000, win_survive_ct1_victory_dead: 14000,
    loss_die_count: 3, loss_die_ct1_count: 3, loss_die_ct1_forecast: 1,
    loss_die_ct1_victory: 7000, loss_die_ct1_victory_dead: 7000 };
  for (const mode of ["totals", "round"]) {
    state.scoreboardValueMode = mode;
    assert.deepEqual(render(player).cells.filter(cell => cell.classList.contains("clutches-cell")).map(cell => cell.textContent),
      ["+$2,800", "—", "—", "—", "—", "+$2,800"]);
    assert.deepEqual(render({ ...player, clutch_economics_available: false }).cells.filter(cell => cell.classList.contains("clutches-cell")).map(cell => cell.textContent),
      Array(6).fill("—"));
  }
});

test("first-contact round percentage sorts by frequency and excludes missing matches", () => {
  const highFrequency = { initiation_available: true, rounds_played: 10, initiation: { initiation_rounds: 6, initiation_contacts: 8 } };
  const highVolume = { initiation_available: true, rounds_played: 100, initiation: { initiation_rounds: 30, initiation_contacts: 50 } };
  assert.equal(matchSorts.initiationRoundPercent.modes[0].value(highFrequency), 60);
  assert.equal(matchSorts.initiationRoundPercent.modes[0].value(highVolume), 30);
  assert.equal(matchSorts.initiationRoundPercent.modes[0].value({ rounds_played: 10 }), null);
  assert.equal(matchSorts.initiationRoundPercent.modes[0].value({ ...highFrequency, rounds_played: 0 }), null);
});

test("clutch economics pools measured outcomes and cycles matching columns and widths", () => {
  const counters = { win_survive_count: 2, win_survive_ct1_count: 2, win_survive_ct1_forecast: 2,
    win_survive_ct1_victory: 14000, win_survive_ct1_victory_dead: 14000,
    loss_die_count: 3, loss_die_ct1_count: 3, loss_die_ct1_forecast: 1,
    loss_die_ct1_victory: 7000, loss_die_ct1_victory_dead: 7000 };
  const summary = Scoreboard.clutchEconomics(counters);
  assert.equal(summary.attempted, 5);
  assert.equal(summary.measured, 3);
  assert.equal(summary.total, 8400);
  assert.equal(summary.average, 2800);
  assert.equal(Scoreboard.clutchEconomics({ loss_die_count: 2 }).total, null);
  const layout = { expanded: { clutches: true }, subgroups: {} };
  assert.equal(Scoreboard.focus(layout, "clutches", Scoreboard.columns.clutches[0]).length, 5);
  Scoreboard.cycle(layout, "clutches");
  assert.deepEqual(Array.from(Scoreboard.focus(layout, "clutches", Scoreboard.columns.clutches[0])),
    ["All / attempt", "1v5 / attempt", "1v4 / attempt", "1v3 / attempt", "1v2 / attempt", "1v1 / attempt"]);
  assert.equal(Scoreboard.minimumWidths(layout, "clutches").length, 6);
  for (const [field, expected] of [["average", 2800], ["size1", 2800], ["size5", null]]) {
    const spec = matchSorts[`clutchEconomics_${field}`];
    assert.equal(spec.modes[0].value({ clutch_economics: counters }), expected);
    assert.equal(spec.modes[0].value({ clutch_economics: counters, clutch_economics_available: false }), null);
  }
});

test("quick comparison economics columns preserve dollars and sample coverage in every value mode", () => {
  const state = { expandedGroups: { clutches: true }, valueMode: "totals" };
  const layout = { expanded: state.expandedGroups, subgroups: { clutches: "economics" } };
  const context = { state, Scoreboard, number: value => Number(value) || 0,
    integer: value => String(Number(value) || 0), titleCase: value => value,
    availability: { scope: stats => stats.economics },
    focusedColumns: (group, values) => Scoreboard.focus(layout, group, values),
    groupVisible: group => group === "clutches",
    minimumWidthsForGroup: group => Scoreboard.minimumWidths(layout, group) };
  const start = quickSource.indexOf("    function renderTable(");
  const end = quickSource.indexOf("      const sort = state.sort;", start);
  const helpers = quickSource.slice(quickSource.indexOf("    function columnScalesWithValueMode("),
    quickSource.indexOf("    function measuredColumnWidths("));
  const api = vm.runInNewContext(`${helpers}\n${quickSource.slice(start, end)}\nreturn columns; }\n({renderTable, displayedValue, displayedLabel, columnSortValue})`, context);
  const item = { rows: [{}, {}], stats: { rounds: 40, economics: {
    clutch_econ_win_survive_count: 2, clutch_econ_win_survive_ct1_count: 2, clutch_econ_win_survive_ct1_forecast: 2,
    clutch_econ_win_survive_ct1_victory: 14000, clutch_econ_win_survive_ct1_victory_dead: 14000,
    clutch_econ_loss_die_count: 3, clutch_econ_loss_die_ct1_count: 3, clutch_econ_loss_die_ct1_forecast: 1,
    clutch_econ_loss_die_ct1_victory: 7000, clutch_econ_loss_die_ct1_victory_dead: 7000 } } };
  const columns = api.renderTable([item]).filter(column => column.group === "clutches");
  assert.equal(columns.length, 6);
  for (const mode of ["totals", "round", "match"]) {
    state.valueMode = mode;
    assert.deepEqual(Array.from(columns, column => api.displayedValue(column, item)), ["+$2,800", "—", "—", "—", "—", "+$2,800"]);
    assert.deepEqual(Array.from(columns, column => api.columnSortValue(column, item)), [2800, null, null, null, null, 2800]);
    assert.deepEqual(Array.from(columns, column => api.displayedLabel(column)), ["All / attempt", "1v5 / attempt", "1v4 / attempt", "1v3 / attempt", "1v2 / attempt", "1v1 / attempt"]);
    assert.deepEqual(Array.from(columns, column => api.displayedValue(column, { rows: [], stats: {} })), Array(6).fill("—"));
  }
});
