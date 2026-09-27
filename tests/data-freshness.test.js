"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("a changed database revision refreshes other pages once, even for older matches", async () => {
  const listeners = new Map(), events = [], writes = [], revisions = ["1:10:100", "2:11:101", "2:11:101"];
  const window = {
    addEventListener(name, listener) { listeners.set(name, listener); },
    dispatchEvent(event) { events.push(event); }
  };
  const context = {
    window,
    document: { addEventListener() {}, hidden: false },
    fetch: async (_url, options) => {
      assert.equal(options.cache, "no-store");
      return { ok: true, json: async () => ({ revision: revisions.shift() }) };
    },
    localStorage: { setItem(key, value) { writes.push([key, value]); } },
    Date, Math,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } }
  };
  vm.runInNewContext(read("js/data-freshness.js"), context);
  const freshness = window.NickStatsDataFreshness;
  await freshness.check();
  assert.equal(events.length, 0);
  await freshness.check();
  assert.equal(events.length, 1);
  assert.equal(events[0].detail.local, false);
  await freshness.check();
  assert.equal(events.length, 1);
  freshness.changed();
  assert.equal(events.length, 2);
  assert.equal(events[1].detail.local, true);
  assert.equal(writes.length, 1);
  listeners.get("storage")({ key: "nickstats.matchesChanged.v1" });
  assert.equal(events.at(-1).detail.local, false);
  assert.equal(writes.length, 1);
});

test("existing player tabs and group selections are refreshed without resetting filters", () => {
  const html = read("index.html"), demo = read("js/demo.js"), players = read("js/players.js"), groups = read("js/groups.js");
  const routes = read("backend/Sources/NickStatsAPI/Routes.swift");
  const queries = read("backend/Sources/NickStatsAPI/Queries.swift");
  assert.ok(html.indexOf("./js/data-freshness.js") < html.indexOf("./js/demo.js"));
  assert.match(html, /id="playerDataStatus"/);
  assert.match(routes, /app\.get\("matches", "revision"\)/);
  assert.match(queries, /COUNT\(\*\).*MAX\(id\).*MAX\(updated_at\).*SUM\(UNIX_TIMESTAMP\(updated_at\)\).*FROM matches/);
  assert.match(queries, /revision: "\\\(count\):\\\(latestID\):\\\(updated\):\\\(checksum\)"/);
  assert.match(demo, /responseBody\.created !== false \|\| responseBody\.replaced\) window\.NickStatsDataFreshness\.changed\(\)/);
  assert.match(demo, /response\.created !== false \|\| response\.replaced\) window\.NickStatsDataFreshness\.changed\(\)/);
  assert.match(demo, /event\.detail\?\.page === "match" && matchListStale\) loadMatches/);
  assert.match(players, /nickstats:matches-changed", markProfilesStale/);
  assert.match(players, /Promise\.all\(\[\.\.\.state\.profiles\.keys\(\)\]/);
  assert.match(players, /profile\.summaryCache\?\.clear\(\)/);
  assert.match(players, /profile\.graphCache\?\.clear\(\)/);
  assert.match(players, /mapFilter\.setOptions\(availableMaps\)/);
  assert.match(groups, /nickstats:matches-changed", markGroupStale/);
  assert.match(groups, /buildGroup\(\{ refresh: true \}\)/);
  assert.match(groups, /populateMaps\(\{ reset: !refresh \}\)/);
});
