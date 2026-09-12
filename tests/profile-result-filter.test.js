const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/filters.js"), "utf8");
const context = vm.createContext({ window: {}, document: {} });
vm.runInContext(source, context);

const { matchResultMatches, resultFilterLabel, scoreBreakdown } = context.window.NickStatsFilters;

test("match result filter keeps the requested result and leaves ALL unfiltered", () => {
  assert.equal(matchResultMatches("w", "ALL"), true);
  assert.equal(matchResultMatches("l", "ALL"), true);
  assert.equal(matchResultMatches("w", "w"), true);
  assert.equal(matchResultMatches("l", "w"), false);
  assert.equal(resultFilterLabel("ALL"), "All results");
  assert.equal(resultFilterLabel("w"), "Wins only");
  assert.equal(resultFilterLabel("l"), "Losses only");
});

test("score breakdown averages scored wins and losses independently", () => {
  const scores = scoreBreakdown([
    { result: "w", score_for: 13, score_against: 7 },
    { result: "w", score_for: 16, score_against: 14 },
    { result: "l", score_for: 9, score_against: 13 },
    { result: "n", score_for: 12, score_against: 12 },
    { result: "w", score_for: null, score_against: null }
  ]);

  assert.equal(scores.wins.count, 2);
  assert.equal(scores.wins.for, 14.5);
  assert.equal(scores.wins.against, 10.5);
  assert.equal(scores.wins.margin, 4);
  assert.equal(scores.losses.count, 1);
  assert.equal(scores.losses.for, 9);
  assert.equal(scores.losses.against, 13);
  assert.equal(scores.losses.margin, -4);
});

test("score breakdown accepts normalized comparison score arrays", () => {
  const rows = [
    { result: "w", score: [13, 4] },
    { result: "l", score: [11, 13] }
  ];
  const scores = scoreBreakdown(rows, {
    scoreFor: row => row.score[0],
    scoreAgainst: row => row.score[1]
  });

  assert.equal(scores.wins.for, 13);
  assert.equal(scores.wins.against, 4);
  assert.equal(scores.losses.for, 11);
  assert.equal(scores.losses.against, 13);
});
