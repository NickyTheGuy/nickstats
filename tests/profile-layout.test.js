"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const profile = fs.readFileSync(path.join(__dirname, "..", "js", "profile.js"), "utf8");

test("round state has its own shared player and group profile tab", () => {
  assert.match(html, /data-player-view="roundState">Round state<\/button>/);
  assert.match(html, /data-player-profile-view="roundState"[\s\S]*?id="playerRoundStateKillStats"[\s\S]*?id="playerRoundStateDeathStats"[\s\S]*?id="playerKillStageStats"[\s\S]*?id="playerTimingAverageStats"[\s\S]*?id="playerPhaseStats"/);
  assert.match(profile, /fillCards\(`\$\{prefix\}RoundStateKillStats`/);
  assert.match(profile, /fillCards\(`\$\{prefix\}RoundStateDeathStats`/);
  assert.match(profile, /element\.dataset\.comboProfileView = element\.dataset\.playerView/);
  assert.match(profile, /element\.dataset\.comboProfilePanel = element\.dataset\.playerProfileView/);
});

test("opening statistics are split by outcome and source of help", () => {
  for (const id of [
    "playerOpeningOutcomeStats", "playerOpeningSupportReceivedStats", "playerOpeningSupportGivenStats",
    "playerOpeningTradeStats", "playerOpeningBlindStats", "playerOpeningEnemySupportStats"
  ]) assert.match(html, new RegExp(`id="${id}"`));
  assert.doesNotMatch(html, /id="playerOpeningStats"/);
  assert.match(profile, /"Rounds involved"/);
  assert.match(profile, /"Kills with teammate help"/);
  assert.match(profile, /"Opening kills assisted"/);
  assert.match(profile, /"Your opening deaths traded"/);
  assert.match(profile, /"Enemy kills with teammate help"/);
});

test("context and overview use focused cards instead of catch-all lists", () => {
  assert.match(html, /id="playerCombatOutputStats"/);
  assert.match(html, /id="playerCombatCostStats"/);
  assert.doesNotMatch(html, /id="playerCombatStats"/);
  for (const id of [
    "playerKillVisibilityStats", "playerDeathVisibilityStats",
    "playerKillReadinessStats", "playerDeathReadinessStats"
  ]) assert.match(html, new RegExp(`id="${id}"`));
  assert.doesNotMatch(html, /id="playerKillContextStats"|id="playerDeathContextStats"/);
});
