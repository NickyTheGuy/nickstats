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
const models = fs.readFileSync(path.join(root, "backend", "Sources", "NickStatsAPI", "Models.swift"), "utf8");
const players = fs.readFileSync(path.join(root, "js", "players.js"), "utf8");

test("match previews use the selected player and match side totals", async () => {
  assert.match(queries, /SUM\(s\.rounds_played\)[\s\S]*?SUM\(s\.kast_rounds\)[\s\S]*?WHERE mp\.player_id = /);
  assert.match(queries, /rating: stats\.rating[\s\S]*?adr: stats\.averageDamagePerRound/);
  assert.match(models, /case viewerStats = "viewer_stats"/);
  assert.match(players, /parameters\.set\("viewer_player_id", profilePlayerID\)/);
  const { previewStats } = await import('../frontend/features/matches/state/match-card.mjs');
  assert.deepEqual(previewStats({ rating: 1.2, kills: 20, deaths: 10, assists: 5, adr: 81.25 }), [['Rating', '1.20'], ['K-D-A', '20-10-5'], ['ADR', '81.3']]);
});

test("match list exposes the database-wide earliest played date for every range picker", () => {
  assert.match(queries, /SELECT MIN\(played_at\) AS earliest_played_at FROM matches/);
  assert.match(models, /struct MatchListResponse:[\s\S]*?case earliestPlayedAt = "earliest_played_at"/);
  assert.match(demo, /NickStatsDateFilterUI\.setEarliest\(payload\.earliest_played_at\)/);
});

test("selected viewer's team appears first only in matches they played", async () => {
  const { teamsFor } = await import('../frontend/features/matches/state/match-card.mjs');
  const match = { teams: [{ name: 'First' }, { name: 'Mine' }], viewer_team_slot: 1 };
  assert.deepEqual(teamsFor(match).map(team => team.name), ['Mine', 'First']);
  assert.deepEqual(teamsFor({ ...match, viewer_team_slot: null }).map(team => team.name), ['First', 'Mine']);
  assert.deepEqual(match.teams.map(team => team.name), ['First', 'Mine']);
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
  assert.match(html, /Build \d{4}\.\d{2}\.\d{2}\.\d+/);
});

test("match details use a stable, filter-independent React banner", () => {
  const banner = fs.readFileSync(path.join(__dirname, "../frontend/features/matches/MatchBanner.jsx"), "utf8");
  assert.match(html, /id="demoMatchBannerApp"/);
  assert.match(demo, /ui\.banner\.update\(\{ result, accountSteamID: state\.accountPlayerSteamID \}\)/);
  assert.match(banner, /artworkFor\(map\)/);
  assert.match(banner, /provider_match_id/);
  assert.match(banner, /Date unavailable/);
  assert.match(banner, /teamResult\(first, second\)/);
});

test("session routes select Player and retain the nested route on reload", () => {
  const buttons = ["match", "players", "groups"].map(page => ({ dataset: { appPage: page }, setAttribute(key, value) { this[key] = value; }, addEventListener(type, handler) { this.click = handler; } }));
  const views = ["match", "players", "groups"].map(page => ({ dataset: { appView: page } }));
  const location = { hash: "#session/1/100" }, events = [];
  vm.runInNewContext(navigation, {
    document: { querySelectorAll: selector => selector === "[data-app-page]" ? buttons : views },
    location, history: { replaceState(_, __, route) { location.hash = route; } },
    window: { NickStatsShellUI: { tabs(_id, config) {
      buttons.forEach((button, index) => { button.click = () => config.onChange(["match", "players", "groups"][index]); });
      return { update({ value }) { buttons.forEach(button => { button["aria-selected"] = String(button.dataset.appPage === value); }); } };
    } }, dispatchEvent(event) { events.push(event); }, addEventListener() {} },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } }
  });
  assert.deepEqual(views.map(view => view.hidden), [true, false, true]);
  assert.equal(buttons[1]["aria-selected"], "true");
  assert.equal(location.hash, "#session/1/100");
  buttons[1].click();
  assert.equal(location.hash, "#session/1/100");
  buttons[0].click();
  assert.equal(location.hash, "#match");
  assert.equal(events.at(-1).detail.page, "match");
});
