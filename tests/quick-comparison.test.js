"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const componentSource = fs.readFileSync(path.join(__dirname, "..", "js", "quick-comparison.js"), "utf8");
const scoreboardSource = fs.readFileSync(path.join(__dirname, "..", "js", "scoreboard.js"), "utf8");
const compareSource = fs.readFileSync(path.join(__dirname, "..", "js", "groups.js"), "utf8");
const playersSource = fs.readFileSync(path.join(__dirname, "..", "js", "players.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const workspace = fs.readFileSync(path.join(__dirname, "../frontend/features/navigation/WorkspaceTabs.jsx"), "utf8");
const controlsSource = fs.readFileSync(path.join(__dirname, "../frontend/shared/scoreboard/ComparisonControls.jsx"), "utf8");
const viewSource = fs.readFileSync(path.join(__dirname, "../frontend/shared/scoreboard/Scoreboard.jsx"), "utf8");
const tableSource = fs.readFileSync(path.join(__dirname, "../frontend/shared/scoreboard/ScoreboardTable.jsx"), "utf8");
const styles = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");

test("match and quick comparison use React scoreboards without legacy DOM rendering", () => {
  const shared = html.indexOf("./js/scoreboard.js");
  assert.ok(shared >= 0 && shared < html.indexOf("./js/demo.js"));
  assert.match(componentSource, /const Scoreboard = window\.NickStatsScoreboard/);
  assert.doesNotMatch(componentSource, /createElement|replaceChildren|appendChild/);
  assert.doesNotMatch(scoreboardSource, /createElement|appendGroupHeader|renderControls/);
});

test("quick comparison uses the scoreboard rating colors", () => {
  assert.match(componentSource, /demo-rating.*rating-good.*rating-bad.*rating-average/);
});

test("quick comparison shows filtered rounds instead of redundant match count", () => {
  assert.match(componentSource, /key: "rounds", label: "Rounds"/);
  assert.doesNotMatch(componentSource, /key: "matches", label: "Matches"/);
});

test("quick comparison sections are selectable and remain expandable", () => {
  assert.match(componentSource, /expandedGroups: Object\.fromEntries\(columnGroups\.map\(\(\[key\]\) => \[key, false\]\)\)/);
  assert.match(componentSource, /const defaultSections = \["overview", "opening", "rounds"\]/);
  assert.match(componentSource, /SECTION_STORAGE_KEY = "nickstats\.quickComparisonSections\.v2"/);
  assert.match(scoreboardSource, /const sections = Object\.freeze/);
  assert.match(componentSource, /\.filter\(segment => !segment\.group \|\| groupVisible\(segment\.group\)\)/);
  assert.match(scoreboardSource, /\["rounds", "Rounds", \["clutches", "multikills", "objectives"\], "rounds"\]/);
  assert.match(scoreboardSource, /\["roundState", "Round state", \["roundState", "killStage", "timing"\], "roundState"\]/);
  assert.match(scoreboardSource, /\["context", "Context", \["killContext"\], "killContext"\]/);
  assert.match(html, /id="comboQuickApp"/);
  assert.match(html, /id="playerQuickApp"/);
  assert.match(componentSource, /group: "combat", label: "Overview"/);
  assert.match(componentSource, /key: "combat", label: "K-D-A"/);
  assert.match(componentSource, /group: "opening", label: "Opening"/);
  assert.match(componentSource, /key: "opening-assisted", label: "Assisted K"/);
  assert.match(componentSource, /key: "opening-damage-assisted", label: "Dmg A"/);
  assert.match(componentSource, /key: "opening-flash-assisted", label: "K on ally flash"/);
  assert.match(componentSource, /group: "clutches", label: "Clutches"/);
  assert.match(componentSource, /group: "killContext", label: "Context"/);
  assert.match(componentSource, /group: "roundState", label: "Man count"/);
  assert.match(componentSource, /key: "context-clawback-bozo", label: "Clawback-Bozo K-D"/);
  assert.match(componentSource, /key: "context-cleanup", label: "Cleanup K-D"/);
  assert.match(componentSource, /key: "kill-context", label: "Bullshit K-D"/);
  assert.match(componentSource, /group: "killStage", label: "Kill stage"/);
  assert.match(componentSource, /label: `\$\{alive\} alive K-D`/);
  for (const [group, label] of [
    ["trades", "Trades"], ["movement", "Movement"], ["utility", "Utility"],
    ["multikills", "Kill rounds"], ["objectives", "Objectives"], ["timing", "Round timing"]
  ]) {
    assert.match(componentSource, new RegExp(`group: "${group}", label: "${label}"`));
    assert.match(styles, new RegExp(`\\.${group}-cell \\{ background:`));
  }
  assert.match(componentSource, /key: "trades", label: "K-D"/);
  assert.match(componentSource, /key: "movement", label: "Move\/run\/air"/);
  assert.match(componentSource, /key: "utility", label: "Damage · thrown"/);
  assert.match(componentSource, /key: "multikills", label: "Total"/);
  assert.match(componentSource, /key: "objectives", label: "Plants\/defuses"/);
  assert.match(componentSource, /key: "timing", label: "Avg K\/D time"/);
  assert.match(tableSource, /demo-toggle-heading[\s\S]*?heading\.group/);
  assert.match(styles, /\.quick-comparison-table :is\(th, td\)\.demo-group-start/);
  assert.match(styles, /\.opening-cell \{ background:/);
  assert.match(styles, /\.clutches-cell \{ background:/);
  assert.match(styles, /\.killStage-cell \{ background:/);
  assert.match(styles, /\.player-profile-table\.quick-comparison-table :is\(th, td\) \{ text-align: center; \}/);
  assert.match(styles, /th\.demo-toggle-heading,[\s\S]*?th\.demo-group-detail \{ padding: 0; \}/);
  assert.match(styles, /\.player-profile-table\.quick-comparison-table \.player-table-sort-button \{[\s\S]*?min-height: 38px;[\s\S]*?text-align: center;/);
});

test("Groups is its own page with no old Compare or Matrix workspace", () => {
  assert.match(html, /id="appNavigationApp"/);
  assert.doesNotMatch(html, /data-app-page="(?:compare|matrix)"|id="(?:compare|matrix)PageTab"/);
  const navigation = fs.readFileSync(path.join(__dirname, "..", "js", "navigation.js"), "utf8");
  assert.match(navigation, /new Set\(\["match", "players", "groups"\]\)/);
  assert.doesNotMatch(navigation, /matrix|requestedPage === "compare"/);
  assert.doesNotMatch(compareSource, /workspace|buildAnalysis|renderMatrix|setCompareMode|setWorkspace/);
  assert.match(compareSource, /GROUP_DATA_ENDPOINT = "\/nickstats\/api\/groups"/);
  assert.doesNotMatch(compareSource, /\/nickstats\/api\/compare/);
  assert.doesNotMatch(html, /matrixMapFilter|data-compare-mode|data-compare-view|compareMetricGroup/);
});

test("quick comparison puts summary columns before collapsible combat", () => {
  assert.match(componentSource, /key: "player", label: "Player"[\s\S]*?key: "rating", label: "Rating"[\s\S]*?key: "win-rate", label: comparison\[0\]\?\.stats\.winRateKind === "round" \? "Round win rate" : "Match win rate"[\s\S]*?key: "rounds", label: "Rounds"[\s\S]*?key: "kast", label: "KAST"/);
  assert.match(playersSource, /winRate: summary\.winRate/);
  assert.match(componentSource, /\{ columns: fixedColumns \},\s*\{ group: "combat", label: "Overview", columns: focusedColumns\("combat", combatColumns\) \},\s*\{ group: "opening"/);
});

test("quick comparison uses shared React sections, rate controls and measured table headers", () => {
  assert.match(controlsSource, /scoreboard-section-bar scoreboard-control-row/);
  assert.match(controlsSource, /Per grenade/);
  assert.match(controlsSource, /<ToggleGroup/);
  assert.match(componentSource, /state\.valueMode === "match" \? item\.rows\.length : number\(item\.stats\.rounds\)/);
  assert.match(componentSource, /"utility-enemies-flashed": "flash"/);
  assert.match(componentSource, /const kda = formatted\.match/);
  assert.match(viewSource, /cloneNode\(true\)/);
  assert.match(viewSource, /getBoundingClientRect\(\)\.width/);
  assert.match(viewSource, /scrollGroupIntoView/);
  assert.match(viewSource, /event\.key\?\.toLowerCase\(\) !== 'r'/);
  assert.match(tableSource, /onClick=\{event => cycleGroup/);
  assert.match(scoreboardSource, /multikills: \[\["regular", "Regular"[\s\S]*?\["true", "True"/);
  assert.doesNotMatch(componentSource, /scoreboard-subgroup-bar/);
});

test("quick comparison preserves sorts when unrelated sections change", () => {
  assert.match(componentSource, /group: column\.group \|\| null/);
  assert.match(componentSource, /const sortedGroup = state\.sort\?\.group/);
  assert.match(componentSource, /sortedGroup === group \|\| \(next && sortedGroup && state\.expandedGroups\[sortedGroup\]\)/);
  assert.match(componentSource, /if \(state\.sort\?\.group && !groupVisible\(state\.sort\.group\)\) state\.sort = null/);
  assert.doesNotMatch(componentSource, /state\.expandedGroups\[segment\.group\] = next; state\.sort = null/);
});

test("quick comparison serves the group scoreboard and standalone player profiles", () => {
  assert.match(componentSource, /window\.NickStatsQuickComparison = \{ create, model \}/);
  assert.match(playersSource, /NickStatsComparisonUI\.create\(\{ prefix: "player"(?:,| \})/);
  assert.match(compareSource, /NickStatsComparisonUI\.create\(\{ prefix: "combo"(?:,| \})/);
  assert.doesNotMatch(html, />Profiles<\/button>/);
  assert.match(workspace, /\['quick', 'Quick comparison'/);
  assert.match(html, /data-player-display-panel="profile"/);
  assert.match(html, /data-player-display-panel="quick" hidden/);
  assert.doesNotMatch(html, /id="playerQuickPlayers"/);
  assert.doesNotMatch(html, /id="playerQuickPlayerStatus"/);
  assert.match(html, /id="playerQuickApp"/);
  assert.match(html, /id="comboQuickApp"/);
});

test("player and group quick comparisons use the same panel card", () => {
  assert.match(html, /class="panel quick-comparison-panel combo-display-panel"/);
  assert.match(html, /class="panel quick-comparison-panel player-quick-comparison player-display-panel"/);
  assert.doesNotMatch(styles, /\.player-quick-comparison \{[^}]*padding:\s*0/);
});

test("player and group quick-comparison switches sit above shared filters", () => {
  assert.match(html, /id="comboProfilePlayersApp"[\s\S]*?class="stats-toolbar combo-profile-toolbar"/);
  assert.match(html, /id="playerOpenProfilesApp"[\s\S]*?class="stats-toolbar"/);
  assert.equal((html.match(/id="comboProfilePlayersApp"/g) || []).length, 1);
  assert.match(playersSource, /function setPlayerDisplay\(display\)[\s\S]*?data-player-display-panel/);
  assert.match(playersSource, /onDisplay: setPlayerDisplay/);
  assert.match(compareSource, /onDisplay: setComboDisplay/);
});

test("player, group, and match views share a two-row economy matchup control", () => {
  for (const attribute of ["data-player-buy", "data-player-enemy-buy", "data-group-buy", "data-group-enemy-buy", "data-demo-buy", "data-demo-enemy-buy"]) {
    assert.match(fs.readFileSync(path.join(__dirname, "../frontend/features/filters/state/segmented-config.mjs"), "utf8"), new RegExp(attribute));
  }
  assert.match(html, /economy-matchup-title">Economy matchup/);
  assert.match(html, />Your buy</);
  assert.match(html, />Enemy buy</);
  assert.match(styles, /\.economy-matchup-filter \{/);
  assert.match(playersSource, /opponent_buy_type/);
  assert.match(compareSource, /opponent_buy_type/);
});

test("quick comparison and graphs precede individual players in both workspace tab lists", () => {
  assert.equal((workspace.match(/\['quick', 'Quick comparison'/g) || []).length, 2);
  assert.equal((workspace.match(/\['graphs', 'Graphs'/g) || []).length, 2);
  assert.match(workspace, /'Quick comparison'[\s\S]*?'Graphs'[\s\S]*?profiles\.map/);
});

test("quick comparison uses every open profile while graphs auto-select new profiles", () => {
  assert.match(playersSource, /graphPlayers: new Set\(\)/);
  assert.match(playersSource, /players: \[\.\.\.state\.profiles\.entries\(\)\][\s\S]*?\.map\(\(\[id, candidate\]\)/);
  assert.doesNotMatch(playersSource, /playerQuickPlayers|playerQuickPlayerStatus/);
  assert.match(playersSource, /if \(state\.graphPlayers\.size < MAX_GRAPH_PLAYERS\) state\.graphPlayers\.add\(key\)/);
  assert.match(playersSource, /if \(state\.display === "quick"\) renderQuickComparison\(\);/);
  assert.match(playersSource, /if \(state\.display === "graphs"\) \{ renderGraphPlayers\(\); renderGraphs\(\); \}/);
  assert.match(playersSource, /summaryCache \|\|= new Map\(\)/);
});

test("player filters and detail tab are shared across every open profile", () => {
  assert.match(playersSource, /display: "profile", view: "overview"/);
  assert.match(playersSource, /side: "ALL", buy: "ALL", heroOnly: false, opponentBuy: "ALL", roundResult: "ALL", roundPhase: "ALL", result: "ALL", maps: \[\]/);
  assert.match(playersSource, /function setPlayerView\(view\) \{\s*state\.view = view/);
  assert.match(playersSource, /setPlayerView\(state\.view\); setPlayerDisplay\(state\.display\)/);
  assert.match(playersSource, /function matchesFor\(payload\)[\s\S]*?new Set\(state\.maps\)[\s\S]*?state\.result/);
  assert.match(playersSource, /aggregate\(matches, state\.side, state\.buy, state\.roundResult, state\.opponentBuy, state\.roundPhase, state\.heroOnly\)/);
  assert.match(playersSource, /mapFilter\.setOptions\(availableMaps\); state\.maps = mapFilter\.values\(\)/);
  assert.match(playersSource, /state\.profiles\.set\(key, \{ payload \}\)/);
  assert.doesNotMatch(playersSource, /profile\.view|activeProfile\(\)\.view/);
  assert.doesNotMatch(playersSource, /profile\.(?:side|buy|opponentBuy|roundResult|result|maps)/);
});

test("groups restore the most recent roster and include or exclude roles", () => {
  assert.match(compareSource, /GROUP_SELECTION_KEY = "nickstats\.groupSelection\.v1"/);
  assert.match(compareSource, /const savedRoster = readSavedRoster\(\)/);
  assert.match(compareSource, /selected: new Map\(savedRoster\.map/);
  assert.match(compareSource, /choices: new Map\(savedRoster\.map/);
  assert.match(compareSource, /roster\.length >= MAX_GROUP/);
  assert.match(compareSource, /included >= MAX_INCLUDED \? "exclude"/);
  assert.match(compareSource, /localStorage\.setItem\(GROUP_SELECTION_KEY, JSON\.stringify\(rows\)\)/);
  assert.match(compareSource, /else localStorage\.removeItem\(GROUP_SELECTION_KEY\)/);
});
