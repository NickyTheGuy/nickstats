const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/graphs.js"), "utf8");
const availabilitySource = fs.readFileSync(path.join(__dirname, "../js/stat-availability.js"), "utf8");
const context = vm.createContext({ window: {}, document: {} });
vm.runInContext(availabilitySource, context);
vm.runInContext(source, context);

const { metrics, metricChoices, samplesForMatches, statsForMatch, independentTrendNeedsDates, distributionBounds, niceDistributionBounds, parseBucketRange, parseCutoffs, dateTicks } = context.window.NickStatsGraphs;

test("manual cutoffs accept ordered CSV values and reject invalid boundaries", () => {
  assert.deepEqual(Array.from(parseCutoffs("5, 10, 15").edges), [5, 10, 15]);
  for (const input of ["", "5, 5", "10, 5", "5,", "5; 10", "5, Infinity"]) {
    assert.ok(parseCutoffs(input).error, input);
  }
});

test("trend date ticks change from days to months to years with the visible span", () => {
  const start = Date.UTC(2026, 0, 1) / 1000;
  const days = dateTicks(start, start + 7 * 86400);
  assert.ok(days.length >= 4);
  const months = dateTicks(start, Date.UTC(2027, 0, 1) / 1000);
  assert.ok(months.length >= 4 && months.length <= 8);
  const years = dateTicks(start, Date.UTC(2034, 0, 1) / 1000);
  assert.ok(years.length >= 4 && years.every(tick => /^20\d\d$/.test(tick.label)));
});

test("custom range makes evenly sized buckets with a partial last bucket", () => {
  assert.deepEqual(Array.from(parseBucketRange("0", "30", "5").edges), [0, 5, 10, 15, 20, 25, 30]);
  assert.deepEqual(Array.from(parseBucketRange("-1.5", "1", ".75").edges), [-1.5, -.75, 0, .75, 1]);
  for (const values of [["", "10", "2"], ["10", "5", "1"], ["0", "10", "0"], ["0", "10", "Infinity"], ["0", "100", "1"]]) {
    assert.ok(parseBucketRange(...values).error, values.join(", "));
  }
});

test("graph categories keep the selector small and search across categories", () => {
  const core = metricChoices("Core", "");
  assert.equal(core.length, 1);
  assert.equal(core[0][0], "Core");
  assert.ok(core[0][1].some(([id]) => id === "kills"));
  const search = metricChoices("Core", "flash assists");
  assert.ok(search.some(([group, entries]) => group === "Utility" && entries.some(([id]) => id === "flash_assists_r")));
  assert.equal(metricChoices("Core", "unfindable statistic").length, 0);
});

