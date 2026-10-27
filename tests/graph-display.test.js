"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("bars and lines render for match trends and exact-round deaths", async () => {
  const { createGraphSettings } = await import("../frontend/features/graphs/state/graph-settings.mjs");
  const { graphOutputModel } = await import("../frontend/features/graphs/state/graph-output.mjs");
  const { chartFrame, chartMark } = await import("../frontend/features/graphs/state/chart.mjs");
  let settings, output, svg;
  const nodes = new Map();
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.listeners = {}; this.attributes = {}; this.style = { setProperty() {} }; this.hidden = false; this.value = ""; }
    get options() { return this.children.filter(child => child.type === "option"); }
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
  for (const name of ["XMetric", "XCategory", "XSuggestions", "MetricLabel", "XAxisControl", "Type", "TypeControl", "Metric", "Category", "Scope", "DistributionStyle", "DistributionStyleControl", "BucketControl", "BucketMode", "BucketStepper", "BucketRange", "BucketManual", "BucketCutoffs", "BucketFrom", "BucketTo", "BucketIncrement", "Suggestions", "Svg", "Summary", "Legend", "Note"]) {
    nodes.set(`playerGraph${name}`, new Element(name === "Category" ? "select" : "div"));
  }
  nodes.set("playerGraphSettingsApp", new Element("div"));
  nodes.set("playerGraphChartApp", new Element("div"));
  const pickers = new Map();
  const choose = (label, axis = "y") => {
    const { config, callbacks } = pickers.get(axis), metric = config.choices.find(choice => choice.label === label);
    assert.ok(metric, `metric ${label}`);
    callbacks.onSelect({ metricId: metric.id, category: metric.group });
  };
  const context = { window: { NickStatsChartModel: {frame:chartFrame,mark:chartMark}, NickStatsChartUI: {render(_target, model) {svg=model;}}, NickStatsGraphOutputUI: { render(_prefix, input) { output = graphOutputModel(input); } }, NickStatsGraphSettingsUI: { create(_prefix, onChange) {
    settings = createGraphSettings(onChange); settings.set("type", "trend"); return settings;
  } }, NickStatsMetricPickerUI: {
    sync(_prefix, axis, config, callbacks) { pickers.set(axis, { config, callbacks }); },
    label(_prefix, label) { nodes.get("playerGraphMetricLabel").textContent = label; }
  }, NickStatsAvailability: { scope: stats => stats }, NickStatsDropdown: { enhance() {}, sync() {} } }, document };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../js/round-timeline.js"), "utf8"), context);
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../js/graphs.js"), "utf8"), context);
  const series = [{ label: "Player", samples: [{ id: "1", date: 1234, stats: { rounds: 2, deaths: 1 } }], roundMatches: [
    { round_kills: [{ round: 1, kills: 0, deaths: 1, differential: -1 }, { round: 2, kills: 1, deaths: 0, differential: -2 }] }
  ] }];
  context.window.NickStatsGraphs.render({ prefix: "player", series });
  assert.ok(svg.marks.some(child => child.type === "rect" && child.attributes.class === "graph-series-bar"));
  const dated = [0, 1, 2].map(index => ({ label: `Player ${index}`, samples: [
    { id: "1", date: 1787356800, stats: { rounds: 20, kills: 15 + index, deaths: 10 } },
    { id: "2", date: 1787961600, stats: { rounds: 20, kills: 16 + index, deaths: 10 } }
  ] }));
  context.window.NickStatsGraphs.render({ prefix: "player", series: dated });
  const datedBars = svg.marks.filter(child => child.type === "rect" && child.attributes.class === "graph-series-bar");
  assert.equal(datedBars.length, 6);
  assert.ok(datedBars.every(bar => bar.attributes.x >= 68 && bar.attributes.x + bar.attributes.width <= 864));
  assert.ok(svg.marks.some(child => child.type === "text" && /Aug \d+/.test(child.text)));
  const busy = Array.from({ length: 11 }, (_, index) => ({
    id: String(index + 1), date: 1787356800 + (index === 10 ? 60 : index) * 86400,
    stats: { rounds: 20, kills: 15 + index, deaths: 10 }
  }));
  const sparse = [busy[0], busy[10]];
  context.window.NickStatsGraphs.render({ prefix: "player", series: [
    { label: "Frequent", samples: busy }, { label: "Occasional", samples: sparse }
  ] });
  const groupedBars = svg.marks.filter(child => child.type === "rect" && child.attributes.class === "graph-series-bar")
    .sort((a, b) => a.attributes.x - b.attributes.x);
  assert.equal(groupedBars.length, 13);
  assert.ok(groupedBars.every((bar, index) => index === groupedBars.length - 1 || bar.attributes.x + bar.attributes.width <= groupedBars[index + 1].attributes.x));
  settings.set("style", "line");
  assert.equal(svg.marks.filter(child => child.type === "polyline" && child.attributes.class === "graph-series-line").length, 1);
  settings.set("style", "bars");
  context.window.NickStatsGraphs.render({ prefix: "player", series });
  settings.set("type", "distribution");
  settings.set("mode", "range");
  settings.range(0, "0");
  settings.range(1, "3");
  settings.range(2, "1");

  assert.equal(svg.marks.filter(child => child.type === "rect" && child.attributes.class === "graph-series-bar").length, 3);
  assert.equal(output.note, "");
  assert.ok(svg.marks.some(child => child.type === "text" && child.text === "0–<1"));
  assert.ok(svg.marks.some(child => child.type === "text" && child.text === "2–<3"));
  settings.range(0, ".1");

  assert.ok(svg.marks.some(child => child.type === "text" && child.text === "<0.1"));
  assert.equal(svg.marks.filter(child => child.type === "rect" && child.attributes.class === "graph-series-bar").length, 4);
  settings.set("mode", "manual");
  settings.manual("1, 2, 3");

  assert.equal(svg.marks.filter(child => child.type === "rect" && child.attributes.class === "graph-series-bar").length, 4);
  assert.ok(svg.marks.some(child => child.type === "text" && child.text === "<1"));
  assert.ok(svg.marks.some(child => child.type === "text" && child.text === "≥3"));
  assert.match(output.note, /comma-separated cutoffs/);
  assert.notEqual(output.note, "");
  settings.set("type", "trend");
  settings.set("style", "line");
  assert.ok(svg.marks.some(child => child.type === "circle" && child.attributes.class === "graph-point"));
  choose("Deaths");
  settings.set("scope", "round");
  assert.equal(settings.getSnapshot().supportsRounds, true);
  assert.ok(svg.marks.some(child => child.type === "polyline" && child.attributes.class === "graph-series-line"));
  settings.set("style", "bars");
  assert.equal(svg.marks.filter(child => child.type === "rect" && child.attributes.class === "graph-series-bar").length, 2);
  assert.match(output.note, /average deaths/);
  choose("Round differential");
  assert.equal(settings.getSnapshot().scope, "round");
  assert.equal(settings.getSnapshot().roundOnly, true);
  assert.equal(svg.marks.filter(child => child.type === "rect" && child.attributes.class === "graph-series-bar").length, 2);
  assert.ok(svg.marks.some(child => child.type === "text" && child.text === "Average round differential"));
  // A tag can drive X buckets, with the statistic remaining on Y.
  context.window.NickStatsManualFilters = { store: { account: "nick", ready: true,
    filters: [{ id: "sleep", name: "Sleep", kind: "number" }], stateFor: (_, id) => id === "1" ? 8.5 : "unknown" } };
  context.window.NickStatsGraphs.render({ prefix: "player", series });
  choose("Rating");
  choose("Sleep", "x");
  settings.set("type", "relationship");
  settings.set("mode", "auto");
  assert.equal(nodes.get("playerGraphXAxisControl").hidden, false);
  assert.equal(nodes.get("playerGraphMetricLabel").textContent, "Y-axis");
  assert.ok(svg.marks.some(child => child.type === "text" && child.text === "Sleep"));
  assert.ok(svg.marks.some(child => child.type === "text" && child.text === "Average Rating"));
  assert.equal(svg.marks.filter(child => child.type === "rect" && child.attributes.class === "graph-series-bar").length, 1);
  assert.ok(svg.marks.every(child => !Object.values(child.attributes).some(value => /NaN/.test(String(value)))));
  // The same tag also works as Y; missing assignments exclude match samples.
  choose("Sleep");
  choose("Rating", "x");
  assert.ok(svg.marks.some(child => child.type === "text" && child.text === "Average Sleep"));
  assert.equal(svg.marks.filter(child => child.type === "rect" && child.attributes.class === "graph-series-bar").length, 1);
  settings.set("type", "distribution");
  assert.equal(nodes.get("playerGraphMetricLabel").textContent, "Statistic");
  assert.equal(nodes.get("playerGraphXAxisControl").hidden, true);

  // Empty buckets split line segments, but must never create lines in bar mode.
  const sleep = { "1": .5, "2": 1.5, "3": 4.5, "4": 5.5 };
  context.window.NickStatsManualFilters.store.stateFor = (_, id) => sleep[id] ?? "unknown";
  choose("Kills");
  choose("Sleep", "x");
  settings.set("type", "relationship"); settings.set("style", "bars");
  context.window.NickStatsGraphs.render({ prefix: "player", series: [{ label: "Player", samples: [
    ...[1, 3, 5, 7].map((kills, index) => ({ id: String(index + 1), stats: { kills, rounds: 20 } })),
    { id: "unknown", stats: { kills: 1000, rounds: 20 } }
  ] }] });
  settings.set("mode", "manual");
  settings.manual("0, 1, 2, 3, 4, 5, 6");
  const marks = className => svg.marks.filter(child => child.attributes.class === className);
  assert.equal(marks("graph-series-bar").length, 4);
  assert.equal(marks("graph-series-line").length, 0);
  assert.equal(marks("graph-point").length, 0);
  const card = output.cards[0];
  assert.equal(card.label, "Player");
  assert.match(card.lines[0], /^X · Sleep: Mean 3(?:\.0+)? · Median 3/);
  assert.match(card.lines[1], /^Y · Kills: Mean 4 · Median 4 · SD 2 · Range 1–7$/);
  assert.equal(card.lines[2], "4 paired matches");
  settings.set("style", "line");
  assert.equal(marks("graph-series-bar").length, 0);
  assert.equal(marks("graph-point").length, 4);
  assert.equal(marks("graph-series-line").length, 2);
  settings.set("style", "bars");
  assert.equal(marks("graph-series-line").length, 0);
  settings.set("type", "distribution");
  assert.equal(output.cards[0].lines.length, 1);
  assert.match(output.cards[0].lines[0], /^Mean .* · n=5$/);

});
