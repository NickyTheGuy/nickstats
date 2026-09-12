const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/graphs.js"), "utf8");
const context = vm.createContext({ window: {}, document: {} });
vm.runInContext(source, context);

const { metrics, samplesForMatches, statsForMatch, independentTrendNeedsDates, distributionBounds } = context.window.NickStatsGraphs;

const match = {
  id: 8,
  played_at: 1234,
  result: "w",
  map: "de_mirage",
  sides: [
    { side: "T", stats: { rounds: 12, round_wins: 4, kills: 8, deaths: 7, assists: 2, damage: 950, kast_rounds: 8, he_damage: 42 } },
    { side: "CT", stats: { rounds: 9, round_wins: 9, kills: 11, deaths: 4, assists: 3, damage: 1200, kast_rounds: 7, he_damage: 63 } }
  ]
};

test("graph samples preserve one observation per match and selected side", () => {
  const all = samplesForMatches([match], "ALL");
  const ct = samplesForMatches([match], "CT");

  assert.equal(all.length, 1);
  assert.equal(all[0].id, "8");
  assert.equal(all[0].date, 1234);
  assert.equal(all[0].stats.rounds, 21);
  assert.equal(all[0].stats.he_damage, 105);
  assert.equal(ct[0].stats.rounds, 9);
  assert.equal(ct[0].stats.he_damage, 63);
});

test("graph metric registry calculates per-match rates from matching denominators", () => {
  const stats = statsForMatch(match, "ALL");

  assert.equal(metrics.get("he_dr").value(stats), 5);
  assert.equal(metrics.get("adr").value(stats), 2150 / 21);
  assert.equal(metrics.get("round_win").value(stats), 100 * 13 / 21);
  assert.ok(metrics.get("rating").value(stats) > 0);
  assert.equal(metrics.get("kd").value({ kills: 5, deaths: 0 }), 5);
});

test("matches without qualifying rounds do not become zero-valued observations", () => {
  assert.equal(samplesForMatches([{ id: 9, sides: [] }], "ALL").length, 0);
});

test("independent multi-player trends wait for complete date coverage", () => {
  assert.equal(independentTrendNeedsDates([{ values: [{ date: 100 }] }]), false);
  assert.equal(independentTrendNeedsDates([{ values: [{ date: 100 }] }, { values: [{ date: 0 }] }]), true);
  assert.equal(independentTrendNeedsDates([{ values: [{ date: 100 }] }, { values: [{ date: 200 }] }]), false);
});

test("distribution bounds come from the stable available-player pool", () => {
  const available = [
    { values: [{ value: .8 }, { value: 1.2 }] },
    { values: [{ value: .6 }, { value: 1.5 }] }
  ];
  const bounds = distributionBounds(available);

  assert.equal(bounds.min, .6);
  assert.equal(bounds.max, 1.5);
  const selectedOnly = distributionBounds([available[0]]);
  assert.equal(selectedOnly.min, .8);
  assert.equal(selectedOnly.max, 1.2);
});