const match = {
  id: 8,
  schema: "nickstats.match/16",
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

test("graph samples select a buy slice without mixing in all-buy rows", () => {
  const source = [{
    id: 9, sides: [
      { side: "T", buy_type: "ALL", stats: { rounds: 12, kills: 12 } },
      { side: "T", buy_type: "full", stats: { rounds: 5, kills: 8 } },
      { side: "CT", buy_type: "full", stats: { rounds: 4, kills: 3 } }
    ]
  }];
  const [sample] = samplesForMatches(source, "ALL", "full");
  assert.equal(sample.stats.rounds, 9);
  assert.equal(sample.stats.kills, 11);
});

test("graph samples compose buy and round-result slices", () => {
  const source = [{ id: 10, sides: [
    { side: "T", buy_type: "full", round_result: "ALL", stats: { rounds: 6, kills: 9 } },
    { side: "T", buy_type: "full", round_result: "win", stats: { rounds: 4, kills: 8 } },
    { side: "T", buy_type: "full", round_result: "loss", stats: { rounds: 2, kills: 1 } }
  ] }];
  const [sample] = samplesForMatches(source, "T", "full", "win");
  assert.equal(sample.stats.rounds, 4);
  assert.equal(sample.stats.kills / sample.stats.rounds, 2);
});

test("graph samples compose own and opponent economy filters", () => {
  const source = [{ id: 11, schema: "nickstats.match/18", sides: [
    { side: "T", buy_type: "full", opponent_buy_type: "eco", round_result: "win", stats: { rounds: 3, kills: 7 } },
    { side: "T", buy_type: "force", opponent_buy_type: "eco", round_result: "loss", stats: { rounds: 2, kills: 2 } },
    { side: "T", buy_type: "full", opponent_buy_type: "full", round_result: "win", stats: { rounds: 4, kills: 4 } }
  ] }];
  const [fullVsEco] = samplesForMatches(source, "T", "full", "ALL", "eco");
  const [allVsEco] = samplesForMatches(source, "T", "ALL", "ALL", "eco");

  assert.equal(fullVsEco.stats.rounds, 3);
  assert.equal(fullVsEco.stats.kills, 7);
  assert.equal(allVsEco.stats.rounds, 5);
  assert.equal(allVsEco.stats.kills, 9);
});

test("phase selection composes with side, buys, and result without double counting All", () => {
  const source = [{ id: 12, schema: "nickstats.match/22", sides: [
    { side: "T", buy_type: "ALL", opponent_buy_type: "ALL", round_result: "ALL", stats: { rounds: 25, kills: 26 } },
    { side: "T", buy_type: "ALL", opponent_buy_type: "ALL", round_result: "ALL", round_phase: "REGULATION", stats: { rounds: 24, kills: 24 } },
    { side: "T", buy_type: "ALL", opponent_buy_type: "ALL", round_result: "ALL", round_phase: "OVERTIME", stats: { rounds: 1, kills: 2 } },
    { side: "T", buy_type: "full", opponent_buy_type: "eco", round_result: "win", round_phase: "OVERTIME", stats: { rounds: 1, kills: 2 } }
  ] }];
  assert.equal(statsForMatch(source[0]).rounds, 25);
  assert.equal(statsForMatch(source[0], "T", "ALL", "ALL", "ALL", "REGULATION").rounds, 24);
  assert.equal(statsForMatch(source[0], "T", "ALL", "ALL", "ALL", "OVERTIME").kills, 2);
  assert.equal(statsForMatch(source[0], "T", "ALL", "ALL", "eco", "OVERTIME").rounds, 1);
  assert.equal(samplesForMatches(source, "T", "full", "loss", "eco", "OVERTIME").length, 0);
});

test("hero scope selects only its holder and preserves the force total", () => {
  const source = [{ id: 13, schema: "nickstats.match/23", sides: [
    { side: "T", buy_type: "force", opponent_buy_type: "ALL", round_result: "ALL", stats: { rounds: 3, kills: 5 } },
    { side: "T", buy_type: "force", opponent_buy_type: "ALL", round_result: "ALL", round_phase: "ALL", hero: true, stats: { rounds: 1, kills: 2 } },
    { side: "T", buy_type: "force", opponent_buy_type: "ALL", round_result: "ALL", round_phase: "OVERTIME", hero: true, stats: { rounds: 1, kills: 2 } }
  ] }];
  assert.equal(statsForMatch(source[0], "T", "force").rounds, 3);
  assert.equal(statsForMatch(source[0], "T", "force", "ALL", "ALL", "ALL", true).kills, 2);
  assert.equal(samplesForMatches(source, "T", "force", "ALL", "ALL", "OVERTIME", true)[0].stats.rounds, 1);
});

test("graph metric registry calculates per-match rates from matching denominators", () => {
  const stats = statsForMatch(match, "ALL");

  assert.equal(metrics.get("he_dr").value(stats), 5);
  assert.equal(metrics.get("adr").value(stats), 2150 / 21);
  assert.equal(metrics.get("round_win").value(stats), 100 * 13 / 21);
  assert.equal(metrics.get("opening_attempt_rate").value({ rounds: 20, opening_kills: 3, opening_deaths: 2 }), 25);
  assert.equal(metrics.get("opening_assist_rate").value({ __schema: "nickstats.match/15", rounds: 20, opening_kills: 5, opening_assisted_kills: 3 }), 60);
  assert.equal(Number.isNaN(metrics.get("opening_assist_rate").value({ __schema: "nickstats.match/14", rounds: 20, opening_kills: 5, opening_assisted_kills: 0 })), true);
  assert.equal(metrics.get("opening_enemy_assisted_dpr").value({ __schema: "nickstats.match/17", rounds: 20, opening_enemy_assisted_deaths: 2 }), .1);
  assert.equal(Number.isNaN(metrics.get("opening_enemy_assisted_dpr").value({ __schema: "nickstats.match/16", rounds: 20, opening_enemy_assisted_deaths: 0 })), true);
  assert.equal(metrics.get("team_win_survivors").value({ team_win_survivor_total: 27, team_win_survivor_rounds: 12 }), 2.25);
  assert.equal(metrics.get("opponent_win_survivors").value({ opponent_win_survivor_total: 18, opponent_win_survivor_rounds: 10 }), 1.8);
  assert.equal(Number.isNaN(metrics.get("team_win_survivors").value({})), true);
  assert.ok(metrics.get("rating").value(stats) > 0);
  assert.equal(metrics.get("kd").value({ kills: 5, deaths: 0 }), 5);
});

test("AWP kills are counted from the selected match slice", () => {
  const match = { schema: "nickstats.match/22", sides: [
    { side: "T", buy_type: "ALL", opponent_buy_type: "ALL", round_result: "ALL", round_phase: "ALL", stats: { rounds: 5 }, weapons: [{ weapon: "awp", kills: 2 }, { weapon: "ak47", kills: 4 }] },
    { side: "CT", buy_type: "ALL", opponent_buy_type: "ALL", round_result: "ALL", round_phase: "ALL", stats: { rounds: 4 }, weapons: [{ weapon: "awp", kills: 1 }] }
  ] };
  assert.equal(metrics.get("awp_kills").value(statsForMatch(match, "T")), 2);
  assert.equal(metrics.get("awp_kills").value(statsForMatch(match)), 3);
});

test("round timing rates ignore unreparsed rounds", () => {
  const timing = { rounds: 24, timed_rounds: 12, early_kills: 3, kill_time_samples: 2, kill_time_total_ms: 70000 };
  assert.equal(metrics.get("early_kr").value(timing), .25);
  assert.equal(metrics.get("kill_time").value(timing), 35);
  assert.equal(Number.isNaN(metrics.get("early_kr").value({ rounds: 24, early_kills: 0 })), true);
  assert.equal(Number.isNaN(metrics.get("kill_time").value({ rounds: 24 })), true);
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

test("distribution boundaries align with the statistic's displayed precision", () => {
  const series = [{ values: [{ value: .9 }, { value: 1.97 }] }];
  const bounds = niceDistributionBounds(series, { digits: 2 }, 10);

  assert.equal(Number(bounds.binWidth.toFixed(2)), .11);
  assert.equal(Number(bounds.min.toFixed(2)), .88);
  assert.equal(Number(bounds.max.toFixed(2)), 1.98);
});
