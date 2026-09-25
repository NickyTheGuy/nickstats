"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("bars and lines render for match trends and exact-round deaths", () => {
  const nodes = new Map();
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.listeners = {}; this.attributes = {}; this.style = { setProperty() {} }; this.hidden = false; this.value = ""; }
    get options() { return this.children.filter(child => child.tag === "option"); }
    appendChild(child) { this.children.push(child); }
    append(...children) { children.forEach(child => this.appendChild(child)); }
    replaceChildren(...children) { this.children = []; this.append(...children); }
    setAttribute(key, value) { this.attributes[key] = value; }
    getAttribute(key) { return this.attributes[key]; }
    removeAttribute(key) { delete this.attributes[key]; }
    addEventListener(key, callback) { this.listeners[key] = callback; }
    dispatch(key, event = {}) { this.listeners[key]?.(event); }
    querySelector(selector) { return selector === 'option[value="round"]' ? this.roundOption : selector === 'option[value="match"]' ? this.matchOption : null; }
    closest() { return null; }
    select() {}
    focus() { this.dispatch("focus"); }
  }
  const document = {
    getElementById: id => nodes.get(id) || null,
    createElement: tag => new Element(tag),
    createElementNS: (_, tag) => new Element(tag),
    addEventListener() {}
  };
  for (const name of ["Type", "TypeControl", "Metric", "Category", "Scope", "DistributionStyle", "DistributionStyleControl", "BucketControl", "BucketMode", "BucketStepper", "BucketCutoffs", "BucketHelp", "Suggestions", "Svg", "Summary", "Legend", "Note"]) {
    nodes.set(`playerGraph${name}`, new Element(name === "Category" ? "select" : "div"));
  }
  const type = nodes.get("playerGraphType"), scope = nodes.get("playerGraphScope");
  const display = nodes.get("playerGraphDistributionStyle"), svg = nodes.get("playerGraphSvg");
  type.value = "trend"; scope.value = "match"; scope.roundOption = { disabled: true }; scope.matchOption = { disabled: false }; display.value = "bars";
  const context = { window: { NickStatsAvailability: { scope: stats => stats }, NickStatsDropdown: { enhance() {}, sync() {} } }, document };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../js/round-timeline.js"), "utf8"), context);
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../js/graphs.js"), "utf8"), context);
  const series = [{ label: "Player", samples: [{ id: "1", date: 1234, stats: { rounds: 2, deaths: 1 } }], roundMatches: [
    { round_kills: [{ round: 1, kills: 0, deaths: 1, differential: -1 }, { round: 2, kills: 1, deaths: 0, differential: -2 }] }
  ] }];
  context.window.NickStatsGraphs.render({ prefix: "player", series });
  assert.ok(svg.children.some(child => child.tag === "rect" && child.attributes.class === "graph-series-bar"));
  const dated = [0, 1, 2].map(index => ({ label: `Player ${index}`, samples: [
    { id: "1", date: 1787356800, stats: { rounds: 20, kills: 15 + index, deaths: 10 } },
    { id: "2", date: 1787961600, stats: { rounds: 20, kills: 16 + index, deaths: 10 } }
  ] }));
  context.window.NickStatsGraphs.render({ prefix: "player", series: dated });
  const datedBars = svg.children.filter(child => child.tag === "rect" && child.attributes.class === "graph-series-bar");
  assert.equal(datedBars.length, 6);
  assert.ok(datedBars.every(bar => bar.attributes.x >= 68 && bar.attributes.x + bar.attributes.width <= 864));
  assert.ok(svg.children.some(child => child.tag === "text" && /Aug \d+/.test(child.textContent)));
  context.window.NickStatsGraphs.render({ prefix: "player", series });
  type.value = "distribution";
  nodes.get("playerGraphBucketMode").value = "custom";
  nodes.get("playerGraphBucketCutoffs").value = "1, 2, 3";
  nodes.get("playerGraphBucketMode").dispatch("change");
  assert.equal(svg.children.filter(child => child.tag === "rect" && child.attributes.class === "graph-series-bar").length, 4);
  assert.ok(svg.children.some(child => child.tag === "text" && child.textContent === "<1"));
  assert.ok(svg.children.some(child => child.tag === "text" && child.textContent === "≥3"));
  type.value = "trend";
  display.value = "line"; display.dispatch("change");
  assert.ok(svg.children.some(child => child.tag === "polyline" && child.attributes.class === "graph-series-line"));
  nodes.get("playerGraphMetric").focus();
  const deaths = nodes.get("playerGraphSuggestions").children.find(child => child.children[0].textContent === "Deaths");
  deaths.dispatch("pointerdown", { preventDefault() {}, stopPropagation() {} });
  scope.value = "round"; scope.dispatch("change");
  assert.equal(scope.roundOption.disabled, false);
  assert.equal(nodes.get("playerGraphDistributionStyleControl").hidden, false);
  assert.ok(svg.children.some(child => child.tag === "polyline" && child.attributes.class === "graph-series-line"));
  display.value = "bars"; display.dispatch("change");
  assert.equal(svg.children.filter(child => child.tag === "rect" && child.attributes.class === "graph-series-bar").length, 2);
  assert.match(nodes.get("playerGraphNote").textContent, /average deaths/);
  nodes.get("playerGraphMetric").focus();
  const differential = nodes.get("playerGraphSuggestions").children.find(child => child.children[0].textContent === "Round differential");
  differential.dispatch("pointerdown", { preventDefault() {}, stopPropagation() {} });
  assert.equal(scope.value, "round");
  assert.equal(scope.matchOption.disabled, true);
  assert.equal(svg.children.filter(child => child.tag === "rect" && child.attributes.class === "graph-series-bar").length, 2);
  assert.ok(svg.children.some(child => child.tag === "text" && child.textContent === "Average round differential"));
});
