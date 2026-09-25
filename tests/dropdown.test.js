"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("shared dropdown loads before the match timeline and graph controls", () => {
  const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
  assert.ok(html.indexOf("./js/dropdown.js") < html.indexOf("./js/demo.js"));
  assert.ok(html.indexOf("./js/dropdown.js") < html.indexOf("./js/graphs.js"));
});

test("shared dropdown changes its select and mirrors disabled options", () => {
  const document = { activeElement: null, listeners: {},
    addEventListener(type, handler) { this.listeners[type] = handler; },
    createElement(tag) { return new Element(tag); }
  };
  class Element {
    constructor(tag) {
      this.tag = tag; this.children = []; this.listeners = {}; this.attributes = {};
      this.classList = { add() {} }; this.open = false;
    }
    append(...children) { children.forEach(child => { child.parent = this; this.children.push(child); }); }
    appendChild(child) { this.append(child); }
    replaceChildren(...children) { this.children = []; this.append(...children); }
    after(next) { this.next = next; }
    setAttribute(key, value) { this.attributes[key] = value; }
    getAttribute(key) { return this.attributes[key] || null; }
    addEventListener(type, handler) { this.listeners[type] = handler; }
    dispatchEvent(event) { this.listeners[event.type]?.(event); }
    focus() { document.activeElement = this; }
    contains(other) { return this === other || this.children.some(child => child.contains(other)); }
    querySelectorAll() { return this.children.filter(child => child.tag === "button" && !child.disabled); }
  }
  const select = new Element("select");
  select.options = [{ value: "bars", textContent: "Bars", disabled: false }, { value: "line", textContent: "Line", disabled: false }];
  select.value = "bars"; select.setAttribute("aria-label", "Display");
  let changes = 0; select.addEventListener("change", () => changes++);
  const context = { document, window: {}, Event };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../js/dropdown.js"), "utf8"), context);
  const dropdown = context.window.NickStatsDropdown;
  dropdown.enhance(select); dropdown.enhance(select);
  const details = select.next, [summary, menu] = details.children;
  assert.equal(summary.textContent, "Bars");
  details.open = true; details.dispatchEvent({ type: "toggle" });
  let stopped = false;
  menu.children[1].dispatchEvent({ type: "click", stopPropagation() { stopped = true; } });
  assert.equal(select.value, "line");
  assert.equal(summary.textContent, "Line");
  assert.equal(details.open, false);
  assert.equal(changes, 1);
  assert.equal(stopped, true);
  select.options[0].disabled = true; dropdown.sync(select);
  assert.equal(menu.children[0].disabled, true);
  details.open = true;
  document.listeners.pointerdown({ target: new Element("outside") });
  assert.equal(details.open, false);
});
