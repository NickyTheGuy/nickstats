"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const workerSource = fs.readFileSync(path.join(__dirname, "..", "js", "demo-worker.js"), "utf8");
const frontendSource = fs.readFileSync(path.join(__dirname, "..", "js", "demo.js"), "utf8");
const schemaSource = fs.readFileSync(path.join(__dirname, "..", "database", "schema.sql"), "utf8");
const migrationSource = fs.readFileSync(path.join(__dirname, "..", "database", "migrations", "009_opening_trade_assister_stats.sql"), "utf8");
const contextMigrationSource = fs.readFileSync(path.join(__dirname, "..", "database", "migrations", "010_opening_context.sql"), "utf8");

test("active teammate flash sources supplement the single official assister", () => {
  assert.match(workerSource, /const damageContributors = new Set\(\)/);
  assert.match(workerSource, /for \(const \[thrower, expiry\] of blindSources\.get\(victim\) \|\| \[\]\)/);
  assert.match(workerSource, /throwerTeam === attackerTeam/);
  assert.match(workerSource, /const contributors = new Set\(\[\.\.\.damageContributors, \.\.\.flashContributors\]\)/);
  assert.match(workerSource, /for \(const contributor of contributors\)[\s\S]*?contributor\.assists \+= 1/);
});

test("damage and flash overlap increments one unique assisted kill", () => {
  assert.match(workerSource, /if \(contributors\.size\) \{[\s\S]*?attacker\.assistedKills \+= 1/);
  assert.match(workerSource, /openingAssistedKills \+= 1/);
  assert.match(workerSource, /openingDamageAssistedKills \+= Number\(damageContributors\.size > 0\)/);
  assert.match(workerSource, /openingFlashAssistedKills \+= Number\(flashContributors\.size > 0\)/);
  assert.match(workerSource, /total: row\.assistedKills/);
});

test("schema 17 persists opening beneficiary, assister, and context counters", () => {
  assert.match(frontendSource, /opening: \[[\s\S]*?player\.opening_assisted_kills[\s\S]*?player\.opening_damage_assisted_kills[\s\S]*?player\.opening_flash_assisted_kills/);
  assert.match(frontendSource, /player\.opening_traded_deaths[\s\S]*?player\.opening_trade_kills[\s\S]*?player\.opening_assists[\s\S]*?player\.opening_damage_assists[\s\S]*?player\.opening_flash_assists/);
  assert.match(frontendSource, /player\.opening_blinded_enemy_kills[\s\S]*?player\.opening_blind_kills[\s\S]*?player\.opening_deaths_while_blind[\s\S]*?player\.opening_deaths_to_blind_killer/);
  assert.match(frontendSource, /player\.opening_enemy_assisted_deaths[\s\S]*?player\.opening_enemy_damage_assisted_deaths[\s\S]*?player\.opening_enemy_flash_assisted_deaths/);
  assert.match(frontendSource, /opening: sumArray\(left\.opening, right\.opening, 17\)/);
  assert.match(frontendSource, /schema: "nickstats\.match\/17"/);
});

test("opening context records blind state and enemy assistance for both duelists", () => {
  assert.match(workerSource, /attacker\.openingBlindedEnemyKills \+= Number\(victimWasBlind\)/);
  assert.match(workerSource, /attacker\.openingBlindKills \+= Number\(attackerWasBlind\)/);
  assert.match(workerSource, /victim\.openingDeathsWhileBlind \+= Number\(victimWasBlind\)/);
  assert.match(workerSource, /victim\.openingDeathsToBlindKiller \+= Number\(attackerWasBlind\)/);
  assert.match(workerSource, /victim\.openingEnemyAssistedDeaths \+= 1/);
  assert.match(workerSource, /victim\.openingEnemyDamageAssistedDeaths \+= Number\(damageContributors\.size > 0\)/);
  assert.match(workerSource, /victim\.openingEnemyFlashAssistedDeaths \+= Number\(flashContributors\.size > 0\)/);
});

test("opening trades and assists are credited to each participating player", () => {
  assert.match(workerSource, /if \(prior\.opening\) tradedVictim\.openingTradedDeaths \+= 1/);
  assert.match(workerSource, /if \(prior\.opening\) attacker\.openingTradeKills \+= 1/);
  assert.match(workerSource, /for \(const contributor of contributors\)[\s\S]*?contributor\.openingAssists \+= 1/);
  assert.match(workerSource, /for \(const contributor of damageContributors\)[\s\S]*?contributor\.openingDamageAssists \+= 1/);
  assert.match(workerSource, /for \(const contributor of flashContributors\)[\s\S]*?contributor\.openingFlashAssists \+= 1/);
});

test("opening attribution has normalized schema-16 storage", () => {
  for (const column of ["opening_traded_deaths", "opening_trade_kills", "opening_assists", "opening_damage_assists", "opening_flash_assists", "opening_successes"]) {
    assert.match(schemaSource, new RegExp(`\\b${column}\\b`));
    assert.match(migrationSource, new RegExp(`\\b${column}\\b`));
  }
  assert.match(migrationSource, /VALUES \(9, 'Opening-death trades and opening-assist attribution'\)/);
});

test("opening context has normalized schema-17 storage", () => {
  for (const column of [
    "opening_blinded_enemy_kills", "opening_blind_kills", "opening_deaths_while_blind",
    "opening_deaths_to_blind_killer", "opening_enemy_assisted_deaths",
    "opening_enemy_damage_assisted_deaths", "opening_enemy_flash_assisted_deaths"
  ]) {
    assert.match(schemaSource, new RegExp(`\\b${column}\\b`));
    assert.match(contextMigrationSource, new RegExp(`\\b${column}\\b`));
  }
  assert.match(contextMigrationSource, /VALUES \(10, 'Opening kill and death context'\)/);
});

test("stored match flash assists are rebuilt from teammate-flash relationships", () => {
  assert.match(frontendSource, /flash_assists: flashAssists/);
  assert.doesNotMatch(frontendSource, /flash_assists: stats\.profile\?\.length/);
  assert.match(frontendSource, /numberValue\(row\[0\]\) === playerIndex\) flashAssists \+= numberValue\(row\[2\]\)/);
});

test("all-side stored matches preserve a missing profile for relationship reconstruction", () => {
  assert.match(frontendSource, /profile: \(left\.profile\?\.length \|\| right\.profile\?\.length\)[\s\S]*?\? sumArray\(left\.profile, right\.profile, 16\)[\s\S]*?: undefined/);
});
