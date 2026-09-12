(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const integer = value => Math.round(number(value)).toLocaleString();
  const decimal = (value, places = 1) => number(value).toFixed(places);
  const percent = value => `${decimal(value, 1)}%`;
  const ratio = (a, b) => number(b) > 0 ? number(a) / number(b) : number(a);
  const titleCase = value => String(value || "Unknown").replace(/^weapon_/, "").replaceAll("_", " ").replace(/\b\w/g, character => character.toUpperCase());
  const countPerRound = (value, rounds, places = 2) => `${decimal(ratio(value, rounds), places)} per round`;
  const tableSorts = new Map();

  function card(label, value, note = "", className = "") {
    const element = document.createElement("div"); element.className = `player-stat-card ${className}`.trim();
    const name = document.createElement("span"); name.textContent = label;
    const strong = document.createElement("strong"); strong.textContent = value; element.append(name, strong);
    if (note) { const detail = document.createElement("small"); detail.textContent = note; element.appendChild(detail); }
    return element;
  }

  function fillCards(target, cards) { $(target).replaceChildren(...cards.map(values => card(...values))); }
  function fillList(target, metrics) {
    $(target).replaceChildren(...metrics.map(([label, value, note = ""]) => {
      const row = document.createElement("div"); row.className = "player-metric-row";
      const copy = document.createElement("div"), name = document.createElement("span"); name.textContent = label; copy.appendChild(name);
      if (note) { const detail = document.createElement("small"); detail.textContent = note; copy.appendChild(detail); }
      const strong = document.createElement("strong"); strong.textContent = value; row.append(copy, strong); return row;
    }));
  }
  function fillStrip(target, metrics) {
    $(target).replaceChildren(...metrics.map(([label, value, note = ""]) => {
      const item = document.createElement("div"); item.className = "player-count-item";
      const strong = document.createElement("strong"); strong.textContent = value;
      const name = document.createElement("span"); name.textContent = label; item.append(strong, name);
      if (note) { const detail = document.createElement("small"); detail.textContent = note; item.appendChild(detail); }
      return item;
    }));
  }
  function renderTable(target, headers, rows, sortRows = rows) {
    const table = typeof target === "string" ? $(target) : target;
    const tableKey = table.id || String(target);
    const sort = tableSorts.get(tableKey);
    const indexed = rows.map((values, index) => ({ values, sortValues: sortRows[index] || values, index }));
    if (sort) indexed.sort((left, right) => {
      const a = left.sortValues[sort.column], b = right.sortValues[sort.column];
      const comparison = typeof a === "number" && typeof b === "number"
        ? a - b
        : String(a ?? "").localeCompare(String(b ?? ""), undefined, { numeric: true, sensitivity: "base" });
      return (sort.direction === "asc" ? comparison : -comparison) || left.index - right.index;
    });
    const head = document.createElement("thead"), headerRow = document.createElement("tr");
    headers.forEach((label, column) => {
      const cell = document.createElement("th"); cell.scope = "col";
      const button = document.createElement("button"); button.type = "button"; button.className = "player-table-sort-button";
      const active = sort?.column === column;
      if (active) { button.classList.add("active"); button.dataset.direction = sort.direction; }
      button.textContent = label;
      button.title = active ? `Sorted ${sort.direction === "asc" ? "ascending" : "descending"}; click to reverse` : `Sort by ${label}`;
      cell.setAttribute("aria-sort", active ? (sort.direction === "asc" ? "ascending" : "descending") : "none");
      button.addEventListener("click", () => {
        const direction = active ? (sort.direction === "asc" ? "desc" : "asc") : (column === 0 ? "asc" : "desc");
        tableSorts.set(tableKey, { column, direction });
        renderTable(table, headers, rows, sortRows);
      });
      cell.appendChild(button); headerRow.appendChild(cell);
    }); head.appendChild(headerRow);
    const body = document.createElement("tbody");
    indexed.forEach(({ values }) => { const row = document.createElement("tr"); values.forEach((value, index) => { const cell = document.createElement(index ? "td" : "th"); if (!index) cell.scope = "row"; cell.textContent = value; row.appendChild(cell); }); body.appendChild(row); });
    table.replaceChildren(head, body);
  }

  function render({ prefix, headlineId, summary, side, maps }) {
    const s = summary.stats || {}, rounds = number(s.rounds), sideAll = side === "ALL";
    const metric = (label, value) => [label, integer(value), countPerRound(value, rounds)];
    const ratingClass = summary.rating >= 1.1 ? "rating-good" : summary.rating <= .9 ? "rating-bad" : "rating-average";
    fillCards(headlineId, [
      ["Average rating", decimal(summary.rating, 2), "Round-weighted", ratingClass], ["Average K/D", decimal(summary.kd, 2), `${integer(s.kills)} K · ${integer(s.deaths)} D`],
      ["Average ADR", decimal(summary.adr, 1), `${integer(s.damage)} total damage`], ["Average KAST", percent(summary.kast), `${integer(s.kast_rounds)} KAST rounds`],
      [sideAll ? "Match win rate" : "Round win rate", percent(summary.winRate), sideAll ? `${summary.wins} wins in ${summary.matches} matches` : `${integer(s.round_wins)} of ${integer(rounds)} rounds`]
    ]);
    fillCards(`${prefix}RecordStats`, [["Matches", integer(summary.matches), `${summary.wins} W · ${summary.losses} L · ${summary.draws} D`], ["Rounds", integer(rounds), `${integer(s.round_wins)} won`]]);
    const damageDifferential = number(s.damage) - number(s.damage_received);
    fillCards(`${prefix}CombatStats`, [["Kills", integer(s.kills), countPerRound(s.kills, rounds)], ["Deaths", integer(s.deaths), countPerRound(s.deaths, rounds)], ["Assists", integer(s.assists), countPerRound(s.assists, rounds)], ["Headshot rate", percent(100 * ratio(s.headshots, s.kills)), `${integer(s.headshots)} headshots`], ["Damage received", integer(s.damage_received), countPerRound(s.damage_received, rounds, 1)], ["Damage differential", `${damageDifferential >= 0 ? "+" : ""}${integer(damageDifferential)}`, `${damageDifferential >= 0 ? "+" : ""}${decimal(ratio(damageDifferential, rounds), 1)} per round`]]);
    const utilityDamage = number(s.he_damage) + number(s.fire_damage);
    fillCards(`${prefix}UtilityDamageStats`, [["Total damage", integer(utilityDamage), countPerRound(utilityDamage, rounds, 1)], ["HE", integer(s.he_damage), countPerRound(s.he_damage, rounds, 1)], ["Fire", integer(s.fire_damage), countPerRound(s.fire_damage, rounds, 1)]]);
    fillCards(`${prefix}UtilityThrownStats`, [["HE", integer(s.he_grenades_thrown), countPerRound(s.he_grenades_thrown, rounds)], ["Flashes", integer(s.flashbangs_thrown), countPerRound(s.flashbangs_thrown, rounds)], ["Smokes", integer(s.smokes_thrown), countPerRound(s.smokes_thrown, rounds)], ["Fire", integer(s.fire_grenades_thrown), countPerRound(s.fire_grenades_thrown, rounds)], ["Decoys", integer(s.decoys_thrown), countPerRound(s.decoys_thrown, rounds)]]);
    fillCards(`${prefix}FlashStats`, [["Enemies flashed", integer(s.enemies_flashed), countPerRound(s.enemies_flashed, rounds)], ["Enemy blind time", `${decimal(number(s.blind_duration_ms) / 1000, 1)}s`, `${decimal(ratio(number(s.blind_duration_ms) / 1000, rounds), 2)}s per round`], ["Flash assists", integer(s.flash_assists), countPerRound(s.flash_assists, rounds)]]);
    fillCards(`${prefix}AssistStats`, [["Damage", integer(s.damage_assisted_kills), countPerRound(s.damage_assisted_kills, rounds)], ["Teammate flash", integer(s.teammate_flash_assisted_kills), countPerRound(s.teammate_flash_assisted_kills, rounds)], ["Own flash", integer(s.own_flash_kills), countPerRound(s.own_flash_kills, rounds)]]);
    fillCards(`${prefix}TradeAttackStats`, [["Opportunities", integer(s.trade_opportunities), countPerRound(s.trade_opportunities, rounds)], ["Attempts", integer(s.trade_attempts), `${countPerRound(s.trade_attempts, rounds)} · ${percent(100 * ratio(s.trade_attempts, s.trade_opportunities))} response`], ["Trade kills", integer(s.trade_kills), `${countPerRound(s.trade_kills, rounds)} · ${integer(s.trade_successes)} successful responses · ${percent(100 * ratio(s.trade_successes, s.trade_attempts))} success`]]);
    fillCards(`${prefix}TradeDeathStats`, [["Tradeable deaths", integer(s.tradeable_deaths), countPerRound(s.tradeable_deaths, rounds)], ["Teammates attempted", integer(s.attempted_tradeable_deaths), `${countPerRound(s.attempted_tradeable_deaths, rounds)} · ${percent(100 * ratio(s.attempted_tradeable_deaths, s.tradeable_deaths))} response`], ["Deaths traded", integer(s.traded_deaths), `${countPerRound(s.traded_deaths, rounds)} · ${percent(100 * ratio(s.traded_deaths, s.attempted_tradeable_deaths))} conversion`]]);
    const openingTotal = number(s.opening_kills) + number(s.opening_deaths), openingDiff = number(s.opening_kills) - number(s.opening_deaths);
    fillCards(`${prefix}OpeningStats`, [["Opening kills", integer(s.opening_kills), countPerRound(s.opening_kills, rounds)], ["Opening deaths", integer(s.opening_deaths), countPerRound(s.opening_deaths, rounds)], ["Opening differential", `${openingDiff >= 0 ? "+" : ""}${integer(openingDiff)}`, `${openingDiff >= 0 ? "+" : ""}${decimal(ratio(openingDiff, rounds), 2)} per round`], ["Opening success", percent(100 * ratio(s.opening_kills, openingTotal)), `${integer(openingTotal)} opening duels`]]);
    fillList(`${prefix}KillContextStats`, [["Enemy was blinded", s.blinded_kills], ["Player was blinded", s.blind_kills], ["Wallbang kills", s.wallbang_kills], ["Smoke kills", s.smoke_kills], ["Airborne kills", s.airborne_kills], ["Running kills", s.running_kills], ["Enemy had a grenade out", s.grenade_out_kills], ["Enemy had a knife out", s.knife_out_kills], ["Paul kills", s.equipment_disadvantage_kills], ["Bullshit kills (unique)", s.unfair_kills]].map(([label, value]) => metric(label, value)));
    fillList(`${prefix}DeathContextStats`, [["Player was blinded", s.deaths_while_blind], ["Enemy was blinded", s.deaths_to_blind_killer], ["Wallbang deaths", s.wallbang_deaths], ["Smoke deaths", s.smoke_deaths], ["Deaths to airborne enemies", s.airborne_deaths], ["Deaths to running enemies", s.running_killer_deaths], ["Player had a grenade out", s.grenade_out_deaths], ["Player had a knife out", s.knife_out_deaths], ["Paul deaths", s.equipment_disadvantage_deaths], ["Bullshit deaths (unique)", s.unfair_deaths]].map(([label, value]) => metric(label, value)));
    fillStrip(`${prefix}ClutchStats`, [1, 2, 3, 4, 5].map(opponents => {
      const wins = number(s[`clutch_1v${opponents}`]);
      const attempts = number(s[`clutch_attempt_1v${opponents}`]);
      return [`1v${opponents}`, `${integer(wins)} / ${integer(attempts)}`, `${percent(100 * ratio(wins, attempts))} won · ${integer(Math.max(0, attempts - wins))} failed`];
    }));
    fillStrip(`${prefix}MultikillStats`, [["1 kill", s.kill_rounds_1k], ["2 kills", s.kill_rounds_2k], ["3 kills", s.kill_rounds_3k], ["4 kills", s.kill_rounds_4k], ["5 kills", s.kill_rounds_5k]].map(([label, value]) => [label, integer(value), `${decimal(ratio(value, rounds), 2)}/R`]));
    fillStrip(`${prefix}ObjectiveStats`, [["Bomb plants", s.bomb_plants], ["Bomb defuses", s.bomb_defuses]].map(([label, value]) => [label, integer(value), countPerRound(value, rounds)]));
    fillCards(`${prefix}KillSpeedStats`, [["Average", decimal(ratio(s.kill_speed_total, s.kill_speed_samples), 1), `${integer(s.kill_speed_samples)} samples`], ["Maximum", decimal(s.kill_speed_max, 1)], ["Average of max", percent(ratio(s.kill_speed_percent_total, s.kill_speed_percent_samples))], ["Peak of max", percent(s.kill_speed_percent_max)]]);
    fillCards(`${prefix}DeathSpeedStats`, [["Average", decimal(ratio(s.death_speed_total, s.death_speed_samples), 1), `${integer(s.death_speed_samples)} samples`], ["Maximum", decimal(s.death_speed_max, 1)], ["Average of max", percent(ratio(s.death_speed_percent_total, s.death_speed_percent_samples))], ["Peak of max", percent(s.death_speed_percent_max)]]);
    fillList(`${prefix}MovementStateStats`, [["Moving kills", s.moving_kills], ["Still kills", s.still_kills], ["Running kills", s.running_kills], ["Airborne kills", s.airborne_kills]].map(([label, value]) => metric(label, value)));
    fillList(`${prefix}DeathMovementStateStats`, [["Deaths to moving enemies", s.moving_killer_deaths], ["Deaths to still enemies", s.still_killer_deaths], ["Deaths to running enemies", s.running_killer_deaths], ["Deaths to airborne enemies", s.airborne_deaths]].map(([label, value]) => metric(label, value)));
    const weapons = summary.weapons || [];
    renderTable(`${prefix}WeaponsTable`, ["Weapon", "Kills", "K/R", "Damage", "Dmg/R", "Shots", "Hits", "Hit rate", "Rounds used", "Usage"], weapons.map(weapon => [titleCase(weapon.weapon), integer(weapon.kills), decimal(ratio(weapon.kills, weapon.rounds_used), 3), integer(weapon.damage), decimal(ratio(weapon.damage, weapon.rounds_used), 1), integer(weapon.shots), integer(weapon.hits), percent(100 * ratio(weapon.hits, weapon.shots)), integer(weapon.rounds_used), percent(100 * ratio(weapon.rounds_used, rounds))]), weapons.map(weapon => [weapon.weapon, number(weapon.kills), ratio(weapon.kills, weapon.rounds_used), number(weapon.damage), ratio(weapon.damage, weapon.rounds_used), number(weapon.shots), number(weapon.hits), ratio(weapon.hits, weapon.shots), number(weapon.rounds_used), ratio(weapon.rounds_used, rounds)]));
    const mapRows = maps || [];
    renderTable(`${prefix}MapsTable`, ["Map", "Matches", sideAll ? "Record" : "Rounds", sideAll ? "Win rate" : "Round win", "Rating", "K/D", "K/R", "A/R", "ADR", "KAST"], mapRows.map(({ name, summary: map }) => [titleCase(String(name).replace(/^de_/, "")), integer(map.matches), sideAll ? `${map.wins}–${map.losses}` : `${integer(map.stats.round_wins)}–${integer(map.rounds - number(map.stats.round_wins))}`, percent(map.winRate), decimal(map.rating, 2), decimal(map.kd, 2), decimal(ratio(map.stats.kills, map.rounds), 2), decimal(ratio(map.stats.assists, map.rounds), 2), decimal(map.adr, 1), percent(map.kast)]), mapRows.map(({ name, summary: map }) => [name, map.matches, sideAll ? map.wins - map.losses : number(map.stats.round_wins) - (map.rounds - number(map.stats.round_wins)), map.winRate, map.rating, map.kd, ratio(map.stats.kills, map.rounds), ratio(map.stats.assists, map.rounds), map.adr, map.kast]));
  }

  function mountComparisonProfile() {
    const source = $("playerProfileBody"), target = $("comboProfileBody");
    if (!source || !target) return;
    const component = source.cloneNode(true); component.removeAttribute("id");
    component.querySelectorAll("[id]").forEach(element => {
      if (element.id.startsWith("player")) element.id = `combo${element.id.slice("player".length)}`;
    });
    component.querySelectorAll("[data-player-view]").forEach(element => {
      element.dataset.comboProfileView = element.dataset.playerView; delete element.dataset.playerView;
    });
    component.querySelectorAll("[data-player-profile-view]").forEach(element => {
      element.dataset.comboProfilePanel = element.dataset.playerProfileView; delete element.dataset.playerProfileView;
    });
    const tabs = component.querySelector(".player-profile-tabs");
    if (tabs) tabs.setAttribute("aria-label", "Conditional player statistics");
    target.replaceChildren(...component.childNodes);
  }

  window.NickStatsProfile = Object.freeze({ render, renderTable, number, integer, decimal, percent, ratio, titleCase, countPerRound });
  mountComparisonProfile();
})();
