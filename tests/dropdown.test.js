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

function touchControls() {
  const listeners = {};
  const button = {
    disabled: false, isConnected: true, clicks: 0,
    closest() { return this; }, contains(node) { return node === this || node === child; },
    click() { this.clicks++; }
  };
  const child = { closest() { return button; } };
  const document = {
    addEventListener(type, handler, options) { listeners[type] = { handler, options }; },
    elementFromPoint() { return this.hit; }, hit: child
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../js/dropdown.js"), "utf8"), { document, window: {} });
  const finger = (x = 20, y = 20, identifier = 1) => ({ clientX: x, clientY: y, identifier });
  function send(type, overrides = {}) {
    const event = {
      target: child, touches: type === "touchend" ? [] : [finger()],
      changedTouches: [finger()], cancelable: true, prevented: false,
      preventDefault() { this.prevented = true; }, ...overrides
    };
    listeners[type].handler(event); return event;
  }
  return { button, child, document, listeners, finger, send };
}

test("menu taps activate once even without a compatibility click, including taps on button children", () => {
  const { button, listeners, send } = touchControls();
  send("touchstart");
  const release = send("touchend");
  assert.equal(button.clicks, 1);
  assert.equal(release.prevented, true, "cancel the browser's follow-up mouse click");
  assert.equal(listeners.touchend.options.passive, false);
  send("touchend");
  assert.equal(button.clicks, 1, "a release without a new tap must not activate again");
});

test("scrolls, swipes, cancelled gestures and multitouch do not activate menu buttons", () => {
  const { button, finger, send } = touchControls();
  for (const interrupt of [
    () => send("touchmove", { touches: [finger(20, 60)] }),
    () => send("scroll"),
    () => send("touchcancel"),
    () => send("touchstart", { touches: [finger(), finger(40, 40, 2)] })
  ]) {
    send("touchstart"); interrupt();
    const release = send("touchend");
    assert.equal(button.clicks, 0);
    assert.equal(release.prevented, false, "preserve native gesture behavior");
  }
});

test("disabled or replaced buttons and releases outside the button are not activated", () => {
  for (const change of [
    ({ button }) => { button.disabled = true; },
    ({ button }) => { button.isConnected = false; },
    ({ document }) => { document.hit = null; }
  ]) {
    const controls = touchControls(); controls.send("touchstart"); change(controls);
    assert.equal(controls.send("touchend").prevented, false);
    assert.equal(controls.button.clicks, 0);
  }
});

test("native inputs and buttons outside menus retain the browser's touch handling", () => {
  const { button, send } = touchControls();
  for (const target of [{ closest() { return null; } }, { closest() { return { closest() { return null; } }; } }]) {
    send("touchstart", { target });
    assert.equal(send("touchend", { target }).prevented, false);
    assert.equal(button.clicks, 0);
  }
  send("touchstart");
  assert.equal(send("touchend", { cancelable: false }).prevented, false);
  assert.equal(button.clicks, 0);
});
