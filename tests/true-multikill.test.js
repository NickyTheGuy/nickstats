"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const workerPath = path.join(root, "js", "demo-worker.js");
const worker = fs.readFileSync(workerPath, "utf8");
const demo = fs.readFileSync(path.join(root, "js", "demo.js"), "utf8");
const quick = fs.readFileSync(path.join(root, "js", "quick-comparison.js"), "utf8");
const scoreboard = fs.readFileSync(path.join(root, "js", "scoreboard.js"), "utf8");
const profile = fs.readFileSync(path.join(root, "js", "profile.js"), "utf8");
const graphs = fs.readFileSync(path.join(root, "js", "graphs.js"), "utf8");
const models = fs.readFileSync(path.join(root, "backend", "Sources", "NickStatsAPI", "Models.swift"), "utf8");
const importer = fs.readFileSync(path.join(root, "backend", "Sources", "NickStatsAPI", "Importer.swift"), "utf8");
const schema = fs.readFileSync(path.join(root, "database", "schema.sql"), "utf8");
const migration = fs.readFileSync(path.join(root, "database", "migrations", "013_true_multikills.sql"), "utf8");

function workerContext() {
  const context = vm.createContext({
    console,
    importScripts() {},
    self: { addEventListener() {}, deademCs2: {}, postMessage() {} }
  });
  vm.runInContext(worker, context, { filename: workerPath });
  return context;
}

test("true multi-kill links deduplicate victims and extend connected anti-trade chains", () => {
  const victims = vm.runInContext(`(() => {
    const round = freshRound();
    recordTrueMultikillLink(round, 7, 11, 12);
    recordTrueMultikillLink(round, 7, 11, 12);
    recordTrueMultikillLink(round, 7, 12, 13);
    return [...round.trueMultikillVictims.get(7)].sort((a, b) => a - b);
  })()`, workerContext());
  assert.deepEqual(Array.from(victims), [11, 12, 13]);
  assert.match(worker, /prior\.killer === attackerId && prior\.attemptedTraders\.has\(victimId\)/);
  assert.match(worker, /tradeIsOpen\(prior, victimId, tick\)/);
});

test("death to the original killer proves a trade opportunity and failed attempt", () => {
  assert.match(worker, /const TRADE_WINDOW_SECONDS = 3;/);
  assert.match(worker, /const TRADE_ENGAGEMENT_LULL_SECONDS = 2;/);
  assert.match(worker, /prior\.killer === attackerId && prior\.victim !== victimId && prior\.victimTeam === victimTeam[\s\S]*?tradeIsOpen\(prior, victimId, tick\)[\s\S]*?recordTradeAttempt\(prior, victim, "death"\)/);
  assert.match(worker, /provenTradeOpportunities: \{ bullet_path: 0, damage: 0, kill: 0, death: 0 \}/);
  assert.match(worker, /attempt: "[^"]*is killed by that killer during the initial trade window"/);
});

test("schema 20 stores true 2K through 5K round counts in every side slice", () => {
  assert.match(demo, /schema: "nickstats\.match\/20"/);
  assert.match(demo, /true_kill_rounds: countArray\(player\.true_kill_rounds\)/);
  assert.match(worker, /trueKillRoundsByCount\[Math\.min\(5, trueKillVictims\.size\)\] \+= 1/);
  assert.match(models, /case trueKillRounds = "true_kill_rounds"/);
  assert.match(importer, /true_kill_rounds_1k, true_kill_rounds_2k, true_kill_rounds_3k/);
  for (const count of [1, 2, 3, 4, 5]) {
    assert.match(schema, new RegExp(`true_kill_rounds_${count}k`));
    assert.match(migration, new RegExp(`true_kill_rounds_${count}k`));
  }
  assert.match(migration, /VALUES \(13, 'True multi-kill rounds'\)/);
});

test("multi-kill rates and true multi-kill detail appear across profile and comparison views", () => {
  assert.match(scoreboard, /multikills: \[\["regular", "Regular"[\s\S]*?\["true", "True"/);
  assert.match(demo, /const multikillPercent = 100 \* \[2, 3, 4, 5\]/);
  assert.doesNotMatch(quick, /group: "trueMultikills"/);
  assert.match(quick, /key: "multikill-percent", label: "Multi%"/);
  assert.match(profile, /`\$\{prefix\}TrueMultikillStats`/);
  assert.match(profile, /\["Multi-kill %", percent/);
  assert.match(graphs, /"true_multikill_rate", "True multi-kill round rate"/);
});
