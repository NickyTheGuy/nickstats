"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("teammate rating averages overall ratings per teammate appearance in qualifying matches", () => {
  const source = read("js/players.js");
  const start = source.indexOf("  function averageTeammateRating(");
  const end = source.indexOf("  function aggregate(", start);
  const context = { number: value => Number(value) || 0 };
  vm.runInNewContext(`${source.slice(start, end)} globalThis.average = averageTeammateRating;`, context);
  const views = [
    { stats: { rounds: 24 }, match: { teammate_ids: [2, 3] } },
    { stats: { rounds: 24 }, match: { teammate_ids: [2, 4] } },
    { stats: { rounds: 0 }, match: { teammate_ids: [5] } }
  ];
  const ratings = { 2: 1.2, 3: 0.8, 4: 1.6, 5: 4 };
  const result = context.average(views, ratings);
  assert.equal(result.samples, 4);
  assert.ok(Math.abs(result.rating - 1.2) < 1e-10);
  assert.equal(context.average([], ratings).rating, null);
});

test("career ratings come from all teammate matches and remain separate from group conditions", () => {
  const query = read("backend/Sources/NickStatsAPI/Queries.swift");
  const route = read("backend/Sources/NickStatsAPI/Routes.swift");
  const players = read("js/players.js"), profile = read("js/profile.js"), comparison = read("js/quick-comparison.js");
  assert.ok(query.includes("teammate.player_id <> \\(bind: playerID)"));
  assert.match(query, /SELECT DISTINCT teammate\.player_id[\s\S]*?teammate\.match_team_id = own\.match_team_id/);
  assert.match(query, /JOIN match_players career ON career\.player_id = teammates\.player_id[\s\S]*?JOIN player_side_stats s ON s\.match_player_id = career\.id/);
  assert.match(route, /app\.get\("players", ":id", "teammate-ratings"\)/);
  assert.match(players, /teammateRatingsFor\(id, controller\.signal\)/);
  assert.match(profile, /"Teammate rating", summary\.teammateRating/);
  assert.match(comparison, /key: "teammate-rating", label: "Teammate rating"/);
});
