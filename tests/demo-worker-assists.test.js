"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const workerSource = fs.readFileSync(path.join(__dirname, "..", "js", "demo-worker.js"), "utf8");
const frontendSource = fs.readFileSync(path.join(__dirname, "..", "js", "demo.js"), "utf8");

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

test("schema 15 persists all opening-assist counters", () => {
  assert.match(frontendSource, /opening: \[[\s\S]*?player\.opening_assisted_kills[\s\S]*?player\.opening_damage_assisted_kills[\s\S]*?player\.opening_flash_assisted_kills/);
  assert.match(frontendSource, /opening: sumArray\(left\.opening, right\.opening, 5\)/);
  assert.match(frontendSource, /schema: "nickstats\.match\/15"/);
});
