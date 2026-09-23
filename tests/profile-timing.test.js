"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const routes = fs.readFileSync(path.join(root, "backend", "Sources", "NickStatsAPI", "Routes.swift"), "utf8");
const queries = fs.readFileSync(path.join(root, "backend", "Sources", "NickStatsAPI", "Queries.swift"), "utf8");
const timing = fs.readFileSync(path.join(root, "backend", "Sources", "NickStatsAPI", "ProfileTiming.swift"), "utf8");

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
});
