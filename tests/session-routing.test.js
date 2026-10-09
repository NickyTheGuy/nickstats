"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../js/sessions.js"), "utf8");
const groupSource = fs.readFileSync(path.join(__dirname, "../js/match-sessions.js"), "utf8");
const flush = () => new Promise(resolve => setImmediate(resolve));
function setup(hash = "#session/1/100", fail = false) {
  const nodes = new Map(), events = new Map(), requests = [], renders = [];
  class Node {
    constructor() { this.children = []; this.dataset = {}; this.attributes = {}; this.listeners = {}; this.classList = { add() {}, remove() {} }; }
    append(...children) { children.forEach(child => { child.parent = this; this.children.push(child); }); }
    appendChild(child) { this.append(child); }
    setAttribute(key, value) { this.attributes[key] = value; }
    addEventListener(type, handler) { this.listeners[type] = handler; }
    remove() { this.parent.children = this.parent.children.filter(node => node !== this); }
  }
  const matches = [100,101,200].map((id, i) => ({ id, played_at: 1700000000 + [0,3600,18000][i], teammate_ids: [2,3], map: "de_dust2", marker: id }));
  const profile = { player: { id: 1, name: "Nick" }, matches };
  const window = {
    addEventListener(type, handler) { if (!events.has(type)) events.set(type, []); events.get(type).push(handler); },
    emit(type, detail) { events.get(type)?.forEach(handler => handler({ detail })); },
    NickStatsSessionUI: { create({ onRetry }) {
      const node = id => { if (!nodes.has(id)) nodes.set(id, new Node()); return nodes.get(id); };
      node("sessionRetry").listeners.click = onRetry;
      return {
        loading() { node("sessionContent").hidden = true; node("sessionRetry").hidden = true; node("sessionStatus").textContent = "Loading session…"; },
        error(message) { node("sessionStatus").textContent = message; node("sessionRetry").hidden = false; },
        render(input) { renders.push(input); node("sessionContent").hidden = false; node("sessionRetry").hidden = true; }
      };
    } },
    NickStatsQuickComparison: { create({ prefix }) { assert.equal(prefix, "session"); return { render: input => renders.push(input) }; } },
    NickStatsPlayerStats: { expandDenseProfile: payload => payload, sessionSummary: () => ({}) },
    NickStatsMatchBrowser: { showView(view) { window.emit("nickstats:match-browser-view", { view }); } }
  };
  let current = hash;
  const location = { get hash() { return current; }, set hash(value) { current = value; queueMicrotask(() => window.emit("hashchange")); } };
  const context = { window, location, URLSearchParams, AbortController,
    document: { createElement: () => new Node(), getElementById(id) { if (!nodes.has(id)) nodes.set(id, new Node()); return nodes.get(id); },
      querySelectorAll() { return nodes.get("matchBrowserTabs")?.children || []; } },
    fetch: async (url, options) => {
      requests.push({ url, signal: options.signal });
      if (fail) return { ok: false, status: 503, json: async () => ({ reason: "Offline" }) };
      const body = url.includes("/groups?") ? { players: [2,3].map(id => ({ id, name: `Teammate ${id}`, matches })) } : profile;
      return { ok: true, json: async () => body };
    }
  };
  vm.runInNewContext(groupSource, context); vm.runInNewContext(source, context);
  return { nodes, requests, renders, window, location, profile, setFailure(value) { fail = value; } };
}

test("cold session routes reconstruct the session and restrict every participant to exact match IDs", async () => {
  const app = setup(); await flush();
  assert.equal(app.renders.length, 1); assert.equal(app.renders[0].players.length, 3);
  for (const player of app.renders[0].players) assert.deepEqual(Array.from(player.rows, row => row.id).sort(), [100,101]);
  assert.match(app.renders[0].metaSuffix, /^Session · Nick/);
  assert.equal(app.nodes.get("matchBrowserTabs").children[0].children[0].textContent, "Session");
  app.window.emit("hashchange"); await flush(); assert.equal(app.requests.length, 2, "revisiting a loaded route uses its tab cache");
});

