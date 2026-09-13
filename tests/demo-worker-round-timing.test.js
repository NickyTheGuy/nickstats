"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const workerPath = path.join(__dirname, "..", "js", "demo-worker.js");
const source = fs.readFileSync(workerPath, "utf8");
const frontendSource = fs.readFileSync(path.join(__dirname, "..", "js", "demo.js"), "utf8");

function workerContext() {
  const context = vm.createContext({
    console,
    importScripts() {},
    self: { addEventListener() {}, deademCs2: {}, postMessage() {} }
  });
  vm.runInContext(source, context, { filename: workerPath });
  return context;
}

test("fresh rounds carry independent timing anchors", () => {
  const timing = vm.runInContext(`(() => {
    const round = freshRound();
    return [round.liveStartTick, round.bombPlantTick, round.deathSequence];
  })()`, workerContext());
  assert.deepEqual(Array.from(timing), [null, null, 0]);
});

test("round timing begins when freeze time ends", () => {
  assert.match(source, /case "round_freeze_end":[\s\S]*?round\.liveStartTick = demoPacket\.tick/);
  assert.match(source, /elapsed_ms: Math\.max\(0, Math\.round\(\(tick - round\.liveStartTick\) \* tickInterval \* 1000\)\)/);
  assert.match(source, /case "bomb_planted":[\s\S]*?round\.bombPlantTick = demoPacket\.tick/);
});

test("completed rounds preserve both sides' final survivor counts", () => {
  assert.match(source, /const aliveAtEnd = \{ T: 0, CT: 0 \}/);
  assert.match(source, /t_alive_end: aliveAtEnd\.T/);
  assert.match(source, /ct_alive_end: aliveAtEnd\.CT/);
});

test("round timing migration stores factual event dimensions", () => {
  const migration = fs.readFileSync(path.join(__dirname, "..", "database", "migrations", "003_round_timing.sql"), "utf8");
  for (const column of ["elapsed_ms", "since_plant_ms", "t_alive_before", "ct_alive_before", "context_flags"]) {
    assert.match(migration, new RegExp(`\\b${column}\\b`));
  }
});

test("round survivor migration extends round facts without rewriting timing migration", () => {
  const migration = fs.readFileSync(path.join(__dirname, "..", "database", "migrations", "004_round_survivors.sql"), "utf8");
  assert.match(migration, /ALTER TABLE match_rounds/);
  assert.match(migration, /\bt_alive_end\b/);
  assert.match(migration, /\bct_alive_end\b/);
});

test("schema 11 uploads survivor rows separately from stable timing rows", () => {
  assert.match(frontendSource, /schema: "nickstats\.match\/11"/);
  assert.match(frontendSource, /round_survivors: \(result\.round_timing \|\| \[\]\)\.map/);
});
