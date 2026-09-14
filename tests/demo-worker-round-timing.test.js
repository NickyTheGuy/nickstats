"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const workerPath = path.join(__dirname, "..", "js", "demo-worker.js");
const source = fs.readFileSync(workerPath, "utf8");
const frontendSource = fs.readFileSync(path.join(__dirname, "..", "js", "demo.js"), "utf8");
const indexSource = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

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

test("match survivor display compares each winning team separately", () => {
  assert.match(indexSource, /id="demoSurvivorTeams"/);
  assert.match(frontendSource, /economyByRound/);
  assert.match(frontendSource, /String\(row\.teamID\) === String\(team\.id\)/);
  assert.match(frontendSource, /demo-survivor-team/);
});

test("freeze end captures authoritative team equipment values", () => {
  assert.match(source, /m_unFreezetimeEndEquipmentValue/);
  assert.match(source, /round\.economySnapshot = \{ values, players \}/);
  assert.match(source, /roundEconomies\.push\(/);
  assert.match(source, /pistol_round: pistolRound/);
});

test("only regulation rounds one and thirteen are pistol rounds", () => {
  const classified = vm.runInContext("Array.from({ length: 30 }, (_, index) => index + 1).filter(isRegulationPistolRound)", workerContext());
  assert.deepEqual(Array.from(classified), [1, 13]);
  assert.match(source, /isRegulationPistolRound\(completedRounds \+ 1\)/);
  assert.doesNotMatch(source, /firstHalfTTeam|regulationHalftimeSeen/);
});

test("a rifle and armor team loadout counts as a full buy", () => {
  const classifications = vm.runInContext(`[
    equipmentBuyType(5 * 3900, 5),
    equipmentBuyType(5 * 3550, 5),
    equipmentBuyType(5 * 3400, 5),
    equipmentBuyType(5 * 1000, 5)
  ]`, workerContext());
  assert.deepEqual(Array.from(classifications), ["full", "full", "force", "eco"]);
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

test("schema 14 uploads survivor rows separately from stable timing rows", () => {
  assert.match(frontendSource, /schema: "nickstats\.match\/14"/);
  assert.match(frontendSource, /round_survivors: \(result\.round_timing \|\| \[\]\)\.map/);
  assert.match(frontendSource, /round_economy: \(result\.round_economy \|\| \[\]\)\.map/);
});

test("round economy migration stores values, roster sizes, pistol flag, and team identity", () => {
  const migration = fs.readFileSync(path.join(__dirname, "..", "database", "migrations", "005_round_economy.sql"), "utf8");
  for (const column of ["t_equipment_value", "ct_equipment_value", "t_player_count", "ct_player_count", "pistol_round", "t_match_team_id", "ct_match_team_id"]) {
    assert.match(migration, new RegExp(`\\b${column}\\b`));
  }
});

test("round-result migration stores composable side and buy dimensions", () => {
  const migration = fs.readFileSync(path.join(__dirname, "..", "database", "migrations", "007_player_round_result_stats.sql"), "utf8");
  for (const column of ["match_player_id", "side", "buy_type", "round_result", "stats_json"]) {
    assert.match(migration, new RegExp(`\\b${column}\\b`));
  }
});

test("side damage is not counted again when round deltas are allocated", () => {
  assert.equal(vm.runInContext('ADDITIVE_STAT_FIELDS.includes("damage")', workerContext()), true);
  assert.match(source, /ensureSideRow\(row, attackerTeam\)\.damage \+= damage/);
  assert.match(source, /applyRoundDelta\(target, row, after, before, awardedWin, true\)/);
  assert.match(source, /skipEventAttributedDamage && field === "damage"/);
});

test("failed uploads leave the compact match available for download", () => {
  assert.match(indexSource, /id="demoParsedDownloadButton"[^>]*hidden/);
  assert.match(frontendSource, /state\.parsedResult = result;\s*\$\("demoParsedDownloadButton"\)\.hidden = false/);
  assert.match(frontendSource, /compactMatchResult\(state\.parsedResult\)/);
});

test("zstd failures direct the user to manual extraction without a compatibility decoder", () => {
  assert.doesNotMatch(source, /NickStatsZstdWasm|ZSTD_WASM_URL|decompressZstdWithWasm/);
  assert.match(source, /Extract the \.dem manually and select it instead/);
});
