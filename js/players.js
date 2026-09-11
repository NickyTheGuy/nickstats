(() => {
  "use strict";
  const PLAYER_ENDPOINT = "/nickstats/api/players";
  const $ = id => document.getElementById(id);
  const state = { payload: null, side: "ALL", searchController: null, profileController: null, searchTimer: null };
  const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const integer = value => Math.round(number(value)).toLocaleString();
  const decimal = (value, places = 1) => number(value).toFixed(places);
  const percent = value => `${decimal(value, 1)}%`;
  const ratio = (a, b) => number(b) > 0 ? number(a) / number(b) : number(a);
  const titleCase = value => String(value || "Unknown").replace(/^weapon_/, "").replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase());

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
    $(target).replaceChildren(...metrics.map(([label, value]) => {
      const item = document.createElement("div"); item.className = "player-count-item";
      const strong = document.createElement("strong"); strong.textContent = value;
      const name = document.createElement("span"); name.textContent = label; item.append(strong, name); return item;
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

  function renderProfile() {
    const payload = state.payload; if (!payload) return;
    const player = payload.player || {}, matches = Array.isArray(payload.matches) ? payload.matches : [], summary = aggregate(matches), s = summary.stats;
    const sideLabel = state.side === "ALL" ? "All sides" : state.side;
    $("playerProfileName").textContent = player.name || "Unknown player";
    $("playerProfileMeta").textContent = `Steam ${player.steam_id || "unknown"} · ${integer(summary.matches)} match${summary.matches === 1 ? "" : "es"} · ${sideLabel}`;
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
    fillCards("playerUtilityDamageStats", [["Total damage", integer(utilityDamage), `${decimal(ratio(utilityDamage, s.rounds), 1)} per round`], ["HE", integer(s.he_damage)], ["Fire", integer(s.fire_damage)]]);
    fillCards("playerFlashStats", [["Enemies flashed", integer(s.enemies_flashed)], ["Enemy blind time", `${decimal(number(s.blind_duration_ms) / 1000, 1)}s`], ["Flash assists", integer(s.flash_assists)]]);
    fillCards("playerAssistStats", [["Damage", integer(s.damage_assisted_kills)], ["Teammate flash", integer(s.teammate_flash_assisted_kills)], ["Own flash", integer(s.own_flash_kills)]]);
    fillCards("playerTradeAttackStats", [["Opportunities", integer(s.trade_opportunities)], ["Attempts", integer(s.trade_attempts), `${percent(100 * ratio(s.trade_attempts, s.trade_opportunities))} response`],
      ["Trade kills", integer(s.trade_kills)], ["Successful trades", integer(s.trade_successes), `${percent(100 * ratio(s.trade_successes, s.trade_attempts))} conversion`]]);
    fillCards("playerTradeDeathStats", [["Tradeable deaths", integer(s.tradeable_deaths)], ["Teammates attempted", integer(s.attempted_tradeable_deaths), `${percent(100 * ratio(s.attempted_tradeable_deaths, s.tradeable_deaths))} response`], ["Deaths traded", integer(s.traded_deaths), `${percent(100 * ratio(s.traded_deaths, s.attempted_tradeable_deaths))} conversion`]]);
    const openingTotal = number(s.opening_kills) + number(s.opening_deaths);
    fillCards("playerOpeningStats", [["Opening kills", integer(s.opening_kills)], ["Opening deaths", integer(s.opening_deaths)], ["Opening differential", `${number(s.opening_kills) - number(s.opening_deaths) >= 0 ? "+" : ""}${integer(number(s.opening_kills) - number(s.opening_deaths))}`], ["Opening success", percent(100 * ratio(s.opening_kills, openingTotal)), `${integer(openingTotal)} opening duels`]]);
    fillMetricList("playerKillContextStats", [["Blinded enemies", integer(s.blinded_kills)], ["Kills while blind", integer(s.blind_kills)], ["Wallbang kills", integer(s.wallbang_kills)], ["Penetrations", integer(s.penetration_total)], ["Through smoke", integer(s.smoke_kills)], ["Airborne", integer(s.airborne_kills)], ["Grenade out", integer(s.grenade_out_kills)], ["Knife out", integer(s.knife_out_kills)], ["Equipment disadvantage", integer(s.equipment_disadvantage_kills)], ["Unfair fight", integer(s.unfair_kills)]]);
    fillMetricList("playerDeathContextStats", [["While blind", integer(s.deaths_while_blind)], ["To a blind killer", integer(s.deaths_to_blind_killer)], ["Wallbang", integer(s.wallbang_deaths)], ["Penetrations", integer(s.death_penetration_total)], ["Through smoke", integer(s.smoke_deaths)], ["Airborne killer", integer(s.airborne_deaths)], ["Moving killer", integer(s.moving_killer_deaths)], ["Still killer", integer(s.still_killer_deaths)], ["Running killer", integer(s.running_killer_deaths)], ["Grenade out", integer(s.grenade_out_deaths)], ["Knife out", integer(s.knife_out_deaths)], ["Equipment advantage", integer(s.equipment_disadvantage_deaths)], ["Unfair fight", integer(s.unfair_deaths)]]);
    fillCountStrip("playerClutchStats", [["1v1", integer(s.clutch_1v1)], ["1v2", integer(s.clutch_1v2)], ["1v3", integer(s.clutch_1v3)], ["1v4", integer(s.clutch_1v4)], ["1v5", integer(s.clutch_1v5)]]);
    fillCountStrip("playerMultikillStats", [["1 kill", integer(s.kill_rounds_1k)], ["2 kills", integer(s.kill_rounds_2k)], ["3 kills", integer(s.kill_rounds_3k)], ["4 kills", integer(s.kill_rounds_4k)], ["5 kills", integer(s.kill_rounds_5k)]]);
    fillCards("playerKillSpeedStats", [["Average", decimal(ratio(s.kill_speed_total, s.kill_speed_samples), 1), `${integer(s.kill_speed_samples)} samples`], ["Maximum", decimal(s.kill_speed_max, 1)], ["Average of max", percent(ratio(s.kill_speed_percent_total, s.kill_speed_percent_samples))], ["Peak of max", percent(s.kill_speed_percent_max)]]);
    fillCards("playerDeathSpeedStats", [["Average", decimal(ratio(s.death_speed_total, s.death_speed_samples), 1), `${integer(s.death_speed_samples)} samples`], ["Maximum", decimal(s.death_speed_max, 1)], ["Average of max", percent(ratio(s.death_speed_percent_total, s.death_speed_percent_samples))], ["Peak of max", percent(s.death_speed_percent_max)]]);
    fillMetricList("playerMovementStateStats", [["Moving kills", integer(s.moving_kills)], ["Still kills", integer(s.still_kills)], ["Running kills", integer(s.running_kills)], ["Airborne kills", integer(s.airborne_kills)]]);
    renderTable($("playerWeaponsTable"), ["Weapon", "Kills", "Damage", "Shots", "Rounds used"], summary.weapons.map(w => [titleCase(w.weapon), integer(w.kills), integer(w.damage), integer(w.shots), integer(w.rounds_used)]));
    const maps = new Map(); for (const match of matches) { const current = maps.get(match.map) || { name: match.map, rows: [] }; current.rows.push(match); maps.set(match.map, current); }
    const mapRows = [...maps.values()].map(map => ({ name: map.name, summary: aggregate(map.rows) })).sort((a, b) => b.summary.matches - a.summary.matches || a.name.localeCompare(b.name));
    renderTable($("playerMapsTable"), ["Map", "Matches", state.side === "ALL" ? "Record" : "Rounds", state.side === "ALL" ? "Win rate" : "Round win", "Rating", "K/D", "ADR", "KAST"], mapRows.map(({ name, summary: m }) => [titleCase(String(name).replace(/^de_/, "")), integer(m.matches), state.side === "ALL" ? `${m.wins}–${m.losses}` : `${integer(m.stats.round_wins)}–${integer(m.rounds - number(m.stats.round_wins))}`, percent(m.winRate), decimal(m.rating, 2), decimal(m.kd, 2), decimal(m.adr, 1), percent(m.kast)]));
    $("playerProfile").hidden = false; $("playerProfileStatus").textContent = "";
  }
  async function loadProfile(playerID) {
    state.profileController?.abort(); state.profileController = new AbortController();
    $("playerProfile").hidden = false; $("playerProfileStatus").textContent = "Loading player profile…"; $("playerProfileStatus").classList.remove("error"); $("playerHeadlineStats").replaceChildren();
    try {
      state.payload = await apiJson(await fetch(`${PLAYER_ENDPOINT}/${encodeURIComponent(playerID)}`, { headers: { Accept: "application/json" }, signal: state.profileController.signal })); state.side = "ALL";
      document.querySelectorAll("[data-player-side]").forEach(button => { const active = button.dataset.playerSide === "ALL"; button.classList.toggle("active", active); button.setAttribute("aria-pressed", String(active)); });
      renderProfile(); setPlayerView("overview"); $("playerProfile").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) { if (error.name !== "AbortError") { $("playerProfileStatus").textContent = `Could not load player: ${error.message}`; $("playerProfileStatus").classList.add("error"); } }
  }
  $("playerSearchForm").addEventListener("submit", event => { event.preventDefault(); clearTimeout(state.searchTimer); searchPlayers(); });
  $("playerSearchInput").addEventListener("input", event => { clearTimeout(state.searchTimer); const query = event.target.value.trim(); if (!query) { state.searchController?.abort(); $("playerSearchResults").replaceChildren(); setSearchStatus("Search for a player to open their profile."); return; } if (query.length >= 2) state.searchTimer = setTimeout(searchPlayers, 250); });
  document.querySelectorAll("[data-player-view]").forEach(button => button.addEventListener("click", () => setPlayerView(button.dataset.playerView)));
  document.querySelectorAll("[data-player-side]").forEach(button => button.addEventListener("click", () => { state.side = button.dataset.playerSide; document.querySelectorAll("[data-player-side]").forEach(item => { const active = item === button; item.classList.toggle("active", active); item.setAttribute("aria-pressed", String(active)); }); renderProfile(); }));
})();
