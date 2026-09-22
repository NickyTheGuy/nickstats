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
const sourceMigrationSource = fs.readFileSync(path.join(__dirname, "..", "database", "migrations", "012_opening_flash_sources.sql"), "utf8");

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

test("current schema persists opening beneficiary, assister, context, and flash-source counters", () => {
  assert.match(frontendSource, /opening: \[[\s\S]*?player\.opening_assisted_kills[\s\S]*?player\.opening_damage_assisted_kills[\s\S]*?player\.opening_flash_assisted_kills/);
  assert.match(frontendSource, /player\.opening_traded_deaths[\s\S]*?player\.opening_trade_kills[\s\S]*?player\.opening_assists[\s\S]*?player\.opening_damage_assists[\s\S]*?player\.opening_flash_assists/);
  assert.match(frontendSource, /player\.opening_blinded_enemy_kills[\s\S]*?player\.opening_blind_kills[\s\S]*?player\.opening_deaths_while_blind[\s\S]*?player\.opening_deaths_to_blind_killer/);
  assert.match(frontendSource, /player\.opening_enemy_assisted_deaths[\s\S]*?player\.opening_enemy_damage_assisted_deaths[\s\S]*?player\.opening_enemy_flash_assisted_deaths/);
  assert.match(frontendSource, /player\.opening_own_flash_kills[\s\S]*?player\.opening_victim_side_flash_kills[\s\S]*?player\.opening_blind_source_unknown_kills/);
  assert.match(frontendSource, /player\.opening_deaths_to_killer_flash[\s\S]*?player\.opening_deaths_to_own_side_flash[\s\S]*?player\.opening_deaths_blind_source_unknown/);
  assert.match(frontendSource, /opening: sumArray\(left\.opening, right\.opening, 23\)/);
  assert.match(frontendSource, /schema: "nickstats\.match\/20"/);
});

test("opening blind sources distinguish killer, victim side, and missing attribution", () => {
  assert.match(workerSource, /const activeBlindSources = \[\.\.\.\(blindSources\.get\(victim\) \|\| \[\]\)\]/);
  assert.match(workerSource, /const victimSideFlashBlind = activeBlindSources\.some/);
  assert.match(workerSource, /const blindSourceUnknown = victimWasBlind && activeBlindSources\.length === 0/);
  assert.match(workerSource, /attacker\.openingOwnFlashKills \+= Number\(ownFlashBlind\)/);
  assert.match(workerSource, /attacker\.openingVictimSideFlashKills \+= Number\(victimSideFlashBlind\)/);
  assert.match(workerSource, /victim\.openingDeathsToKillerFlash \+= Number\(ownFlashBlind\)/);
  assert.match(workerSource, /victim\.openingDeathsToOwnSideFlash \+= Number\(victimSideFlashBlind\)/);
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

test("opening flash sources have normalized schema-19 storage", () => {
  for (const column of [
    "opening_own_flash_kills", "opening_victim_side_flash_kills",
    "opening_blind_source_unknown_kills", "opening_deaths_to_killer_flash",
    "opening_deaths_to_own_side_flash", "opening_deaths_blind_source_unknown"
  ]) {
    assert.match(schemaSource, new RegExp(`\\b${column}\\b`));
    assert.match(sourceMigrationSource, new RegExp(`\\b${column}\\b`));
  }
  assert.match(sourceMigrationSource, /VALUES \(12, 'Opening flash source attribution'\)/);
});

test("stored match flash assists are rebuilt from teammate-flash relationships", () => {
  assert.match(frontendSource, /flash_assists: stats\.profile\?\.length \? numberValue\(stats\.profile\[15\]\) : flashAssists/);
  assert.match(frontendSource, /numberValue\(row\[0\]\) === playerIndex\) flashAssists \+= numberValue\(row\[2\]\)/);
});

test("all-side stored matches preserve a missing profile for relationship reconstruction", () => {
  assert.match(frontendSource, /profile: \(left\.profile\?\.length \|\| right\.profile\?\.length\)[\s\S]*?\? sumArray\(left\.profile, right\.profile, 16\)[\s\S]*?: undefined/);
});
