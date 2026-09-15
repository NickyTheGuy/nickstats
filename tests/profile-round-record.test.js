"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const source = fs.readFileSync(path.join(__dirname, "..", "js", "profile.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const styles = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");

test("unfiltered profile rounds show wins, losses, and win rate", () => {
  assert.match(source, /roundLosses = Math\.max\(0, rounds - roundWins\)/);
  assert.match(source, /roundResult === "ALL"[\s\S]*?roundWins[\s\S]*?roundLosses[\s\S]*?100 \* ratio\(roundWins, rounds\)/);
  assert.match(source, /"Winning rounds only" : "Losing rounds only"/);
});

test("objectives and round timing have first-class player and group profile sections", () => {
  assert.match(html, /data-player-view="objectives">Objectives<\/button>/);
  assert.match(html, /data-player-profile-view="objectives"[\s\S]*?id="playerObjectiveStats"/);
  assert.match(html, /data-player-view="timing">Round timing<\/button>/);
  assert.match(html, /data-player-profile-view="timing"[\s\S]*?id="playerTimingAverageStats"[\s\S]*?id="playerPhaseStats"/);
  assert.match(source, /element\.dataset\.comboProfileView = element\.dataset\.playerView/);
  assert.match(source, /element\.dataset\.comboProfilePanel = element\.dataset\.playerProfileView/);
  assert.match(styles, /data-combo-profile-view="objectives"[\s\S]*?var\(--section-objectives\)/);
  assert.match(styles, /data-combo-profile-view="timing"[\s\S]*?var\(--section-timing\)/);
});
