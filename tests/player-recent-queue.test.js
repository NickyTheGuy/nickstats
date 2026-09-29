"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/players.js"), "utf8");
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));

test("recent chips keep their positions while visits update the saved recency", () => {
  const state = { recent: ["1", "2", "3"].map(id => ({ id, name: id })) };
  let stored = state.recent.slice(), renders = 0;
  const context = {
    state, MAX_RECENT: 10, RECENT_KEY: "recent",
    readRecent: () => stored,
    renderRecent: () => { renders += 1; },
    localStorage: { setItem: (_key, value) => { stored = JSON.parse(value); } }
  };
  vm.runInNewContext(`${section("  function rememberPlayer(", "  function renderRecent(")} globalThis.rememberPlayer = rememberPlayer;`, context);
  context.rememberPlayer({ id: "3", name: "Third" });
  context.rememberPlayer({ id: "2", name: "Second" });
  assert.deepEqual(state.recent.map(item => item.id), ["1", "2", "3"]);
  assert.equal(renders, 0);
  assert.deepEqual(stored.map(item => item.id), ["2", "3", "1"]);
  context.rememberPlayer({ id: "4", name: "Fourth" });
  assert.deepEqual(Array.from(state.recent, item => item.id), ["1", "2", "3", "4"]);
  assert.equal(renders, 1);
});

test("rapid selections load every distinct profile in click order and activate the last choice", async () => {
  const requests = [], activations = [];
  const state = {
    profiles: new Map(), graphPlayers: new Set(), activeId: null,
    profileQueue: [], pendingProfiles: new Set(), profileLoading: false, requestedProfileId: null
  };
  const status = {
    textContent: "", classList: { remove() {}, toggle() {} }
  };
  const panel = { hidden: true, scrollIntoView() { throw new Error("Recent chips should not scroll on load."); } };
  const context = {
    state, MAX_GRAPH_PLAYERS: 5, PLAYER_ENDPOINT: "/players", encodeURIComponent,
    $: id => id === "playerProfile" ? panel : status,
    fetch: url => new Promise(resolve => requests.push({ url, resolve })),
    apiJson: async response => response,
    expandDenseProfile: payload => payload,
    rememberPlayer() {}, renderOpenTabs() {},
    activeProfile: () => state.profiles.get(state.activeId),
    activateProfile: id => { state.activeId = id; activations.push(id); }
  };
  vm.runInNewContext(`${section("  async function teammateRatingsFor(", "  function expandDenseProfile(")}${section("  function loadProfile(", "  async function refreshOpenProfiles(")} globalThis.loadProfile = loadProfile;`, context);
  context.loadProfile("1", { scroll: false });
  context.loadProfile("2", { scroll: false });
  context.loadProfile("2", { scroll: false });
  context.loadProfile("3", { scroll: false });
  assert.equal(requests.length, 2);
  assert.equal(state.pendingProfiles.size, 3);
  for (let index = 0; index < 3; index += 1) {
    requests[index * 2].resolve({ player: { id: String(index + 1), name: `Player ${index + 1}` }, matches: [] });
    requests[index * 2 + 1].resolve({ ratings: {} });
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.deepEqual(requests.map(item => item.url.split("/").at(-1)), ["1?compact=true&wire=2", "teammate-ratings", "2?compact=true&wire=2", "teammate-ratings", "3?compact=true&wire=2", "teammate-ratings"]);
  assert.deepEqual([...state.profiles.keys()], ["1", "2", "3"]);
  assert.deepEqual(activations, ["1", "3"]);
  assert.equal(state.pendingProfiles.size, 0);
  assert.equal(state.activeId, "3");
});
