(() => {
  "use strict";
  const PLAYER_ENDPOINT = "/nickstats/api/players";
  const $ = id => document.getElementById(id);
  const state = { payload: null, side: "ALL", maps: new Set(), searchController: null, profileController: null, searchTimer: null };
  const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const integer = value => Math.round(number(value)).toLocaleString();
  const decimal = (value, places = 1) => number(value).toFixed(places);
  const percent = value => `${decimal(value, 1)}%`;
  const ratio = (a, b) => number(b) > 0 ? number(a) / number(b) : number(a);
  const titleCase = value => String(value || "Unknown").replace(/^weapon_/, "").replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase());
  const mapSelected = name => !state.maps.size || state.maps.has(name);
  const mapSelectionLabel = () => state.maps.size === 0 ? "All maps" : state.maps.size === 1
    ? titleCase([...state.maps][0].replace(/^de_/, "")) : `${state.maps.size} maps`;

  function renderMapFilter(keepOpen = false) {
    const target = $("playerMapFilter"); if (!target || !state.payload) return;
    const names = [...new Set((state.payload.matches || []).map(match => match.map).filter(Boolean))].sort();
    const details = document.createElement("details"); details.className = "map-filter-menu"; details.open = keepOpen;
    const summary = document.createElement("summary"); summary.textContent = mapSelectionLabel(); details.appendChild(summary);
    const options = document.createElement("div"); options.className = "map-filter-options";
    const addOption = (label, value) => {
      const row = document.createElement("label"), checkbox = document.createElement("input"), text = document.createElement("span");
      checkbox.type = "checkbox"; checkbox.value = value; checkbox.checked = value === "ALL" ? !state.maps.size : state.maps.has(value); text.textContent = label;
      checkbox.addEventListener("change", () => {
        if (value === "ALL") state.maps.clear();
        else if (checkbox.checked) state.maps.add(value); else state.maps.delete(value);
        renderMapFilter(true); renderProfile();
      });
      row.append(checkbox, text); options.appendChild(row);
    };
    addOption("All maps", "ALL"); names.forEach(name => addOption(titleCase(name.replace(/^de_/, "")), name));
    details.appendChild(options); target.replaceChildren(details);
  }

  async function apiJson(response) {
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.reason || `The API returned HTTP ${response.status}.`);
    return body;
  }
  function setSearchStatus(message, error = false) {
    $("playerSearchStatus").textContent = message;
    $("playerSearchStatus").classList.toggle("error", error);
  }
  function statCard(label, value, note = "", className = "") {
    const card = document.createElement("div"); card.className = `player-stat-card ${className}`.trim();
    const name = document.createElement("span"); name.textContent = label;
    const strong = document.createElement("strong"); strong.textContent = value; card.append(name, strong);
    if (note) { const detail = document.createElement("small"); detail.textContent = note; card.appendChild(detail); }
    return card;
  }
  function fillCards(target, cards) { $(target).replaceChildren(...cards.map(card => statCard(...card))); }
  function fillMetricList(target, metrics) {
    $(target).replaceChildren(...metrics.map(([label, value, note = ""]) => {
      const row = document.createElement("div"); row.className = "player-metric-row";
      const copy = document.createElement("div");
      const name = document.createElement("span"); name.textContent = label; copy.appendChild(name);
      if (note) { const detail = document.createElement("small"); detail.textContent = note; copy.appendChild(detail); }
      const strong = document.createElement("strong"); strong.textContent = value; row.append(copy, strong); return row;
    }));
  }
  function fillCountStrip(target, metrics) {
    $(target).replaceChildren(...metrics.map(([label, value, note = ""]) => {
      const item = document.createElement("div"); item.className = "player-count-item";
      const strong = document.createElement("strong"); strong.textContent = value;
      const name = document.createElement("span"); name.textContent = label; item.append(strong, name);
      if (note) { const detail = document.createElement("small"); detail.textContent = note; item.appendChild(detail); }
      return item;
    }));
  }
  function setPlayerView(view) {
    document.querySelectorAll("[data-player-view]").forEach(button => {
      const active = button.dataset.playerView === view;
      button.classList.toggle("active", active); button.setAttribute("aria-selected", String(active)); button.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll("[data-player-profile-view]").forEach(panel => { panel.hidden = panel.dataset.playerProfileView !== view; });
  }
  function renderSearchResults(players) {
    const results = $("playerSearchResults"); results.replaceChildren();
    for (const player of players) {
      const button = document.createElement("button"); button.type = "button"; button.className = "player-search-result";
      const identity = document.createElement("span"); identity.className = "player-result-identity";
      const name = document.createElement("strong"); name.textContent = player.name || "Unknown player";
      const steam = document.createElement("span"); steam.textContent = player.steam_id || "No Steam ID"; identity.append(name, steam);
      const count = document.createElement("span"); count.className = "player-result-count";
      count.textContent = `${integer(player.match_count)} match${number(player.match_count) === 1 ? "" : "es"}`;
      const open = document.createElement("span"); open.className = "player-result-open"; open.textContent = "Open profile →";
      button.append(identity, count, open); button.addEventListener("click", () => loadProfile(player.id)); results.appendChild(button);
    }
  }
  async function searchPlayers() {
    const query = $("playerSearchInput").value.trim(); state.searchController?.abort();
    state.searchController = new AbortController(); setSearchStatus("Searching players…");
    try {
      const parameters = new URLSearchParams({ q: query, limit: "25", offset: "0" });
      const payload = await apiJson(await fetch(`${PLAYER_ENDPOINT}?${parameters}`, { headers: { Accept: "application/json" }, signal: state.searchController.signal }));
      const players = Array.isArray(payload.players) ? payload.players : []; renderSearchResults(players);
      setSearchStatus(players.length ? `${players.length} player${players.length === 1 ? "" : "s"} found.` : "No players matched that search.");
    } catch (error) {
      if (error.name === "AbortError") return;
      $("playerSearchResults").replaceChildren(); setSearchStatus(`Could not search players: ${error.message}`, true);
    }
  }
  function mergeStats(target, source) {
    for (const [key, value] of Object.entries(source || {})) {
      target[key] = key.endsWith("_max") ? Math.max(number(target[key]), number(value)) : number(target[key]) + number(value);
    }
  }
  function matchView(match, side = state.side) {
    const stats = {}, weapons = new Map();
    const selected = (match.sides || []).filter(row => side === "ALL" || row.side === side);
    if (!selected.length && side === "ALL") mergeStats(stats, { rounds: match.rounds, kills: match.kills, deaths: match.deaths, assists: match.assists, headshots: match.headshots, damage: match.damage, kast_rounds: match.kast_rounds });
    for (const row of selected) {
      mergeStats(stats, row.stats);
      for (const weapon of row.weapons || []) {
        const current = weapons.get(weapon.weapon) || { weapon: weapon.weapon, kills: 0, shots: 0, damage: 0, rounds_used: 0 };
        current.kills += number(weapon.kills); current.shots += number(weapon.shots); current.damage += number(weapon.damage); current.rounds_used += number(weapon.rounds_used); weapons.set(weapon.weapon, current);
      }
    }
    return { match, stats, weapons: [...weapons.values()] };
  }
  function aggregate(matches, side = state.side) {
    const stats = {}, weapons = new Map();
    for (const view of matches.map(match => matchView(match, side))) {
      mergeStats(stats, view.stats);
      for (const weapon of view.weapons) {
        const current = weapons.get(weapon.weapon) || { ...weapon, kills: 0, shots: 0, damage: 0, rounds_used: 0 };
        for (const key of ["kills", "shots", "damage", "rounds_used"]) current[key] += number(weapon[key]);
        weapons.set(weapon.weapon, current);
      }
    }
    const wins = matches.filter(match => match.result === "w").length, losses = matches.filter(match => match.result === "l").length;
    const draws = matches.length - wins - losses, rounds = number(stats.rounds), kills = number(stats.kills), deaths = number(stats.deaths), assists = number(stats.assists);
    const kpr = ratio(kills, rounds), dpr = ratio(deaths, rounds), apr = ratio(assists, rounds), adr = ratio(stats.damage, rounds), kast = 100 * ratio(stats.kast_rounds, rounds);
    const impact = 2.13 * kpr + .42 * apr - .41;
    const rating = rounds ? Math.max(0, .0073 * kast + .3591 * kpr - .5329 * dpr + .2372 * impact + .0032 * adr + .1587) : 0;
    return { stats, weapons: [...weapons.values()].sort((a, b) => b.kills - a.kills || b.damage - a.damage), matches: matches.length, wins, losses, draws, rounds, rating, kd: ratio(kills, deaths), adr, kast, winRate: side === "ALL" ? 100 * ratio(wins, matches.length) : 100 * ratio(stats.round_wins, rounds) };
  }
  function renderTable(table, headers, rows) {
    const head = document.createElement("thead"), headerRow = document.createElement("tr");
    headers.forEach(label => { const cell = document.createElement("th"); cell.scope = "col"; cell.textContent = label; headerRow.appendChild(cell); }); head.appendChild(headerRow);
    const body = document.createElement("tbody");
    rows.forEach(values => { const row = document.createElement("tr"); values.forEach((value, index) => { const cell = document.createElement(index ? "td" : "th"); if (!index) cell.scope = "row"; cell.textContent = value; row.appendChild(cell); }); body.appendChild(row); });
    table.replaceChildren(head, body);
  }
  const perRound = (stats, key) => `${decimal(ratio(stats[key], stats.rounds), 2)} per round`;
  const countPerRound = (value, rounds, places = 2) => `${decimal(ratio(value, rounds), places)} per round`;

  function renderProfile() {
    const payload = state.payload; if (!payload) return;
    const player = payload.player || {}, allMatches = Array.isArray(payload.matches) ? payload.matches : [];
    const matches = allMatches.filter(match => mapSelected(match.map)), summary = aggregate(matches), s = summary.stats;
    const sideLabel = state.side === "ALL" ? "All sides" : state.side;
    $("playerProfileName").textContent = player.name || "Unknown player";
    $("playerProfileMeta").textContent = `Steam ${player.steam_id || "unknown"} · ${integer(summary.matches)} match${summary.matches === 1 ? "" : "es"} · ${sideLabel}${state.maps.size ? ` · ${mapSelectionLabel()}` : ""}`;
    $("playerProfileRecord").textContent = state.side === "ALL" ? `${summary.wins}–${summary.losses}${summary.draws ? `–${summary.draws}` : ""}` : `${integer(s.round_wins)}–${integer(summary.rounds - number(s.round_wins))} rounds`;
    const ratingClass = summary.rating >= 1.1 ? "rating-good" : summary.rating <= .9 ? "rating-bad" : "rating-average";
    fillCards("playerHeadlineStats", [
      ["Average rating", decimal(summary.rating, 2), "Round-weighted", ratingClass], ["Average K/D", decimal(summary.kd, 2), `${integer(s.kills)} K · ${integer(s.deaths)} D`],
      ["Average ADR", decimal(summary.adr, 1), `${integer(s.damage)} total damage`], ["Average KAST", percent(summary.kast), `${integer(s.kast_rounds)} KAST rounds`],
      [state.side === "ALL" ? "Match win rate" : "Round win rate", percent(summary.winRate), state.side === "ALL" ? `${summary.wins} wins in ${summary.matches} matches` : `${integer(s.round_wins)} of ${integer(summary.rounds)} rounds`]
    ]);
    fillCards("playerRecordStats", [["Matches", integer(summary.matches), `${summary.wins} W · ${summary.losses} L · ${summary.draws} D`], ["Rounds", integer(summary.rounds), `${integer(s.round_wins)} won`]]);
    fillCards("playerCombatStats", [["Kills", integer(s.kills), perRound(s, "kills")], ["Deaths", integer(s.deaths), perRound(s, "deaths")], ["Assists", integer(s.assists), perRound(s, "assists")], ["Headshot rate", percent(100 * ratio(s.headshots, s.kills)), `${integer(s.headshots)} headshots`]]);
    const utilityDamage = number(s.he_damage) + number(s.fire_damage);
    fillCards("playerUtilityDamageStats", [["Total damage", integer(utilityDamage), countPerRound(utilityDamage, s.rounds, 1)], ["HE", integer(s.he_damage), countPerRound(s.he_damage, s.rounds, 1)], ["Fire", integer(s.fire_damage), countPerRound(s.fire_damage, s.rounds, 1)]]);
    fillCards("playerFlashStats", [["Enemies flashed", integer(s.enemies_flashed), countPerRound(s.enemies_flashed, s.rounds)], ["Enemy blind time", `${decimal(number(s.blind_duration_ms) / 1000, 1)}s`, `${decimal(ratio(number(s.blind_duration_ms) / 1000, s.rounds), 2)}s per round`], ["Flash assists", integer(s.flash_assists), countPerRound(s.flash_assists, s.rounds)]]);
    fillCards("playerAssistStats", [["Damage", integer(s.damage_assisted_kills), countPerRound(s.damage_assisted_kills, s.rounds)], ["Teammate flash", integer(s.teammate_flash_assisted_kills), countPerRound(s.teammate_flash_assisted_kills, s.rounds)], ["Own flash", integer(s.own_flash_kills), countPerRound(s.own_flash_kills, s.rounds)]]);
    fillCards("playerTradeAttackStats", [["Opportunities", integer(s.trade_opportunities), countPerRound(s.trade_opportunities, s.rounds)], ["Attempts", integer(s.trade_attempts), `${countPerRound(s.trade_attempts, s.rounds)} · ${percent(100 * ratio(s.trade_attempts, s.trade_opportunities))} response`],
      ["Trade kills", integer(s.trade_kills), `${countPerRound(s.trade_kills, s.rounds)} · ${integer(s.trade_successes)} successful responses · ${percent(100 * ratio(s.trade_successes, s.trade_attempts))} success`]]);
    fillCards("playerTradeDeathStats", [["Tradeable deaths", integer(s.tradeable_deaths), countPerRound(s.tradeable_deaths, s.rounds)], ["Teammates attempted", integer(s.attempted_tradeable_deaths), `${countPerRound(s.attempted_tradeable_deaths, s.rounds)} · ${percent(100 * ratio(s.attempted_tradeable_deaths, s.tradeable_deaths))} response`], ["Deaths traded", integer(s.traded_deaths), `${countPerRound(s.traded_deaths, s.rounds)} · ${percent(100 * ratio(s.traded_deaths, s.attempted_tradeable_deaths))} conversion`]]);
    const openingTotal = number(s.opening_kills) + number(s.opening_deaths);
    const openingDiff = number(s.opening_kills) - number(s.opening_deaths);
    fillCards("playerOpeningStats", [["Opening kills", integer(s.opening_kills), countPerRound(s.opening_kills, s.rounds)], ["Opening deaths", integer(s.opening_deaths), countPerRound(s.opening_deaths, s.rounds)], ["Opening differential", `${openingDiff >= 0 ? "+" : ""}${integer(openingDiff)}`, `${openingDiff >= 0 ? "+" : ""}${decimal(ratio(openingDiff, s.rounds), 2)} per round`], ["Opening success", percent(100 * ratio(s.opening_kills, openingTotal)), `${integer(openingTotal)} opening duels`]]);
    const metricPerRound = (label, value) => [label, integer(value), countPerRound(value, s.rounds)];
    fillMetricList("playerKillContextStats", [["Enemy was blinded", s.blinded_kills], ["Player was blinded", s.blind_kills], ["Wallbang kills", s.wallbang_kills], ["Smoke kills", s.smoke_kills], ["Airborne kills", s.airborne_kills], ["Running kills", s.running_kills], ["Enemy had a grenade out", s.grenade_out_kills], ["Enemy had a knife out", s.knife_out_kills], ["Paul kills", s.equipment_disadvantage_kills], ["Bullshit kills (unique)", s.unfair_kills]].map(([label, value]) => metricPerRound(label, value)));
    fillMetricList("playerDeathContextStats", [["Player was blinded", s.deaths_while_blind], ["Enemy was blinded", s.deaths_to_blind_killer], ["Wallbang deaths", s.wallbang_deaths], ["Smoke deaths", s.smoke_deaths], ["Deaths to airborne enemies", s.airborne_deaths], ["Deaths to running enemies", s.running_killer_deaths], ["Player had a grenade out", s.grenade_out_deaths], ["Player had a knife out", s.knife_out_deaths], ["Paul deaths", s.equipment_disadvantage_deaths], ["Bullshit deaths (unique)", s.unfair_deaths]].map(([label, value]) => metricPerRound(label, value)));
    fillCountStrip("playerClutchStats", [["1v1", s.clutch_1v1], ["1v2", s.clutch_1v2], ["1v3", s.clutch_1v3], ["1v4", s.clutch_1v4], ["1v5", s.clutch_1v5]].map(([label, value]) => [label, integer(value), `${decimal(ratio(value, s.rounds), 2)}/R`]));
    fillCountStrip("playerMultikillStats", [["1 kill", s.kill_rounds_1k], ["2 kills", s.kill_rounds_2k], ["3 kills", s.kill_rounds_3k], ["4 kills", s.kill_rounds_4k], ["5 kills", s.kill_rounds_5k]].map(([label, value]) => [label, integer(value), `${decimal(ratio(value, s.rounds), 2)}/R`]));
    fillCards("playerKillSpeedStats", [["Average", decimal(ratio(s.kill_speed_total, s.kill_speed_samples), 1), `${integer(s.kill_speed_samples)} samples`], ["Maximum", decimal(s.kill_speed_max, 1)], ["Average of max", percent(ratio(s.kill_speed_percent_total, s.kill_speed_percent_samples))], ["Peak of max", percent(s.kill_speed_percent_max)]]);
    fillCards("playerDeathSpeedStats", [["Average", decimal(ratio(s.death_speed_total, s.death_speed_samples), 1), `${integer(s.death_speed_samples)} samples`], ["Maximum", decimal(s.death_speed_max, 1)], ["Average of max", percent(ratio(s.death_speed_percent_total, s.death_speed_percent_samples))], ["Peak of max", percent(s.death_speed_percent_max)]]);
    fillMetricList("playerMovementStateStats", [["Moving kills", s.moving_kills], ["Still kills", s.still_kills], ["Running kills", s.running_kills], ["Airborne kills", s.airborne_kills]].map(([label, value]) => metricPerRound(label, value)));
    fillMetricList("playerDeathMovementStateStats", [["Deaths to moving enemies", s.moving_killer_deaths], ["Deaths to still enemies", s.still_killer_deaths], ["Deaths to running enemies", s.running_killer_deaths], ["Deaths to airborne enemies", s.airborne_deaths]].map(([label, value]) => metricPerRound(label, value)));
    renderTable($("playerWeaponsTable"), ["Weapon", "Kills", "K/R", "Damage", "Dmg/R", "Shots", "Shots/R", "Rounds used", "Usage"], summary.weapons.map(w => [titleCase(w.weapon), integer(w.kills), decimal(ratio(w.kills, s.rounds), 3), integer(w.damage), decimal(ratio(w.damage, s.rounds), 1), integer(w.shots), decimal(ratio(w.shots, s.rounds), 2), integer(w.rounds_used), percent(100 * ratio(w.rounds_used, s.rounds))]));
    const maps = new Map(); for (const match of matches) { const current = maps.get(match.map) || { name: match.map, rows: [] }; current.rows.push(match); maps.set(match.map, current); }
    const mapRows = [...maps.values()].map(map => ({ name: map.name, summary: aggregate(map.rows) })).sort((a, b) => b.summary.matches - a.summary.matches || a.name.localeCompare(b.name));
    renderTable($("playerMapsTable"), ["Map", "Matches", state.side === "ALL" ? "Record" : "Rounds", state.side === "ALL" ? "Win rate" : "Round win", "Rating", "K/D", "K/R", "A/R", "ADR", "KAST"], mapRows.map(({ name, summary: m }) => [titleCase(String(name).replace(/^de_/, "")), integer(m.matches), state.side === "ALL" ? `${m.wins}–${m.losses}` : `${integer(m.stats.round_wins)}–${integer(m.rounds - number(m.stats.round_wins))}`, percent(m.winRate), decimal(m.rating, 2), decimal(m.kd, 2), decimal(ratio(m.stats.kills, m.rounds), 2), decimal(ratio(m.stats.assists, m.rounds), 2), decimal(m.adr, 1), percent(m.kast)]));
    $("playerProfile").hidden = false; $("playerProfileStatus").textContent = "";
  }
  async function loadProfile(playerID) {
    state.profileController?.abort(); state.profileController = new AbortController();
    $("playerProfile").hidden = false; $("playerProfileStatus").textContent = "Loading player profile…"; $("playerProfileStatus").classList.remove("error"); $("playerHeadlineStats").replaceChildren();
    try {
      state.payload = await apiJson(await fetch(`${PLAYER_ENDPOINT}/${encodeURIComponent(playerID)}`, { headers: { Accept: "application/json" }, signal: state.profileController.signal })); state.side = "ALL"; state.maps.clear();
      document.querySelectorAll("[data-player-side]").forEach(button => { const active = button.dataset.playerSide === "ALL"; button.classList.toggle("active", active); button.setAttribute("aria-pressed", String(active)); });
      renderMapFilter(); renderProfile(); setPlayerView("overview"); $("playerProfile").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) { if (error.name !== "AbortError") { $("playerProfileStatus").textContent = `Could not load player: ${error.message}`; $("playerProfileStatus").classList.add("error"); } }
  }
  $("playerSearchForm").addEventListener("submit", event => { event.preventDefault(); clearTimeout(state.searchTimer); searchPlayers(); });
  $("playerSearchInput").addEventListener("input", event => { clearTimeout(state.searchTimer); const query = event.target.value.trim(); if (!query) { state.searchController?.abort(); $("playerSearchResults").replaceChildren(); setSearchStatus("Search for a player to open their profile."); return; } if (query.length >= 2) state.searchTimer = setTimeout(searchPlayers, 250); });
  document.querySelectorAll("[data-player-view]").forEach(button => button.addEventListener("click", () => setPlayerView(button.dataset.playerView)));
  document.addEventListener("click", event => {
    const menu = $("playerMapFilter")?.querySelector("details[open]");
    if (menu && !menu.contains(event.target)) menu.open = false;
  });
  document.querySelectorAll("[data-player-side]").forEach(button => button.addEventListener("click", () => { state.side = button.dataset.playerSide; document.querySelectorAll("[data-player-side]").forEach(item => { const active = item === button; item.classList.toggle("active", active); item.setAttribute("aria-pressed", String(active)); }); renderProfile(); }));
})();