test("session links reuse the loaded profile, retain separate tabs, and restore them on history navigation", async () => {
  const app = setup("#players"); app.window.NickStatsSessions.open(1,100,app.profile); await flush();
  assert.equal(app.requests.length, 1); assert.ok(app.requests[0].url.includes("/groups?"));
  app.location.hash = "#session/1/200"; await flush();
  assert.equal(app.nodes.get("matchBrowserTabs").children.length, 2);
  assert.deepEqual(Array.from(app.renders.at(-1).players[0].rows, row => row.id), [200]);
  app.location.hash = "#session/1/100"; await flush();
  assert.deepEqual(Array.from(app.renders.at(-1).players[0].rows, row => row.id), [101,100]);
  const tabs = app.nodes.get("matchBrowserTabs").children;
  tabs[0].children[1].listeners.click(); await flush(); assert.equal(app.location.hash, "#session/1/200");
  app.nodes.get("matchBrowserTabs").children[0].children[1].listeners.click(); await flush(); assert.equal(app.location.hash, "#match");
});

test("failed session loads expose Retry and can recover without losing the routed tab", async () => {
  const app = setup(undefined,true); await flush();
  assert.match(app.nodes.get("sessionStatus").textContent, /Offline/); assert.equal(app.nodes.get("sessionRetry").hidden, false);
  app.setFailure(false); app.nodes.get("sessionRetry").listeners.click(); await flush();
  assert.equal(app.renders.length, 1); assert.equal(app.nodes.get("sessionRetry").hidden, true);
});

test("leaving a loading session aborts its request and prevents obsolete results from rendering", async () => {
  const app = setup(); app.location.hash = "#match"; await flush();
  assert.equal(app.requests[0].signal.aborted, true); assert.equal(app.renders.length, 0);
});


test("session requests scope teammate stats to the session before downloading them", async () => {
  const app = setup(); await flush();
  const query = new URLSearchParams(app.requests[1].url.split("?")[1]);
  assert.deepEqual(query.get("matches").split(",").sort(), ["100", "101"]);
  assert.equal(query.get("players"), "2,3");
  app.location.hash = "#session/1/200"; await flush();
  assert.equal(app.requests.filter(request => request.url.includes("/players/")).length, 1, "reuse the anchor history across cold-linked sessions");
  assert.equal(new URLSearchParams(app.requests.at(-1).url.split("?")[1]).get("matches"), "200");
});

test("single-teammate sessions use scoped comparisons rather than full profiles", async () => {
  const app = setup("#players");
  app.profile.matches.forEach(match => { match.teammate_ids = [2]; });
  app.window.NickStatsSessions.open(1, 100, app.profile); await flush();
  assert.equal(app.requests.length, 1);
  const query = new URLSearchParams(app.requests[0].url.split("?")[1]);
  assert.equal(query.get("players"), "2,1");
  assert.deepEqual(Array.from(app.renders[0].players, player => player.id), ["1", "2"]);
});

test("large sessions bound match requests and merge without duplicate participant rows", async () => {
  const app = setup("#players");
  app.profile.matches.splice(0, app.profile.matches.length, ...Array.from({ length: 101 }, (_, i) => ({ id: 1000 + i, played_at: 1700000000 + i * 60, teammate_ids: [2,3] })));
  app.window.NickStatsSessions.open(1, 1000, app.profile); await flush();
  assert.equal(app.requests.length, 2);
  assert.deepEqual(app.requests.map(request => new URLSearchParams(request.url.split("?")[1]).get("matches").split(",").length), [100,1]);
  assert.equal(app.renders[0].players.length, 3);
  for (const player of app.renders[0].players) {
    assert.equal(player.rows.length, 101);
    assert.equal(new Set(Array.from(player.rows, row => row.id)).size, 101);
  }
});
