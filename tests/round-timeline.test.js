const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/round-timeline.js"), "utf8"), context);
const timeline = context.window.NickStatsRoundTimeline;
const played = (round, kills, side = "T") => ({ round, kills, side, buy: "full", opponent_buy: "eco", result: "win" });

test("exact numbered rounds average only appearances, including zero kills and a single overtime appearance", () => {
  const matches = Array.from({ length: 6 }, (_, index) => ({
    round_kills: [played(1, 1), played(2, index === 0 ? 2 : 0), ...(index === 0 ? [played(25, 1)] : [])]
  }));
  const points = timeline.averages(matches);
  assert.deepEqual(Array.from(points, point => [point.round, point.value, point.appearances]), [
    [1, 1, 6], [2, 1 / 3, 6], [25, 1, 1]
  ]);
  assert.deepEqual(Array.from(timeline.averages(matches, { phase: "OVERTIME" }), point => point.round), [25]);
  assert.deepEqual(Array.from(timeline.averages(matches, { side: "CT" })), []);
  matches[0].round_kills[2].hero = true;
  assert.deepEqual(Array.from(timeline.averages(matches, { phase: "OVERTIME", heroOnly: true }), point => [point.round, point.appearances]), [[25, 1]]);
});

test("match timeline reads kills, deaths, damage and AWP kills from one played round", () => {
  const slice = { stats: { kda: [2, 1, 0, 1, 143], weapons: [["awp", 1, 2, 89, 1, 1], ["ak47", 1, 2, 54, 1, 1]] } };
  assert.deepEqual(Object.keys(timeline.metrics).map(metric => timeline.metricValue(slice, metric)), [2, 1, 143, 1]);
});
