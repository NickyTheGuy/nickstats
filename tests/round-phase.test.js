const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/demo.js"), "utf8");
const helpers = source.slice(source.indexOf("  function numberValue("), source.indexOf("  function setMatchBrowserView("));
const economy = source.slice(source.indexOf("  function economyBuyType("), source.indexOf("  async function parseDemo()"));
const context = vm.createContext({});
vm.runInContext(`${helpers}\n${economy}`, context);

const round = (number, kills, side = "T") => ({
  round: number, side, buy: "full", opponent_buy: "eco", result: "win",
  stats: { rounds: [1, 1], kda: [kills, 0, 0, 0, kills * 100], kast_rounds: 1,
    kill_rounds: [Number(kills === 1), Number(kills === 2), 0, 0, 0],
    true_kill_rounds: [0, Number(kills === 2), 0, 0, 0],
    true_multikill_rounds: Number(kills === 2), profile: Array(16).fill(0) }
});

test("round 24 is Regulation and round 25 is Overtime in stored match combinations", () => {
  const payload = {
    schema: "nickstats.match/22", rounds: 25,
    players: [{ name: "Nick", steam_id: "123", sides: [{}, {}], round_slices: [round(24, 1), round(25, 2)] }],
    teams: [{ id: "2", name: "A", score: 2, side_scores: [2, 0], players: [0] },
      { id: "3", name: "B", score: 0, side_scores: [0, 0], players: [] }],
    round_timing: [[24, 0, 10, 10, "T", null], [25, 11, 20, 9, "T", null]],
    round_economy: [[24, 20000, 2000, 5, 5, false, 0, 1], [25, 20000, 2000, 5, 5, false, 0, 1]],
    death_events: []
  };
  const regulation = context.expandStoredMatch(payload, 1, "REGULATION");
  const overtime = context.expandStoredMatch(payload, 1, "OVERTIME");
  assert.equal(regulation.teams[0].players[0].kills, 1);
  assert.equal(regulation.teams[0].players[0].rounds_played, 1);
  assert.equal(overtime.teams[0].players[0].kills, 2);
  assert.equal(overtime.teams[0].players[0].true_kill_rounds[2], 1);
  assert.equal(overtime.teams[0].players[0].by_economy_matchup.eco.full.win.T.rounds_played, 1);
  assert.equal(regulation.teams[0].score, 1);
  assert.equal(overtime.teams[0].score, 1);
});
