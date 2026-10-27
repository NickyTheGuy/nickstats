"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const read = file => fs.readFileSync(path.join(__dirname, "../", file), "utf8");
const source = read("js/quick-comparison.js"), playersSource = read("js/players.js"), groupsSource = read("js/groups.js");
class Node {
  constructor(text) { this.textContent = text; this.children = []; this.listeners = {}; this.attributes = {}; this.dataset = {}; this.classList = { toggle() {} }; }
  replaceChildren(...children) { this.children = children; }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.children.push(child); }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(key, callback) { this.listeners[key] = callback; }
  click() { this.listeners.click(); }
}
const functionSource = (source, name, next) => source.slice(source.indexOf(`  function ${name}(`), source.indexOf(`  function ${next}(`));

test("quick comparison map tabs contain only scoreboards and still filter their rows", () => {
  for (const prefix of ["player", "combo"]) {
    const nodes = new Map(), tables = [], state = { map: "ALL" };
    const sandbox = { state, prefix, onUpdate: null, viewMeta: {},
      byId: id => { if (!nodes.has(id)) nodes.set(id, new Node()); return nodes.get(id); },
      element: (_, text) => new Node(text), integer: String, titleCase: value => value,
      mapsFor: players => [...new Set(players.flatMap(player => player.rows.map(row => row.map)))],
      renderSections() {}, renderTable: rows => tables.push(rows)
    };
    const render = vm.runInNewContext(`${functionSource(source, "render", "reset")}\nrender`, sandbox);
    render({ players: [{ id: "1", rows: [{ map: "de_dust2" }, { map: "de_mirage" }] }], summarize: () => ({}) });
    assert.deepEqual(Array.from(sandbox.viewMeta.maps, row => row[1]), ["All maps", "dust2", "mirage"]);
    state.map = "de_dust2";
    render({ players: [{ id: "1", rows: [{ map: "de_dust2" }, { map: "de_mirage" }] }], summarize: () => ({}) });
    assert.equal(tables.at(-1)[0].rows.length, 1);
    assert.equal(nodes.size, 0, "the data model does not render DOM");
  }
});

test("Graphs selection preserves the active profile and hides profile and quick comparison panels", () => {
  let tabs;
  const node = new Node(), panels = ["profile", "quick", "graphs"].map(display => ({ dataset: { playerDisplayPanel: display } }));
  const state = { display: "profile", view: "matches", profiles: new Map([["1", { payload: { player: { name: "Nick" } } }], ["2", { payload: { player: { name: "Friend" } } }]]), activeId: "1" };
  const renders = [], sandbox = { state, window: { NickStatsNavigationUI: { player(props) { tabs = props; } } }, location: { hash: "#players" }, $: () => node, activeProfile: () => state.profiles.get(state.activeId),
    document: { querySelectorAll: () => panels },
    syncStatsToolbar() {}, renderCurrentDisplay: () => renders.push(state.display), activateProfile() {}, closeProfile() {}
  };
  const api = vm.runInNewContext(`${functionSource(playersSource, "setPlayerDisplay", "syncStatsToolbar")}\n${functionSource(playersSource, "renderOpenTabs", "renderProfile")}\n({setPlayerDisplay, renderOpenTabs})`, sandbox);
  api.renderOpenTabs();
  assert.deepEqual(Array.from(tabs.profiles, player => player.name), ["Nick", "Friend"]);
  tabs.onDisplay("graphs");
  assert.equal(state.display, "graphs"); assert.equal(state.activeId, "1"); assert.equal(state.view, "matches");
  assert.deepEqual(panels.map(panel => panel.hidden), [true, true, false]);
  assert.equal(tabs.display, "graphs"); tabs.onDisplay("quick");
  assert.deepEqual(renders, ["graphs", "quick"]);
});

test("standalone group graphs preserve player selection across redraws and cap it at five", () => {
  let choices;
  const nodes = new Map(), calls = [], current = { included: Array.from({ length: 6 }, (_, i) => ({ profileId: String(i), label: `Player ${i}` })) };
  const state = { graphPlayers: null, side: "CT", buy: "full", roundResult: "win", opponentBuy: "eco", roundPhase: "REGULATION", heroOnly: false };
  const sandbox = { state, ui: { comboGraphPlayerStatus: { update() {} } }, $: id => { if (!nodes.has(id)) nodes.set(id, new Node()); return nodes.get(id); }, el: (_, text) => new Node(text),
    comboProfileRows: (_, player) => [{ id: player.profileId, round_kills: [] }],
    window: { NickStatsPlayerSelectionUI: { graphs: (_target, props) => { choices = props; } },
      NickStatsGraphs: { samplesForMatches: (...args) => args, render: options => calls.push(options) },
      NickStatsRoundTimeline: { withDifferentials: rows => rows, matchesFilters: () => true } }
  };
  const render = vm.runInNewContext(`${functionSource(groupsSource, "renderComboGraphs", "runCombination")}\nrenderComboGraphs`, sandbox);
  render(current);
  assert.equal(calls.at(-1).prefix, "combo"); assert.equal(calls.at(-1).series.length, 5); assert.equal(calls.at(-1).domainSeries.length, 6);
  assert.deepEqual(Array.from(calls.at(-1).series[0].samples).slice(1), ["CT", "full", "win", "eco", "REGULATION", false]);
  assert.equal(choices.selected.length, 5);
  choices.onChange("5", true); assert.equal(state.graphPlayers.has("5"), false, "a sixth selection is rejected");
  choices.onChange("0", false);
  assert.equal(choices.selected.length, 4);
  choices.onChange("5", true);
  render(current);
  assert.ok(!calls.at(-1).series.some(player => player.id === "0")); assert.ok(calls.at(-1).series.some(player => player.id === "5"));
});
