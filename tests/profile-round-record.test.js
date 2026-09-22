"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const source = fs.readFileSync(path.join(__dirname, "..", "js", "profile.js"), "utf8");

test("unfiltered profile rounds show wins, losses, and win rate", () => {
  assert.match(source, /roundLosses = Math\.max\(0, rounds - roundWins\)/);
  assert.match(source, /roundResult === "ALL"[\s\S]*?roundWins[\s\S]*?roundLosses[\s\S]*?100 \* ratio\(roundWins, rounds\)/);
  assert.match(source, /"Winning rounds only" : "Losing rounds only"/);
});

test("utility outcomes include their relevant per-grenade yield", () => {
  assert.match(source, /perGrenade\(s\.he_damage, s\.he_grenades_thrown, "HE"/);
  assert.match(source, /perGrenade\(s\.fire_damage, s\.fire_grenades_thrown, "fire grenade"/);
  assert.match(source, /perGrenade\(s\.enemies_flashed, s\.flashbangs_thrown, "flash"/);
  assert.match(source, /perGrenade\(s\.teammates_flashed, s\.flashbangs_thrown, "flash"/);
  assert.match(source, /perGrenade\(s\.self_flashes, s\.flashbangs_thrown, "flash"/);
  assert.match(source, /statPerGrenadeAndRound\("flash_assists", "flashbangs_thrown", "flash"\)/);
  assert.match(source, /perGrenade\(s\.own_flash_kills, s\.flashbangs_thrown, "flash"/);
});
