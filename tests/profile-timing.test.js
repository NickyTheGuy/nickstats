"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const routes = fs.readFileSync(path.join(root, "backend", "Sources", "NickStatsAPI", "Routes.swift"), "utf8");
const queries = fs.readFileSync(path.join(root, "backend", "Sources", "NickStatsAPI", "Queries.swift"), "utf8");
const timing = fs.readFileSync(path.join(root, "backend", "Sources", "NickStatsAPI", "ProfileTiming.swift"), "utf8");
const models = fs.readFileSync(path.join(root, "backend", "Sources", "NickStatsAPI", "Models.swift"), "utf8");
const players = fs.readFileSync(path.join(root, "js", "players.js"), "utf8");
const cache = fs.readFileSync(path.join(root, "backend", "Sources", "NickStatsAPI", "ProfileResponseCache.swift"), "utf8");
const importer = fs.readFileSync(path.join(root, "backend", "Sources", "NickStatsAPI", "Importer.swift"), "utf8");
const faceitDates = fs.readFileSync(path.join(root, "backend", "Sources", "NickStatsAPI", "FaceitDateSync.swift"), "utf8");

test("compact player profiles expose and log server timing", () => {
  assert.match(routes, /getPlayerProfileData\(playerID, on: request\.db, timing: timing\)/);
  assert.match(routes, /timing\.record\("build"/);
  assert.match(routes, /timing\.record\("encode"/);
  assert.match(routes, /timing\.record\("total"/);
  assert.match(routes, /replaceOrAdd\(name: "Server-Timing"/);
  assert.match(routes, /Compact player profile timing/);
  assert.match(timing, /String\(format: "%\.1f", metric\.durationMilliseconds\)/);
});

test("profile timing identifies every sequential query group", () => {
  for (const metric of [
    "identity", "flash_targets", "side_stats", "economy", "trades", "flashes",
    "assisted_kills", "flash_assists", "contexts_out", "contexts_in", "kill_timing",
    "death_timing", "weapons", "buy_slices", "result_slices", "matchup_slices",
    "survivors", "match_list", "side_data"
  ]) {
    assert.match(queries, new RegExp(`record\\("${metric}"`));
  }
  assert.match(queries, /kind == "killer" \? "event_kills" : "event_deaths"/);
  for (const metric of [
    "buy_processing", "result_processing", "matchup_processing", "survivor_processing",
    "event_kills_processing", "event_deaths_processing"
  ]) {
    assert.match(queries, new RegExp(`"${metric}"`));
  }
});

test("profile aggregation updates indexed slices in place", () => {
  assert.match(queries, /var resultIndexes: \[Int64: \[ComparisonSliceKey: Int\]\]/);
  assert.match(queries, /resultIndexes\[matchID, default: \[:\]\]\[ComparisonSliceKey\(value\)\] = index/);
  assert.match(queries, /result\[matchID\]\?\[index\]\.stats\[name, default: 0\] \+= amount/);
  assert.doesNotMatch(queries, /guard var rows = result\[matchID\]/);
  assert.match(queries, /let statsDecoder = JSONDecoder\(\)/);
});

test("player profiles use a backwards-compatible dense wire format", () => {
  assert.match(routes, /let wireVersion = request\.query\[Int\.self, at: "wire"\]/);
  assert.match(routes, /if wireVersion == 2/);
  assert.match(routes, /DensePlayerProfileDataResponse\(payload\)/);
  assert.match(routes, /timing\.record\("dense_wire"/);
  assert.match(models, /struct DensePlayerProfileDataResponse: Content/);
  assert.match(models, /case statKeys = "stat_keys"/);
  assert.match(models, /stats = statKeys\.map \{ value\.stats\[\$0\] \}/);
  assert.match(players, /compact=true&wire=2/);
  assert.match(players, /if \(values\[index\] != null\) stats\[keys\[index\]\] = values\[index\]/);
});

test("encoded dense profiles use a bounded lazily refreshed LRU cache", () => {
  assert.match(cache, /actor ProfileResponseCache/);
  assert.match(cache, /maximumEntries: 16/);
  assert.match(cache, /var staleMatchIDs: Set<Int64>/);
  assert.match(cache, /entry\.staleMatchIDs\.insert\(change\.matchID\)/);
  assert.match(cache, /guard version == versions\[key, default: 0\] else \{ return \}/);
  assert.match(cache, /entries\.min\(by: \{ \$0\.value\.lastAccess < \$1\.value\.lastAccess \}\)/);
  assert.match(routes, /profileResponseCache\.lookup\(playerID: playerID, wireVersion: 2\)/);
  assert.match(routes, /timing\.record\("cache_hit"/);
  assert.match(routes, /timing\.record\("cache_stale"/);
  assert.match(routes, /getPlayerProfileMatches\(/);
  assert.match(routes, /JSONEncoder\(\)\.encode\(densePayload\)/);
  assert.match(routes, /profileResponseCache\.insert\(/);
  assert.equal((routes.match(/await profileResponseCache\.markChanged\(/g) || []).length, 2);
  assert.doesNotMatch(routes, /profileResponseCache\.removeAll/);
  assert.match(queries, /func matchIDFilter/);
  assert.match(queries, /\\\(binds: matchIDs\)/);
  assert.match(models, /refreshing cached: DensePlayerProfileDataResponse/);
  assert.match(importer, /affectedPlayerIDs: affectedPlayerIDs\.sorted\(\)/);
  assert.match(faceitDates, /changes\.append\(ProfileMatchChange/);
});
