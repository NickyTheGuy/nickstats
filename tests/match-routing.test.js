"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const navigation = fs.readFileSync(path.join(root, "js", "navigation.js"), "utf8");
const demo = fs.readFileSync(path.join(root, "js", "demo.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const queries = fs.readFileSync(path.join(root, "backend", "Sources", "NickStatsAPI", "Queries.swift"), "utf8");

test("account player's team appears first only in matches they played", () => {
  const start = demo.indexOf("  function accountTeamsFirst(match) {");
  const end = demo.indexOf("  function renderMatchListInto(", start);
  assert.ok(start >= 0 && end > start);
  const context = { state: { accountPlayerSteamID: "123" } };
  vm.createContext(context);
  vm.runInContext(`${demo.slice(start, end)}; this.order = accountTeamsFirst;`, context);
  const match = { teams: [{ name: "First" }, { name: "Mine" }], viewer_team_slot: 1 };
  assert.equal(context.order(match).map(team => team.name).join(","), "Mine,First");
  assert.equal(context.order({ ...match, viewer_team_slot: null }).map(team => team.name).join(","), "First,Mine");
  context.state.accountPlayerSteamID = null;
  assert.equal(context.order(match).map(team => team.name).join(","), "First,Mine");
  assert.match(queries, /viewerPlayerID <= 0 \? "NULL AS viewer_team_slot"/);
  assert.match(queries, /vm\.match_id = m\.id AND vm\.player_id =/);
});

test("stored matches use nested hash routes without requiring server rewrites", () => {
  assert.match(navigation, /const routePage = route => String\(route \|\| ""\)\.split\("\/"\)\[0\]/);
  assert.match(navigation, /validMatchDetail = next === "match" && \/\^match\\\/\\d\+\$\//);
  assert.match(demo, /location\.hash\.match\(\/\^#match\\\/\(\\d\+\)\$\//);
  assert.match(demo, /history\[replace \? "replaceState" : "pushState"\]\(routeState, "", route\)/);
  assert.match(demo, /renderMatchListInto\(\$\("matchList"\), matches, match => openStoredMatch\(match\.id\)\)/);
  assert.match(demo, /window\.addEventListener\("hashchange", syncMatchRoute\)/);
});

test("match history restores the list and its prior scroll position", () => {
  assert.match(demo, /nickstatsMatchListScrollY: window\.scrollY/);
  assert.match(demo, /showMatchList\(\{ updateHistory = true, restoreScroll = true \} = \{\}\)/);
  assert.match(demo, /requestAnimationFrame\(\(\) => requestAnimationFrame\(\(\) => window\.scrollTo/);
  assert.match(demo, /if \(location\.hash === "#match"\) showMatchList/);
});

test("match loading reserves page height and cancels obsolete requests", () => {
  assert.match(demo, /detail\.style\.minHeight = `\$\{Math\.ceil\(list\.getBoundingClientRect\(\)\.height\)\}px`/);
  assert.match(demo, /state\.matchDetailController\?\.abort\(\)/);
  assert.match(demo, /signal: controller\.signal/);
  assert.match(demo, /if \(error\.name === "AbortError"\) return/);
  assert.match(html, /Build 2026\.09\.24\.7/);
});

test("match details use a stable, filter-independent map banner", () => {
  assert.match(html, /class="match-banner" id="demoMatchBanner"/);
  assert.doesNotMatch(html, /demoSummary/);
  assert.match(demo, /function renderMatchBanner\(result\)/);
  assert.match(demo, /const teams = Array\.isArray\(result\.teams\) \? result\.teams : \[\]/);
  assert.match(demo, /applyMapArtwork\(banner, mapName\)/);
  assert.match(demo, /\.\/assets\/maps-v2\/\$\{location\.file\}/);
  assert.match(demo, /const matchID = result\.provider_match_id \|\|/);
  assert.match(demo, /identity\.textContent = matchID/);
  assert.doesNotMatch(demo, /match-banner-map/);
  assert.match(demo, /date\.textContent = playedAt === "Unknown" \? "Date unavailable" : playedAt/);
  assert.match(demo, /renderMatchBanner\(result\);/);
  assert.doesNotMatch(demo, /function summaryCard/);
});
