"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../js/quick-comparison.js"), "utf8");
test("quick graphs stay in comparison, follow map filters, and preserve player choices", () => {
  class Node {
    constructor(text) { this.textContent = text; this.children = []; this.listeners = {}; this.attributes = {}; this.parentElement = {}; }
    replaceChildren() { this.children = []; }
    append(...children) { this.children.push(...children); }
    appendChild(child) { this.children.push(child); }
    setAttribute(key, value) { this.attributes[key] = value; }
    addEventListener(key, callback) { this.listeners[key] = callback; }
    click() { this.listeners.click(); }
  }
  for (const prefix of ["player", "combo"]) {
    const nodes = new Map(), calls = [], tables = [], state = { view: "table", map: "ALL", graphPlayers: null };
    const sandbox = { state, prefix,
      byId: id => { if (!nodes.has(id)) nodes.set(id, new Node()); return nodes.get(id); },
      element: (_, text) => new Node(text), integer: String, titleCase: value => value,
      mapsFor: players => [...new Set(players.flatMap(player => player.rows.map(row => row.map)))],
      renderSections() {}, renderTable: rows => tables.push(rows),
      window: { NickStatsGraphs: { samplesForMatches: rows => rows.map(row => ({ id: row.id })), render: options => calls.push(options) },
        NickStatsRoundTimeline: { withDifferentials: rows => rows, matchesFilters: () => true } }
    };
    const start = source.indexOf("    function renderGraphs("), end = source.indexOf("    function reset()", start);
    const render = vm.runInNewContext(`${source.slice(start, end)}\nrender`, sandbox);
    const input = { players: Array.from({ length: 6 }, (_, index) => ({ id: String(index), label: `Player ${index}`, rows: [
      { id: `${index}-dust`, map: "de_dust2", round_kills: [] }, { id: `${index}-mirage`, map: "de_mirage", round_kills: [] }
    ] })), summarize: () => ({}), graphOptions: { independent: prefix === "player" } };
    render(input);
    nodes.get("Maps").children.find(node => node.textContent === "dust2").click();
    nodes.get("Maps").children[0].click();
    assert.equal(state.view, "graphs");
    assert.equal(calls.at(-1).prefix, `${prefix}Quick`);
    assert.equal(calls.at(-1).series.length, 5);
    assert.ok(calls.at(-1).series.every(series => series.samples.length === 1 && series.samples[0].id.endsWith("-dust")));
    assert.equal(nodes.get("Table").parentElement.hidden, true);
    assert.equal(nodes.get("Sections").parentElement.hidden, true);
    assert.equal(nodes.get("Graphs").hidden, false);
    assert.equal(nodes.get("Maps").children[0].attributes["aria-selected"], "true");
    const choices = nodes.get("GraphPlayers");
    assert.equal(choices.children[5].children[0].disabled, true);
    const first = choices.children[0].children[0]; first.checked = false; first.listeners.change();
    assert.equal(calls.at(-1).series.length, 4);
    const sixth = choices.children[5].children[0]; assert.equal(sixth.disabled, false);
    sixth.checked = true; sixth.listeners.change(); assert.equal(calls.at(-1).series.length, 5);
    nodes.get("Maps").children.find(node => node.textContent === "All maps").click();
    assert.equal(state.view, "table"); assert.equal(nodes.get("Graphs").hidden, true);
    assert.equal(tables.at(-1)[0].rows.length, 2);
    nodes.get("Maps").children[0].click();
    assert.ok(!calls.at(-1).series.some(series => series.id === "0"));
    assert.ok(calls.at(-1).series.some(series => series.id === "5"));
  }
});
