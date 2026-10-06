"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../js/match-sessions.js"), "utf8"), context);
const { group, filter, GAP_SECONDS } = context.window.NickStatsMatchSessions;
const match = (id, hour) => ({ id: String(id), played_at: Date.UTC(2026, 9, 5, hour) / 1000 });
const ids = sessions => Array.from(sessions, session => Array.from(session.matches, match => match.id));

test("sessions cross midnight and separate multiple sessions in one day", () => {
  const input = [match(6, 25), match(1, 10), match(4, 23), match(2, 11), match(5, 24), match(3, 15)];
  assert.deepEqual(ids(group(input)), [["6", "5", "4"], ["3"], ["2", "1"]]);
  assert.deepEqual(input.map(row => row.id), ["6", "1", "4", "2", "5", "3"]);
});
test("two-hour start gaps split exactly at the threshold", () => {
  const first = match(1, 10);
  assert.equal(group([first, { id: "2", played_at: first.played_at + GAP_SECONDS - 1 }]).length, 1);
  assert.equal(group([first, { id: "2", played_at: first.played_at + GAP_SECONDS }]).length, 2);
});
test("long sessions use consecutive gaps instead of total length", () => {
  const sessions = group(Array.from({ length: 30 }, (_, index) => match(index, index)));
  assert.equal(sessions.length, 1); assert.equal(sessions[0].matches.length, 30);
});
test("missing dates never get merged into sessions", () => {
  assert.deepEqual(ids(group([match(1, 10), { id: "2", played_at: null }, { id: "3", played_at: 0 }, { id: "4", played_at: "bad" }])), [["1"], ["4"], ["3"], ["2"]]);
  assert.equal(group([]).length, 0);
});
test("filters retain session boundaries even when middle games are hidden", () => {
  const sessions = group([match(1, 10), match(2, 11), match(3, 12), match(4, 15)]);
  const visible = filter(sessions, row => row.id !== "2");
  assert.deepEqual(ids(visible), [["4"], ["3", "1"]]);
  assert.equal(visible[1].start, sessions[1].start);
  assert.deepEqual(ids(sessions), [["4"], ["3", "2", "1"]]);
});

test("session history paginates whole sessions and keeps match opening and tags", () => {
  const source = fs.readFileSync(path.join(__dirname, "../js/players.js"), "utf8");
  class Node {
    constructor() { this.children = []; this.listeners = {}; this.classList = { remove() {} }; }
    append(...children) { this.children.push(...children); }
    appendChild(child) { this.children.push(child); }
    replaceChildren() { this.children = []; }
    addEventListener(type, listener) { this.listeners[type] = listener; }
    querySelector() { return null; }
  }
  const nodes = new Map(), calls = [];
  const sandbox = { window: { NickStatsMatchSessions: context.window.NickStatsMatchSessions, NickStatsManualFilters: { matchEditor: () => ({ open: false }) } },
    document: { createElement: () => new Node() }, MATCH_HISTORY_LIMIT: 25,
    $: id => { if (!nodes.has(id)) nodes.set(id, new Node()); return nodes.get(id); },
    manualFilter: { active: false, matches: () => true }, dateFilter: { matches: () => true },
    profileMatchSummaries: (_, rows) => rows, openHistoryMatch: () => {},
    aggregate: rows => ({ rating: 1.2, adr: 80, stats: { kills: rows.length * 20, deaths: rows.length * 10, assists: rows.length * 5 } }),
    matchList: { render: (list, matches, onOpen, options) => calls.push({ list, matches, onOpen, options }) }
  };
  const start = source.indexOf("  function renderPlayerSessions("), end = source.indexOf("  async function loadPlayerMatches", start);
  const render = vm.runInNewContext(`${source.slice(start, end)}\nrenderPlayerSessions`, sandbox);
  const profile = { payload: { matches: [
    ...Array.from({ length: 30 }, (_, index) => match(`long-${index}`, index)),
    ...Array.from({ length: 25 }, (_, index) => match(`single-${index}`, 40 + index * 3))
  ] } };
  render(profile);
  assert.equal(calls.length, 25);
  assert.equal(nodes.get("playerMatchesNext").disabled, false);
  profile.sessionHistoryOffset = 25; calls.length = 0; render(profile);
  assert.equal(calls.length, 1); assert.equal(calls[0].matches.length, 30);
  const preview = nodes.get("playerMatchesList").children[0].children[0].children[2];
  assert.deepEqual(preview.children.map(item => item.children[1].textContent), ["1.20", "600-300-150", "80.0"]);
  assert.equal(preview.children[0].children[1].className, "demo-rating rating-good");
  assert.equal(calls[0].onOpen, sandbox.openHistoryMatch);
  assert.equal(calls[0].options.actionsFor(calls[0].matches[0]).open, false);
  assert.equal(nodes.get("playerMatchesNext").disabled, true);
  assert.equal(nodes.get("playerMatchesPageLabel").textContent, "Sessions 26–26 of 26");
  assert.equal(nodes.get("playerMatchesStatus").textContent, "26 sessions · 55 matches");
  sandbox.dateFilter.matches = () => false; calls.length = 0; render(profile);
  assert.equal(calls.length, 0); assert.equal(profile.sessionHistoryOffset, 0);
  assert.equal(nodes.get("playerMatchesStatus").textContent, "0 sessions · 0 matches");
});
