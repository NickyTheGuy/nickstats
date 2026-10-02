"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("axis pickers support independent category, search, and keyboard selection", () => {
  const nodes = new Map();
  class Element {
    constructor(tag = "div") { this.tag = tag; this.children = []; this.listeners = {}; this.attributes = {}; this.style = { setProperty() {} }; this.value = ""; this.hidden = false; this.classList = { add() {} }; }
    get options() { return this.children.filter(child => child.tag === "option"); }
    appendChild(child) { child.parent = this; this.children.push(child); if (this.tag === "select" && this.options.length === 1) this.value = child.value; }
    append(...children) { children.forEach(child => this.appendChild(child)); }
    replaceChildren(...children) {
      // Model the focus loss caused by dropdown.sync removing its focused option.
      if (document.activeElement && this.contains(document.activeElement)) {
        document.activeElement.dispatch("focusout", { relatedTarget: null, bubbles: true });
        document.activeElement = null;
      }
      this.children = []; this.append(...children);
    }
    after(next) { this.next = next; this.parent?.appendChild(next); }
    contains(other) { return this === other || this.children.some(child => child.contains(other)); }
    getAttribute(key) { return this.attributes[key] || null; }
    setAttribute(key, value) { this.attributes[key] = value; }
    removeAttribute(key) { delete this.attributes[key]; }
    addEventListener(key, callback) { this.listeners[key] = callback; }
    dispatch(key, event = {}) { this.listeners[key]?.(event); if (event.bubbles) this.parent?.dispatch(key, event); }
    dispatchEvent(event) { this.dispatch(event.type, event); }
    querySelector(selector) { return selector === 'option[value="round"]' ? this.roundOption : null; }
    querySelectorAll() { return this.children.filter(child => child.attributes.role === "option"); }
    closest() { return this.parent; }
    blur() { this.dispatch("focusout", { relatedTarget: null, bubbles: true }); document.activeElement = null; }
    select() {}
    focus() {
      document.activeElement?.dispatch("focusout", { relatedTarget: this, bubbles: true });
      document.activeElement = this; this.dispatch("focus");
    }
    scrollIntoView() {}
  }
  const document = { activeElement: null,
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
  for (const axis of ["", "X"]) {
    const controls = new Element();
    for (const part of ["Metric", "Category", "Suggestions"]) controls.appendChild(nodes.get(`playerGraph${axis}${part}`));
  }
  const type = nodes.get("playerGraphType"); type.value = "distribution";
  const scope = nodes.get("playerGraphScope"); scope.value = "match"; scope.roundOption = { disabled: true };
  const input = nodes.get("playerGraphMetric"), list = nodes.get("playerGraphSuggestions");
  const context = { window: { NickStatsAvailability: { scope: () => null }, NickStatsRoundTimeline: { averages: () => [] },
    }, document, Event };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../js/dropdown.js"), "utf8"), context);
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
  assert.equal(xInput.value, "ADR"); assert.equal(xCategory.value, "Utility");
  type.value = "trend"; type.dispatch("change");
  assert.equal(nodes.get("playerGraphMetricLabel").textContent, "Statistic");
  assert.equal(nodes.get("playerGraphXAxisControl").hidden, true);
  context.window.NickStatsGraphs.render({ prefix: "player", series: [] });
  type.value = "relationship"; type.dispatch("change");
  assert.equal(xInput.value, "ADR"); assert.equal(input.value, "Kills");
  // Exercise the actual shared dropdown after selecting a search result, on both axes.
  for (const axis of ["", "X"]) {
    const field = nodes.get(`playerGraph${axis}Metric`), category = nodes.get(`playerGraph${axis}Category`);
    const suggestions = nodes.get(`playerGraph${axis}Suggestions`);
    field.value = "ADR"; field.dispatch("input");
    suggestions.children[0].dispatch("pointerdown", { preventDefault() {}, stopPropagation() {} });
    const chooseCategory = name => {
      const menu = category.next.children[1];
      const button = menu.children.find(child => child.textContent === name);
      button.focus(); button.dispatch("click", { stopPropagation() {} });
      assert.equal(category.value, name);
      assert.equal(category.next.children[0].textContent, name);
    };
    chooseCategory("Utility");
    assert.equal(field.value, "");
    assert.ok(suggestions.children.some(child => child.children[0].textContent === "Damage-assisted kills"));
    chooseCategory("Opening");
    assert.ok(suggestions.children.some(child => child.children[0].textContent === "Opening kills per round"));
    field.value = "Kills"; field.dispatch("input");
    suggestions.children.find(child => child.children[0].textContent === "Kills")
      .dispatch("pointerdown", { preventDefault() {}, stopPropagation() {} });
    field.value = ""; field.dispatch("input"); field.blur();
    assert.equal(field.value, "");
    context.window.NickStatsGraphs.render({ prefix: "player", series: [] });
    assert.equal(field.value, "");
    field.focus();
    assert.ok(suggestions.children.some(child => child.children[0].textContent === "Kills"));
  }
});
