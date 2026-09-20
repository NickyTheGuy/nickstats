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

test("opening context excludes schema 16 matches and preserves schema 17 zeroes", () => {
  const mixed = {};
  availability.add(mixed, { rounds: 20, opening_deaths: 4, opening_enemy_assisted_deaths: 0 }, "nickstats.match/16");
  availability.add(mixed, { rounds: 10, opening_deaths: 2, opening_enemy_assisted_deaths: 0 }, "nickstats.match/17");

  assert.equal(availability.available(mixed, "opening_enemy_assisted_deaths"), true);
  assert.equal(availability.rounds(mixed, "opening_enemy_assisted_deaths"), 10);
  assert.equal(availability.value(mixed, "opening_enemy_assisted_deaths"), 0);
  assert.equal(availability.scope(mixed, "opening_enemy_assisted_deaths").opening_deaths, 2);
});

test("opening flash-source context excludes schema 18 and preserves schema 19 zeroes", () => {
  const mixed = {};
  availability.add(mixed, { rounds: 20, opening_blinded_enemy_kills: 4, opening_own_flash_kills: 3 }, "nickstats.match/18");
  availability.add(mixed, { rounds: 10, opening_blinded_enemy_kills: 2, opening_own_flash_kills: 0 }, "nickstats.match/19");

  assert.equal(availability.available(mixed, "opening_own_flash_kills"), true);
  assert.equal(availability.rounds(mixed, "opening_own_flash_kills"), 10);
  assert.equal(availability.value(mixed, "opening_own_flash_kills"), 0);
  assert.equal(availability.scope(mixed, "opening_own_flash_kills").opening_blinded_enemy_kills, 2);
});

test("man-count context reuses schema 10 death events without reparsing", () => {
  const mixed = {};
  availability.add(mixed, { rounds: 12, clawback_kills: 7, bozo_deaths: 7 }, "nickstats.match/9");
  availability.add(mixed, { rounds: 20, clawback_kills: 2, bozo_deaths: 3 }, "nickstats.match/10");

  assert.equal(availability.rounds(mixed, "clawback_kills"), 20);
  assert.equal(availability.value(mixed, "clawback_kills"), 2);
  assert.equal(availability.value(mixed, "bozo_deaths"), 3);
  assert.match(queriesSource, /AS clawback_count/);
  assert.match(queriesSource, /AS bozo_count/);
  assert.match(queriesSource, /AS man_count_context/);
});

test("kill stage and cleanup context reuse schema 10 death events", () => {
  const mixed = {};
  availability.add(mixed, { rounds: 12, enemy_alive_5_kills: 9, cleanup_kills: 4 }, "nickstats.match/9");
  availability.add(mixed, { rounds: 20, enemy_alive_5_kills: 3, cleanup_kills: 1 }, "nickstats.match/10");

  assert.equal(availability.rounds(mixed, "enemy_alive_5_kills"), 20);
  assert.equal(availability.value(mixed, "enemy_alive_5_kills"), 3);
  assert.equal(availability.value(mixed, "cleanup_kills"), 1);
  assert.match(queriesSource, /AS enemy_alive_5/);
  assert.match(queriesSource, /AS cleanup_count/);
  assert.match(queriesSource, /AS cleanup_context/);
});

test("comparison matches expose the compact schema used for availability", () => {
  assert.match(modelsSource, /struct ComparisonMatch:[\s\S]*?var schema: String/);
  assert.match(queriesSource, /SELECT m\.id, m\.payload_schema/);
  assert.match(queriesSource, /id: matchID, schema: try row\.decode\(column: "payload_schema"/);
});
