(() => {
  "use strict";
  const PLAYER_ENDPOINT = "/nickstats/api/players";
  const $ = id => document.getElementById(id);
  const state = { payload: null, side: "ALL", result: "ALL", searchController: null, profileController: null, searchTimer: null };
  const { number, integer, ratio, titleCase } = window.NickStatsProfile;
  const { matchResultMatches, resultFilterLabel, scoreBreakdown } = window.NickStatsFilters;
  const mapFilter = new window.NickStatsFilters.MultiMapFilter("playerMapFilter", { onChange: () => renderProfile(), formatLabel: value => titleCase(value.replace(/^de_/, "")) });

  async function apiJson(response) {
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.reason || `The API returned HTTP ${response.status}.`);
    return body;
  }
  function setSearchStatus(message, error = false) {
    $("playerSearchStatus").textContent = message;
    $("playerSearchStatus").classList.toggle("error", error);
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
        const current = weapons.get(weapon.weapon) || { weapon: weapon.weapon, kills: 0, shots: 0, hits: 0, damage: 0, rounds_used: 0 };
        current.kills += number(weapon.kills); current.shots += number(weapon.shots); current.hits += number(weapon.hits); current.damage += number(weapon.damage); current.rounds_used += number(weapon.rounds_used); weapons.set(weapon.weapon, current);
      }
    }
    return { match, stats, weapons: [...weapons.values()] };
  }
  function aggregate(matches, side = state.side) {
    const stats = {}, weapons = new Map();
    for (const view of matches.map(match => matchView(match, side))) {
      mergeStats(stats, view.stats);
      for (const weapon of view.weapons) {
        const current = weapons.get(weapon.weapon) || { ...weapon, kills: 0, shots: 0, hits: 0, damage: 0, rounds_used: 0 };
        for (const key of ["kills", "shots", "hits", "damage", "rounds_used"]) current[key] += number(weapon[key]);
        weapons.set(weapon.weapon, current);
      }
    }
    const wins = matches.filter(match => match.result === "w").length, losses = matches.filter(match => match.result === "l").length;
    const draws = matches.length - wins - losses, rounds = number(stats.rounds), kills = number(stats.kills), deaths = number(stats.deaths), assists = number(stats.assists);
    const kpr = ratio(kills, rounds), dpr = ratio(deaths, rounds), apr = ratio(assists, rounds), adr = ratio(stats.damage, rounds), kast = 100 * ratio(stats.kast_rounds, rounds);
    const impact = 2.13 * kpr + .42 * apr - .41;
    const rating = rounds ? Math.max(0, .0073 * kast + .3591 * kpr - .5329 * dpr + .2372 * impact + .0032 * adr + .1587) : 0;
    return {
      stats,
      weapons: [...weapons.values()].sort((a, b) => b.kills - a.kills || b.damage - a.damage),
      matches: matches.length, wins, losses, draws, rounds, rating,
      kd: ratio(kills, deaths), adr, kast,
      winRate: side === "ALL" ? 100 * ratio(wins, matches.length) : 100 * ratio(stats.round_wins, rounds),
      scores: scoreBreakdown(matches)
    };
  }
  function renderProfile() {
    const payload = state.payload; if (!payload) return;
    const player = payload.player || {}, allMatches = Array.isArray(payload.matches) ? payload.matches : [];
    const matches = allMatches.filter(match => mapFilter.matches(match.map) && matchResultMatches(match.result, state.result));
    const summary = aggregate(matches);
    const sideLabel = state.side === "ALL" ? "All sides" : state.side;
    $("playerProfileName").textContent = player.name || "Unknown player";
    $("playerProfileMeta").textContent = `Steam ${player.steam_id || "unknown"} · ${integer(summary.matches)} match${summary.matches === 1 ? "" : "es"} · ${sideLabel} · ${resultFilterLabel(state.result)}${mapFilter.size ? ` · ${mapFilter.summary()}` : ""}`;
    const maps = new Map(); for (const match of matches) { const current = maps.get(match.map) || { name: match.map, rows: [] }; current.rows.push(match); maps.set(match.map, current); }
    const mapRows = [...maps.values()].map(map => ({ name: map.name, summary: aggregate(map.rows) })).sort((a, b) => b.summary.matches - a.summary.matches || a.name.localeCompare(b.name));
    window.NickStatsProfile.render({ prefix: "player", headlineId: "playerHeadlineStats", summary, side: state.side, result: state.result, maps: mapRows });
    window.NickStatsGraphs.render({ prefix: "player", series: [{ label: player.name || "Player", samples: window.NickStatsGraphs.samplesForMatches(matches, state.side) }] });
    $("playerProfile").hidden = false; $("playerProfileStatus").textContent = "";
  }
  async function loadProfile(playerID) {
    state.profileController?.abort(); state.profileController = new AbortController();
    $("playerProfile").hidden = false; $("playerProfileStatus").textContent = "Loading player profile…"; $("playerProfileStatus").classList.remove("error"); $("playerHeadlineStats").replaceChildren();
    try {
      state.payload = await apiJson(await fetch(`${PLAYER_ENDPOINT}/${encodeURIComponent(playerID)}`, { headers: { Accept: "application/json" }, signal: state.profileController.signal })); state.side = "ALL"; state.result = "ALL";
      mapFilter.setOptions((state.payload.matches || []).map(match => match.map), { reset: true }); playerSideFilter.set("ALL", { notify: false }); playerResultFilter.set("ALL", { notify: false });
      renderProfile(); setPlayerView("overview"); $("playerProfile").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) { if (error.name !== "AbortError") { $("playerProfileStatus").textContent = `Could not load player: ${error.message}`; $("playerProfileStatus").classList.add("error"); } }
  }
  $("playerSearchForm").addEventListener("submit", event => { event.preventDefault(); clearTimeout(state.searchTimer); searchPlayers(); });
  $("playerSearchInput").addEventListener("input", event => { clearTimeout(state.searchTimer); const query = event.target.value.trim(); if (!query) { state.searchController?.abort(); $("playerSearchResults").replaceChildren(); setSearchStatus("Search for a player to open their profile."); return; } if (query.length >= 2) state.searchTimer = setTimeout(searchPlayers, 250); });
  document.querySelectorAll("[data-player-view]").forEach(button => button.addEventListener("click", () => setPlayerView(button.dataset.playerView)));
  const playerSideFilter = window.NickStatsFilters.bindSideToggle({ selector: "[data-player-side]", valueFor: button => button.dataset.playerSide, onChange: side => { state.side = side; renderProfile(); } });
  const playerResultFilter = window.NickStatsFilters.bindSegmentedToggle({ selector: "[data-player-result]", valueFor: button => button.dataset.playerResult, onChange: result => { state.result = result; renderProfile(); } });
})();
