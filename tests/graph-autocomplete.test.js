"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("axis pickers support independent category, search, and keyboard selection", () => {
  const nodes = new Map();
  class Element {
    constructor(tag = "div") { this.tag = tag; this.children = []; this.listeners = {}; this.attributes = {}; this.style = { setProperty() {} }; this.value = ""; this.hidden = false; }
    get options() { return this.children.filter(child => child.tag === "option"); }
    appendChild(child) { this.children.push(child); if (this.tag === "select" && this.options.length === 1) this.value = child.value; }
    append(...children) { children.forEach(child => this.appendChild(child)); }
    replaceChildren(...children) { this.children = []; this.append(...children); }
    setAttribute(key, value) { this.attributes[key] = value; }
    removeAttribute(key) { delete this.attributes[key]; }
    addEventListener(key, callback) { this.listeners[key] = callback; }
    dispatch(key, event = {}) { this.listeners[key]?.(event); }
    querySelector(selector) { return selector === 'option[value="round"]' ? this.roundOption : null; }
    querySelectorAll() { return this.children.filter(child => child.attributes.role === "option"); }
    closest() { return controls; }
    blur() {}
    select() {}
    focus() { this.dispatch("focus"); }
    scrollIntoView() {}
  }
  const controls = new Element(); controls.contains = element => element === controls;
  const document = {
    getElementById: id => {
      const find = node => node.id === id ? node : node.children.map(find).find(Boolean);
      return nodes.get(id) || [...nodes.values()].map(find).find(Boolean) || null;
    },
    createElement: tag => new Element(tag),
    addEventListener() {}
  };
  for (const name of ["XMetric", "XCategory", "XSuggestions", "XAxisControl", "MetricLabel", "Type", "Metric", "Category", "Scope", "DistributionStyle", "Suggestions", "Svg", "Summary", "Legend", "Note"]) {
    nodes.set(`playerGraph${name}`, new Element(name.endsWith("Category") ? "select" : "div"));
  }
  const type = nodes.get("playerGraphType"); type.value = "distribution";
  const scope = nodes.get("playerGraphScope"); scope.value = "match"; scope.roundOption = { disabled: true };
  const input = nodes.get("playerGraphMetric"), list = nodes.get("playerGraphSuggestions");
  const context = { window: { NickStatsAvailability: { scope: () => null }, NickStatsRoundTimeline: { averages: () => [] },
    NickStatsDropdown: { enhance() {}, sync() {} } }, document };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../js/graphs.js"), "utf8"), context);
  context.window.NickStatsGraphs.render({ prefix: "player", series: [] });
  assert.equal(input.value, "Rating");
  input.focus();
  const kills = list.children.find(child => child.children[0].textContent === "Kills");
  assert.ok(kills);
  let prevented = false;
  kills.dispatch("pointerdown", { preventDefault() { prevented = true; }, stopPropagation() {} });
  assert.equal(prevented, true);
  assert.equal(input.value, "Kills");
  assert.equal(scope.roundOption.disabled, false);
  assert.equal(list.hidden, true);
  type.value = "relationship"; type.dispatch("change");
  assert.equal(nodes.get("playerGraphMetricLabel").textContent, "Y-axis");
  const xInput = nodes.get("playerGraphXMetric"), xList = nodes.get("playerGraphXSuggestions"), xCategory = nodes.get("playerGraphXCategory");
  assert.equal(xInput.value, "Opening attempt rate");
  xInput.value = "ADR"; xInput.dispatch("input");
  assert.equal(xList.children.length, 1);
  xInput.dispatch("keydown", { key: "ArrowDown", preventDefault() {} });
  assert.match(xInput.attributes["aria-activedescendant"], /^playerGraphXSuggestion/);
  assert.equal(xList.children[0].attributes["aria-selected"], "true");
  xInput.dispatch("keydown", { key: "Enter", preventDefault() {} });
  assert.equal(xInput.value, "ADR"); assert.equal(input.value, "Kills");
  assert.equal(xList.hidden, true);
  xCategory.value = "Utility"; xCategory.dispatch("change");
  assert.ok(xList.children.some(child => child.children[0].textContent === "HE damage per round"));
  xInput.dispatch("keydown", { key: "Escape" });
  assert.equal(xInput.value, "ADR"); assert.equal(xCategory.value, "Core");
  type.value = "trend"; type.dispatch("change");
  assert.equal(nodes.get("playerGraphMetricLabel").textContent, "Statistic");
  assert.equal(nodes.get("playerGraphXAxisControl").hidden, true);
  context.window.NickStatsGraphs.render({ prefix: "player", series: [] });
  type.value = "relationship"; type.dispatch("change");
  assert.equal(xInput.value, "ADR"); assert.equal(input.value, "Kills");

});
