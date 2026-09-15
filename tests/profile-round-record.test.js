"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const source = fs.readFileSync(path.join(__dirname, "..", "js", "profile.js"), "utf8");

test("unfiltered profile rounds show wins, losses, and win rate", () => {
  assert.match(source, /roundLosses = Math\.max\(0, rounds - roundWins\)/);
  assert.match(source, /roundResult === "ALL"[\s\S]*?roundWins[\s\S]*?roundLosses[\s\S]*?100 \* ratio\(roundWins, rounds\)/);
  assert.match(source, /"Winning rounds only" : "Losing rounds only"/);
});
