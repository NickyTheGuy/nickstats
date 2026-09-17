"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "js", "stat-availability.js"), "utf8");
const modelsSource = fs.readFileSync(path.join(__dirname, "..", "backend", "Sources", "NickStatsAPI", "Models.swift"), "utf8");
const queriesSource = fs.readFileSync(path.join(__dirname, "..", "backend", "Sources", "NickStatsAPI", "Queries.swift"), "utf8");
const context = vm.createContext({ window: {} });
vm.runInContext(source, context);
const availability = context.window.NickStatsAvailability;

test("missing schema fields do not enter newer statistic scopes", () => {
  const stats = {};
  availability.add(stats, { rounds: 20, opening_kills: 4, opening_assisted_kills: 0 }, "nickstats.match/14");
  availability.add(stats, { rounds: 10, opening_kills: 3, opening_assisted_kills: 2 }, "nickstats.match/15");

  assert.equal(stats.rounds, 30);
  assert.equal(availability.rounds(stats, "opening_assisted_kills"), 10);
  assert.equal(availability.value(stats, "opening_assisted_kills"), 2);
  assert.equal(availability.scope(stats, "opening_assisted_kills").opening_kills, 3);
});

test("unavailable values remain distinct from real zeroes", () => {
  const oldOnly = {};
  availability.add(oldOnly, { rounds: 20, opening_assists: 0 }, "nickstats.match/15");
  assert.equal(availability.available(oldOnly, "opening_assists"), false);
  assert.equal(Number.isNaN(availability.value(oldOnly, "opening_assists")), true);

  const reparsed = {};
  availability.add(reparsed, { rounds: 20, opening_assists: 0 }, "nickstats.match/16");
  assert.equal(availability.available(reparsed, "opening_assists"), true);
  assert.equal(availability.value(reparsed, "opening_assists"), 0);
});

test("comparison matches expose the compact schema used for availability", () => {
  assert.match(modelsSource, /struct ComparisonMatch:[\s\S]*?var schema: String/);
  assert.match(queriesSource, /SELECT m\.id, m\.payload_schema/);
  assert.match(queriesSource, /id: matchID, schema: try row\.decode\(column: "payload_schema"/);
});
