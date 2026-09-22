"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const queries = read("backend/Sources/NickStatsAPI/Queries.swift");
const models = read("backend/Sources/NickStatsAPI/Models.swift");
const demo = read("js/demo.js");
const profile = read("js/profile.js");
const compare = read("js/compare.js");
const graphs = read("js/graphs.js");

test("stored flash relationships aggregate enemy, teammate, and self effects separately", () => {
  assert.match(queries, /victim\.match_team_id <> mp\.match_team_id THEN f\.flash_effects/);
  assert.match(queries, /victim\.match_team_id = mp\.match_team_id AND victim\.id <> mp\.id THEN f\.flash_effects/);
  assert.match(queries, /victim\.id = mp\.id THEN f\.flash_effects/);
  for (const field of ["teammates_flashed", "teammate_blind_duration_ms", "self_flashes", "self_blind_duration_ms"]) {
    assert.match(queries, new RegExp(`"${field}"`));
  }
  assert.match(models, /case teammatesFlashed = "teammates_flashed"/);
  assert.match(models, /case selfBlindDurationSeconds = "self_blind_duration_seconds"/);
  assert.match(queries, /flattenedBuyStats\(_ value: SideStatsPayload, flashTargets:/);
  assert.match(queries, /flash\.victimPlayerIndex == targets\.ownPlayerSlot/);
  assert.match(queries, /targets\.teamByPlayerSlot\[flash\.victimPlayerIndex\] == targets\.ownTeamID/);
});

test("match scoreboard derives teammate and self flash effects from relationship rows", () => {
  assert.match(demo, /const teammateFlashMatchups = player => flashMatchupsFor\(player, "teammate"\)/);
  assert.match(demo, /const selfFlashMatchups = player => flashMatchupsFor\(player, "self"\)/);
  assert.match(demo, /"TF", "Teammate sec", "SF", "Self sec"/);
  assert.match(demo, /teammateEffects, teammateBlindSeconds\.toFixed\(1\)/);
  assert.match(demo, /selfEffects, selfBlindSeconds\.toFixed\(1\)/);
});

test("profiles, comparisons, and graphs expose teammate and self blind outcomes", () => {
  assert.match(profile, /"Teammates flashed"/);
  assert.match(profile, /"Teammate blind time"/);
  assert.match(profile, /"Self flash effects"/);
  assert.match(profile, /"Self blind time"/);
  assert.match(compare, /"Teammate blind sec", "teammateBlindSeconds"/);
  assert.match(compare, /"Self blind sec", "selfBlindSeconds"/);
  assert.match(graphs, /"Teammates flashed per round"/);
  assert.match(graphs, /"Self blind seconds per round"/);
});
