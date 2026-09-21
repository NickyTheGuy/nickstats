"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const componentSource = fs.readFileSync(path.join(__dirname, "..", "js", "quick-comparison.js"), "utf8");
const compareSource = fs.readFileSync(path.join(__dirname, "..", "js", "compare.js"), "utf8");
const playersSource = fs.readFileSync(path.join(__dirname, "..", "js", "players.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const styles = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");

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
  assert.match(componentSource, /sectionOptions = Object\.freeze/);
  assert.match(componentSource, /\.filter\(segment => !segment\.group \|\| groupVisible\(segment\.group\)\)/);
  assert.match(componentSource, /\["rounds", "Rounds", \["clutches", "multikills", "objectives"\], "rounds"\]/);
  assert.match(componentSource, /\["roundState", "Round state", \["roundState", "killStage", "timing"\], "roundState"\]/);
  assert.match(componentSource, /\["context", "Context", \["killContext"\], "killContext"\]/);
  assert.match(html, /id="comboQuickSections"/);
  assert.match(html, /id="playerQuickSections"/);
  assert.match(componentSource, /group: "combat", label: "Overview"/);
  assert.match(componentSource, /key: "combat", label: "K-D-A"/);
  assert.match(componentSource, /group: "opening", label: "Opening"/);
  assert.match(componentSource, /key: "opening-assisted", label: "Assisted K"/);
  assert.match(componentSource, /key: "opening-damage-assisted", label: "Dmg A"/);
  assert.match(componentSource, /key: "opening-flash-assisted", label: "Flash A"/);
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
  assert.match(componentSource, /demo-toggle-heading.*-heading/);
  assert.match(styles, /\.quick-comparison-table :is\(th, td\)\.demo-group-start/);
  assert.match(styles, /\.opening-cell \{ background:/);
  assert.match(styles, /\.clutches-cell \{ background:/);
  assert.match(styles, /\.killStage-cell \{ background:/);
  assert.match(styles, /\.player-profile-table\.quick-comparison-table :is\(th, td\) \{ text-align: center; \}/);
  assert.match(styles, /th\.demo-toggle-heading,[\s\S]*?th\.demo-group-detail \{ padding: 0; \}/);
  assert.match(styles, /\.player-profile-table\.quick-comparison-table \.player-table-sort-button \{[\s\S]*?min-height: 38px;[\s\S]*?text-align: center;/);
});

test("the standalone Matrix navigation tab is removed", () => {
  assert.doesNotMatch(html, /data-app-page="matrix"|id="matrixPageTab"/);
  const navigation = fs.readFileSync(path.join(__dirname, "..", "js", "navigation.js"), "utf8");
  assert.match(navigation, /page === "matrix" \? "compare" : page/);
  assert.doesNotMatch(navigation, /new Set\(\["match", "compare", "matrix", "players"\]\)/);
});

test("quick comparison puts summary columns before collapsible combat", () => {
  assert.match(componentSource, /key: "player", label: "Player"[\s\S]*?key: "rating", label: "Rating"[\s\S]*?key: "win-rate", label: "Win rate"[\s\S]*?key: "rounds", label: "Rounds"[\s\S]*?key: "kast", label: "KAST"/);
  assert.match(playersSource, /winRate: summary\.winRate/);
  assert.match(componentSource, /\{ columns: fixedColumns \},\s*\{ group: "combat", label: "Overview", columns: focusedColumns\("combat", combatColumns\) \},\s*\{ group: "opening"/);
});

test("quick comparison uses visible section, value-mode, and header detail controls", () => {
  assert.match(componentSource, /element\("div", null, "scoreboard-section-bar scoreboard-control-row"\)/);
  assert.match(componentSource, /\[\["totals", "Totals"\], \["round", "Per round"\], \["match", "Per match"\]\]/);
  assert.match(componentSource, /state\.valueMode === "match" \? item\.rows\.length : number\(item\.stats\.rounds\)/);
  assert.match(componentSource, /utilityButton = element\("button", "Per grenade"/);
  assert.match(componentSource, /"utility-enemies-flashed": "flash"/);
  assert.match(componentSource, /Counts divided by qualifying matches/);
  assert.match(componentSource, /combat: `K\/\$\{unit\}-D\/\$\{unit\}-A\/\$\{unit\}`/);
  assert.match(componentSource, /const kda = formatted\.match/);
  assert.match(componentSource, /estimatedColumnWidth\([\s\S]*?displayedLabel\(column\)[\s\S]*?displayedValue\(column, item\)/);
  assert.match(componentSource, /table\.replaceChildren\(colgroup, head, body\)/);
  assert.match(styles, /\.quick-comparison-table \{[^}]*table-layout: fixed;/);
  assert.match(componentSource, /const sectionSubgroups = Object\.freeze/);
  assert.match(componentSource, /\["received", "Help received"/);
  assert.match(componentSource, /\["assists", "Assisted kills"/);
  assert.match(componentSource, /Object\.keys\(state\.expandedGroups\)\.forEach\(group => \{ state\.expandedGroups\[group\] = false; \}\)/);
  assert.doesNotMatch(componentSource, /map-filter-menu/);
  assert.match(componentSource, /function cycleSubgroup\(group\)/);
  assert.match(componentSource, /element\("button", `\$\{subgroup\[1\]\} ↻`, "demo-subgroup-cycle"\)/);
  assert.match(componentSource, /cycle\.addEventListener\("click", \(\) => cycleSubgroup\(segment\.group\)\)/);
  assert.doesNotMatch(componentSource, /scoreboard-subgroup-bar/);
  assert.doesNotMatch(styles, /\.scoreboard-subgroup-bar/);
  assert.match(styles, /\.demo-column-heading-actions/);
  assert.match(styles, /\.scoreboard-control-row \+ \.scoreboard-control-row/);
});

test("quick comparison preserves sorts when unrelated sections change", () => {
  assert.match(componentSource, /group: column\.group \|\| null/);
  assert.match(componentSource, /const sortedGroup = state\.sort\?\.group/);
  assert.match(componentSource, /sortedGroup === segment\.group \|\| \(next && sortedGroup && state\.expandedGroups\[sortedGroup\]\)/);
  assert.match(componentSource, /if \(state\.sort\?\.group && !groupVisible\(state\.sort\.group\)\) state\.sort = null/);
  assert.doesNotMatch(componentSource, /state\.expandedGroups\[segment\.group\] = next; state\.sort = null/);
});

test("quick comparison serves the group scoreboard and standalone player profiles", () => {
  assert.match(componentSource, /window\.NickStatsQuickComparison = \{ create \}/);
  assert.match(playersSource, /NickStatsQuickComparison\.create\(\{ prefix: "player" \}\)/);
  assert.match(compareSource, /NickStatsQuickComparison\.create\(\{ prefix: "combo" \}\)/);
  assert.doesNotMatch(html, />Profiles<\/button>/);
  assert.match(playersSource, /quick\.textContent = "Quick comparison"/);
  assert.match(html, /data-player-display-panel="profile"/);
  assert.match(html, /data-player-display-panel="quick" hidden/);
  assert.doesNotMatch(html, /id="playerQuickPlayers"/);
  assert.doesNotMatch(html, /id="playerQuickPlayerStatus"/);
  assert.match(html, /id="playerQuickTable"/);
  assert.match(compareSource, /el\("button", "Quick comparison", "player-open-tab-label"\)/);
  assert.match(html, /id="comboQuickTable"/);
});

test("player and group quick comparisons use the same panel card", () => {
  assert.match(html, /class="panel quick-comparison-panel combo-display-panel"/);
  assert.match(html, /class="panel quick-comparison-panel player-quick-comparison player-display-panel"/);
  assert.doesNotMatch(styles, /\.player-quick-comparison \{[^}]*padding:\s*0/);
});

test("player and group quick-comparison switches sit above shared filters", () => {
  assert.match(html, /class="player-open-profiles unified-profile-tabs" id="comboProfilePlayers"[\s\S]*?class="stats-toolbar combo-profile-toolbar"/);
  assert.match(html, /class="player-open-profiles unified-profile-tabs" id="playerOpenProfiles"[\s\S]*?class="stats-toolbar"/);
  assert.equal((html.match(/id="comboProfilePlayers"/g) || []).length, 1);
  assert.match(playersSource, /function setPlayerDisplay\(display\)[\s\S]*?data-player-display-panel/);
  assert.match(playersSource, /quick\.addEventListener\("click", \(\) => setPlayerDisplay\("quick"\)\)/);
  assert.match(compareSource, /button\.dataset\.comboPlayerId = player\.profileId/);
  assert.match(compareSource, /quickButton\.addEventListener\("click", \(\) => setComboDisplay\("quick"\)\)/);
});

test("player, group, and match views share a two-row economy matchup control", () => {
  for (const attribute of ["data-player-buy", "data-player-enemy-buy", "data-compare-buy", "data-compare-enemy-buy", "data-demo-buy", "data-demo-enemy-buy"]) {
    assert.match(html, new RegExp(attribute));
  }
  assert.match(html, /economy-matchup-title">Economy matchup/);
  assert.match(html, />Your buy</);
  assert.match(html, />Enemy buy</);
  assert.match(styles, /\.economy-matchup-filter \{/);
  assert.match(playersSource, /opponent_buy_type/);
  assert.match(compareSource, /opponent_buy_type/);
});

test("quick comparison is the first tab in player and group views", () => {
  assert.match(playersSource, /tabs\.replaceChildren\(\)[\s\S]*?quickItem\.appendChild\(quick\); tabs\.appendChild\(quickItem\);[\s\S]*?state\.profiles\.forEach/);
  assert.match(compareSource, /profileTabs\.replaceChildren\(\)[\s\S]*?quickItem\.appendChild\(quickButton\); profileTabs\.appendChild\(quickItem\);[\s\S]*?current\.included\.forEach/);
});

test("quick comparison uses every open profile while graphs auto-select new profiles", () => {
  assert.match(playersSource, /graphPlayers: new Set\(\)/);
  assert.match(playersSource, /players: \[\.\.\.state\.profiles\.entries\(\)\][\s\S]*?\.map\(\(\[id, candidate\]\)/);
  assert.doesNotMatch(playersSource, /playerQuickPlayers|playerQuickPlayerStatus/);
  assert.match(playersSource, /if \(state\.graphPlayers\.size < MAX_GRAPH_PLAYERS\) state\.graphPlayers\.add\(key\)/);
  assert.match(playersSource, /renderGraphPlayers\(\); renderGraphs\(\); renderQuickComparison\(\);/);
});

test("player filters are shared across every open profile", () => {
  assert.match(playersSource, /side: "ALL", buy: "ALL", opponentBuy: "ALL", roundResult: "ALL", result: "ALL", maps: \[\]/);
  assert.match(playersSource, /function matchesFor\(payload\)[\s\S]*?new Set\(state\.maps\)[\s\S]*?state\.result/);
  assert.match(playersSource, /aggregate\(matches, state\.side, state\.buy, state\.roundResult, state\.opponentBuy\)/);
  assert.match(playersSource, /mapFilter\.setOptions\(availableMaps\); state\.maps = mapFilter\.values\(\)/);
  assert.match(playersSource, /state\.profiles\.set\(key, \{ payload, view: "overview" \}\)/);
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
