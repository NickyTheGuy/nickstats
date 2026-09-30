"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../js/manual-filters.js"), "utf8");
function api() {
  const context = vm.createContext({ window: { addEventListener() {} }, document: { addEventListener() {} }, fetch() { throw new Error("Unexpected fetch"); } });
  vm.runInContext(source, context);
  return context.window.NickStatsManualFilters;
}
const response = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const flush = () => new Promise(resolve => setImmediate(resolve));

test("all older uploads default to Unknown and later uploads default to False regardless of played date", () => {
  const { matchState } = api(), filter = { id: "a", cutoff_match_id: 100 }, assignments = new Map();
  for (const id of [1, 50, 99, 100]) assert.equal(matchState(filter, id, assignments), "unknown");
  for (const id of [101, 200]) assert.equal(matchState(filter, id, assignments), "false");
  assert.equal(matchState(filter, undefined, assignments), "unknown");
  assert.equal(matchState({ id: "b", cutoff_match_id: "9007199254740992" }, "9007199254740993", assignments), "false");
});

test("explicit True, False, and Unknown override defaults without affecting another label", () => {
  const { matchState } = api(), filter = { id: "a", cutoff_match_id: 100 };
  const assignments = new Map([["a:10", "true"], ["a:20", "false"], ["a:101", "unknown"]]);
  assert.equal(matchState(filter, 10, assignments), "true");
  assert.equal(matchState(filter, 20, assignments), "false");
  assert.equal(matchState(filter, 101, assignments), "unknown");
  assert.equal(matchState({ ...filter, id: "b" }, 10, assignments), "unknown");
});

test("multiple conditions intersect, and Unknown is excluded for both True and False", () => {
  const { store, ManualFilterControl } = api();
  store.account = "nick"; store.ready = true;
  store.filters = [{ id: "a", name: "Solo", cutoff_match_id: 100 }, { id: "b", name: "Tired", cutoff_match_id: 100 }];
  store.assignments = new Map([["a:1", "true"], ["b:1", "false"], ["a:2", "true"], ["b:2", "true"], ["a:3", "false"]]);
  const control = new ManualFilterControl([]);
  assert.equal(control.matches({ id: 3 }), true);
  control.selected.set("a", "true"); control.selected.set("b", "false");
  assert.equal(control.matches({ id: 1 }), true);
  assert.equal(control.matches({ id: 2 }), false);
  assert.equal(control.matches({ id: 3 }), false);
  control.selected.clear(); control.selected.set("a", "false");
  assert.equal(control.matches({ id: 3 }), true);
  assert.equal(control.matches({ id: 4 }), false);
  assert.equal(control.matches({ id: 101 }), true);
  store.account = null;
  assert.equal(control.matches({ id: 4 }), true);
});

test("account switches discard labels, assignments, and selections immediately", async () => {
  const { store, ManualFilterControl } = api();
  store.request = async () => response({ filters: [], assignments: [] });
  store.setAccount("nick"); await flush();
  store.filters = [{ id: "a", name: "Solo", cutoff_match_id: 10 }];
  store.assignments.set("a:1", "true");
  const control = new ManualFilterControl([]); control.selected.set("a", "true");
  store.setAccount("other");
  assert.equal(store.filters.length, 0); assert.equal(store.assignments.size, 0); assert.equal(control.selected.size, 0);
  await flush(); store.setAccount(null);
  assert.equal(store.ready, false); assert.equal(control.active, false);
});

test("a stale account response cannot overwrite the newly signed-in account", async () => {
  const { ManualFilterStore } = api(); const resolvers = [];
  const store = new ManualFilterStore({ request: () => new Promise(resolve => resolvers.push(resolve)) });
  store.setAccount("old"); store.setAccount("new");
  resolvers[1](response({ filters: [{ id: "new", name: "New", cutoff_match_id: 1 }], assignments: [] })); await flush();
  resolvers[0](response({ filters: [{ id: "old", name: "Old", cutoff_match_id: 1 }], assignments: [{ filter_id: "old", match_id: 1, state: "true" }] })); await flush();
  assert.equal(store.filters[0].id, "new"); assert.equal(store.assignments.size, 0); assert.equal(store.loading, false);
});

test("mutations are persisted and remain isolated when an account changes during a save", async () => {
  const { ManualFilterStore } = api(); const calls = []; let resolveSave;
  const store = new ManualFilterStore({ request: async (url, options) => {
    calls.push({ url, options });
    if (options.method === "PUT") return new Promise(resolve => { resolveSave = resolve; });
    return response({ filters: [{ id: "a", name: "Solo", cutoff_match_id: 10 }], assignments: [] });
  } });
  store.setAccount("nick"); await flush();
  const save = store.assign("a", 1, "true");
  assert.equal(JSON.parse(calls[1].options.body).state, "true");
  assert.equal(calls[1].options.credentials, "same-origin");
  store.setAccount(null); resolveSave(response({ filter_id: "a", match_id: 1, state: "true" }));
  assert.equal(await save, false); assert.equal(store.assignments.size, 0);
});

test("create, assign Unknown, reload, and delete persist without changing public match data", async () => {
  const { ManualFilterStore } = api(); const filter = { id: "a", name: "Solo", cutoff_match_id: 100 };
  const data = { filters: [], assignments: [] }, calls = [];
  const store = new ManualFilterStore({ request: async (url, options) => {
    calls.push(url);
    if (options.method === "POST") { data.filters.push(filter); return response(filter); }
    if (options.method === "PUT") {
      const row = { filter_id: "a", match_id: 101, state: JSON.parse(options.body).state };
      data.assignments = [row]; return response(row);
    }
    if (options.method === "DELETE") { data.filters = []; data.assignments = []; return response(null, 204); }
    return response(structuredClone(data));
  } });
  store.setAccount("nick"); await flush();
  assert.equal(await store.create("Solo"), true);
  assert.equal(store.stateFor(filter, 101), "false");
  assert.equal(await store.assign("a", 101, "unknown"), true);
  await store.load(); assert.equal(store.stateFor(filter, 101), "unknown");
  assert.equal(await store.remove("a"), true);
  assert.equal(store.filters.length, 0); assert.equal(store.assignments.size, 0);
  assert.ok(calls.every(url => url.startsWith("/nickstats/api/auth/manual-filters")));
});

test("failed writes keep the last saved value and show the server error", async () => {
  const { ManualFilterStore } = api();
  const store = new ManualFilterStore({ request: async () => response({ reason: "Session expired" }, 401) });
  store.account = "nick"; store.ready = true; store.assignments.set("a:1", "false");
  assert.equal(await store.assign("a", 1, "true"), false);
  assert.equal(store.assignments.get("a:1"), "false"); assert.equal(store.error, "Session expired"); assert.equal(store.pending.size, 0);
});

test("duplicate in-flight writes for the same filter are blocked", async () => {
  const { ManualFilterStore } = api(); let resolve;
  const store = new ManualFilterStore({ request: () => new Promise(r => { resolve = r; }) });
  store.account = "nick"; store.ready = true;
  const first = store.assign("a", 1, "true");
  assert.equal(await store.assign("a", 1, "false"), false);
  resolve(response({ filter_id: "a", match_id: 1, state: "true" })); await first;
  assert.equal(store.assignments.get("a:1"), "true");
});
