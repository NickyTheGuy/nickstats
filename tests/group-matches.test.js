"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require("node:path").join(__dirname, "../js/groups.js"), "utf8");

function fixture() {
  const nodes = new Map(), calls = [], location = {};
  const state = { comboCondition: "without", result: "ALL", roundPhase: "ALL", heroOnly: false, matchListOffset: 0, matchListKey: "" };
  const matchEditor = match => ({ id: match.id });
  const context = { state, location, MATCH_LIST_LIMIT: 50,
    $: id => { if (!nodes.has(id)) nodes.set(id, {}); return nodes.get(id); },
    num: value => Number(value) || 0,
    matchResultMatches: (result, filter) => filter === "ALL" || result === filter,
    selectedView: row => ({ stats: { rounds: row.rounds } }),
    summarize: rows => ({ rating: 1.2, adr: 80, kills: rows[0].kills, deaths: 10, assists: 5 }),
    window: { NickStatsManualFilters: { matchEditor }, NickStatsMatchList: {
      render: (target, matches, onOpen, options) => calls.push({ target, matches, onOpen, options })
    } }
  };
  const start = source.indexOf("  function comboMatchesForCondition("), end = source.indexOf("  const { integer, decimal", start);
  const api = vm.runInNewContext(`${source.slice(start, end)}\n({comboProfileRows,renderComboMatches})`, context);
  return { state, nodes, calls, location, matchEditor, api };
}

test("Groups match list shows the selected player's current condition and result with tag actions", () => {
  const { state, nodes, calls, location, matchEditor, api } = fixture();
  const player = { profileId: "1", label: "Nick" }, other = { profileId: "2", label: "Friend" };
  const row = (id, result, date) => ({ id, result, date, map: "de_mirage", score: [13, 8], rounds: 21, kills: 20 });
  const match = value => ({ rows: [{ player, row: value }, { player: other, row: { ...value, kills: 8 } }] });
  const current = { matches: [match(row("10", "w", 100)), match(row("11", "l", 200))], comparisonMatches: [match(row("12", "w", 300))] };
  api.renderComboMatches(api.comboProfileRows(current, player), player);
  let rendered = calls.at(-1);
  assert.deepEqual(Array.from(rendered.matches, item => item.id), ["11", "10"]);
  assert.equal(rendered.matches[0].played_at, 200);
  assert.equal(rendered.matches[0].teams[0].score, 13);
  assert.equal(rendered.matches[0].viewer_stats.kills, 20);
  assert.equal(rendered.options.actionsFor, matchEditor);
  assert.equal(nodes.get("comboMatchesPagination").hidden, true);
  rendered.onOpen(rendered.matches[0]); assert.equal(location.hash, "#match/11");
  state.result = "w";
  api.renderComboMatches(api.comboProfileRows(current, player), player);
  assert.deepEqual(Array.from(calls.at(-1).matches, item => item.id), ["10"]);
  state.comboCondition = "with";
  api.renderComboMatches(api.comboProfileRows(current, other), other);
  assert.deepEqual(Array.from(calls.at(-1).matches, item => item.id), ["12"]);
  assert.equal(calls.at(-1).matches[0].viewer_stats.kills, 8);
  current.comparisonMatches = [];
  api.renderComboMatches(api.comboProfileRows(current, other), other);
  assert.equal(calls.at(-1).matches.length, 0);
  assert.equal(nodes.get("comboMatchesPageLabel").textContent, "");
  assert.match(nodes.get("comboMatchesStatus").textContent, /^0 qualifying matches/);
  assert.match(source, /renderComboMatches\(rows, player\);/);
});

test("Groups match pagination preserves the page for tag updates and resets on changed matches", () => {
  const { state, nodes, calls, api } = fixture(), player = { profileId: "1", label: "Nick" };
  const rows = Array.from({ length: 53 }, (_, index) => ({ id: String(index + 1), date: index, rounds: 20 }));
  api.renderComboMatches(rows, player);
  assert.equal(calls.at(-1).matches.length, 50);
  assert.equal(nodes.get("comboMatchesNext").disabled, false);
  state.matchListOffset = 50; api.renderComboMatches(rows, player);
  assert.deepEqual(Array.from(calls.at(-1).matches, item => item.id), ["3", "2", "1"]);
  assert.equal(nodes.get("comboMatchesPrevious").disabled, false);
  assert.equal(nodes.get("comboMatchesNext").disabled, true);
  api.renderComboMatches(rows, player); assert.equal(state.matchListOffset, 50);
  api.renderComboMatches(rows.slice(0, 3), player); assert.equal(state.matchListOffset, 0);
  state.heroOnly = true;
  api.renderComboMatches([{ id: "1", rounds: 0 }, { id: "2", rounds: 2 }], player);
  assert.deepEqual(Array.from(calls.at(-1).matches, item => item.id), ["2"]);
});
