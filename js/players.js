(() => {
  "use strict";
  const PLAYER_ENDPOINT = "/nickstats/api/players";
  const RECENT_KEY = "nickstats.recentPlayers.v1";
  const MAX_RECENT = 10;
  const MAX_GRAPH_PLAYERS = 5;
  const $ = id => document.getElementById(id);
  const { number, integer, ratio, titleCase } = window.NickStatsProfile;
  const { matchResultMatches, resultFilterLabel, scoreBreakdown } = window.NickStatsFilters;

  function readRecent() {
    try {
      const rows = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
      return Array.isArray(rows) ? rows.filter(row => row && row.id != null).slice(0, MAX_RECENT) : [];
    } catch (_) { return []; }
  }

  const state = {
    profiles: new Map(), activeId: null, graphPlayers: new Set(), recent: readRecent(),
    searchController: null, profileController: null, searchTimer: null
  };
  const activeProfile = () => state.profiles.get(state.activeId) || null;
  const mapFilter = new window.NickStatsFilters.MultiMapFilter("playerMapFilter", {
    formatLabel: value => titleCase(value.replace(/^de_/, "")),
    onChange: values => { const profile = activeProfile(); if (profile) { profile.maps = values; renderProfile(); } }
  });

  async function apiJson(response) {
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.reason || `The API returned HTTP ${response.status}.`);
    return body;
  }
  function setSearchStatus(message, error = false) {
    $("playerSearchStatus").textContent = message;
    $("playerSearchStatus").classList.toggle("error", error);
  }
  function setPlayerView(view, { remember = true } = {}) {
    if (remember && activeProfile()) activeProfile().view = view;
    document.querySelectorAll("[data-player-view]").forEach(button => {
      const active = button.dataset.playerView === view;
      button.classList.toggle("active", active); button.setAttribute("aria-selected", String(active)); button.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll("[data-player-profile-view]").forEach(panel => { panel.hidden = panel.dataset.playerProfileView !== view; });
  }

  function rememberPlayer(player) {
    const row = { id: String(player.id), name: player.name || "Unknown player", steam_id: player.steam_id || "" };
    state.recent = [row, ...state.recent.filter(item => String(item.id) !== row.id)].slice(0, MAX_RECENT);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(state.recent)); } catch (_) {}
    renderRecent();
  }
  function renderRecent() {
    const section = $("playerRecent"), list = $("playerRecentList");
    section.hidden = !state.recent.length; list.replaceChildren();
    state.recent.forEach(player => {
      const button = document.createElement("button"); button.type = "button"; button.className = "player-recent-chip";
      const name = document.createElement("strong"); name.textContent = player.name;
      const steam = document.createElement("span"); steam.textContent = player.steam_id || "Open profile";
      button.append(name, steam); button.addEventListener("click", () => loadProfile(player.id)); list.appendChild(button);
    });
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
    for (const [key, value] of Object.entries(source || {})) target[key] = key.endsWith("_max") ? Math.max(number(target[key]), number(value)) : number(target[key]) + number(value);
  }
  function matchView(match, side) {
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
  function aggregate(matches, side) {
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
      stats, weapons: [...weapons.values()].sort((a, b) => b.kills - a.kills || b.damage - a.damage),
      matches: matches.length, wins, losses, draws, rounds, rating, kd: ratio(kills, deaths), adr, kast,
      winRate: side === "ALL" ? 100 * ratio(wins, matches.length) : 100 * ratio(stats.round_wins, rounds), scores: scoreBreakdown(matches)
    };
  }

  function matchesFor(payload, profile) {
    const selectedMaps = new Set(profile.maps);
    return (payload.matches || []).filter(match => (!selectedMaps.size || selectedMaps.has(match.map)) && matchResultMatches(match.result, profile.result));
  }
  function renderGraphPlayers() {
    const target = $("playerGraphPlayers"); target.replaceChildren();
    state.profiles.forEach((profile, id) => {
      const label = document.createElement("label"); label.className = "graph-player-choice";
      const input = document.createElement("input"); input.type = "checkbox"; input.checked = state.graphPlayers.has(id);
      const name = document.createElement("span"); name.textContent = profile.payload.player?.name || "Unknown player";
      input.addEventListener("change", () => {
        if (input.checked && state.graphPlayers.size >= MAX_GRAPH_PLAYERS) {
          input.checked = false; $("playerGraphPlayerStatus").textContent = `Choose up to ${MAX_GRAPH_PLAYERS} players.`; return;
        }
        input.checked ? state.graphPlayers.add(id) : state.graphPlayers.delete(id);
        renderGraphs();
      });
      label.append(input, name); target.appendChild(label);
    });
    $("playerGraphPlayerStatus").textContent = `${state.graphPlayers.size} of ${MAX_GRAPH_PLAYERS} players selected`;
  }
  function renderGraphs() {
    const profile = activeProfile(); if (!profile) return;
    renderGraphPlayers();
    const series = [...state.profiles.entries()].filter(([id]) => state.graphPlayers.has(id)).map(([, candidate]) => {
      const matches = matchesFor(candidate.payload, profile);
      return { label: candidate.payload.player?.name || "Unknown player", samples: window.NickStatsGraphs.samplesForMatches(matches, profile.side) };
    });
    window.NickStatsGraphs.render({ prefix: "player", series, independent: true });
  }

  function renderOpenTabs() {
    const tabs = $("playerOpenProfiles"); tabs.replaceChildren(); tabs.hidden = !state.profiles.size;
    state.profiles.forEach((profile, id) => {
      const item = document.createElement("div"); item.className = `player-open-tab${id === state.activeId ? " active" : ""}`;
      const open = document.createElement("button"); open.type = "button"; open.className = "player-open-tab-label"; open.setAttribute("role", "tab");
      open.setAttribute("aria-selected", String(id === state.activeId)); open.textContent = profile.payload.player?.name || "Unknown player";
      open.addEventListener("click", () => activateProfile(id));
      const close = document.createElement("button"); close.type = "button"; close.className = "player-open-tab-close"; close.textContent = "×";
      close.setAttribute("aria-label", `Close ${profile.payload.player?.name || "player"} profile`); close.addEventListener("click", () => closeProfile(id));
      item.append(open, close); tabs.appendChild(item);
    });
  }

  function renderProfile() {
    const profile = activeProfile(); if (!profile) return;
    const payload = profile.payload, player = payload.player || {}, matches = matchesFor(payload, profile), summary = aggregate(matches, profile.side);
    const sideLabel = profile.side === "ALL" ? "All sides" : profile.side;
    $("playerProfileName").textContent = player.name || "Unknown player";
    $("playerProfileMeta").textContent = `Steam ${player.steam_id || "unknown"} · ${integer(summary.matches)} match${summary.matches === 1 ? "" : "es"} · ${sideLabel} · ${resultFilterLabel(profile.result)}${profile.maps.length ? ` · ${mapFilter.summary()}` : ""}`;
    const maps = new Map(); for (const match of matches) { const current = maps.get(match.map) || { name: match.map, rows: [] }; current.rows.push(match); maps.set(match.map, current); }
    const mapRows = [...maps.values()].map(map => ({ name: map.name, summary: aggregate(map.rows, profile.side) })).sort((a, b) => b.summary.matches - a.summary.matches || a.name.localeCompare(b.name));
    window.NickStatsProfile.render({ prefix: "player", headlineId: "playerHeadlineStats", summary, side: profile.side, result: profile.result, maps: mapRows });
    renderGraphs();
    $("playerProfile").hidden = false; $("playerProfileStatus").textContent = "";
  }

  function activateProfile(id) {
    id = String(id); const profile = state.profiles.get(id); if (!profile) return;
    const prior = state.activeId;
    if (!state.graphPlayers.size || (state.graphPlayers.size === 1 && state.graphPlayers.has(prior))) { state.graphPlayers.clear(); state.graphPlayers.add(id); }
    state.activeId = id;
    const availableMaps = [...state.profiles.values()].flatMap(candidate => (candidate.payload.matches || []).map(match => match.map));
    mapFilter.setOptions(availableMaps, { reset: true }); mapFilter.setSelected(profile.maps, { notify: false });
    playerSideFilter.set(profile.side, { notify: false }); playerResultFilter.set(profile.result, { notify: false });
    renderOpenTabs(); renderProfile(); setPlayerView(profile.view, { remember: false });
  }
  function closeProfile(id) {
    id = String(id); const ids = [...state.profiles.keys()], index = ids.indexOf(id);
    state.profiles.delete(id); state.graphPlayers.delete(id);
    if (state.activeId === id) {
      const next = ids[index + 1] || ids[index - 1]; state.activeId = null;
      if (next && state.profiles.has(next)) activateProfile(next);
      else { $("playerProfile").hidden = true; renderOpenTabs(); }
    } else activateProfile(state.activeId);
  }
  async function loadProfile(playerID) {
    const id = String(playerID);
    if (state.profiles.has(id)) { activateProfile(id); rememberPlayer(state.profiles.get(id).payload.player || { id }); return; }
    state.profileController?.abort(); state.profileController = new AbortController();
    $("playerProfile").hidden = false; $("playerProfileStatus").textContent = "Loading player profile…"; $("playerProfileStatus").classList.remove("error");
    try {
      const payload = await apiJson(await fetch(`${PLAYER_ENDPOINT}/${encodeURIComponent(id)}`, { headers: { Accept: "application/json" }, signal: state.profileController.signal }));
      const key = String(payload.player?.id ?? id);
      state.profiles.set(key, { payload, side: "ALL", result: "ALL", maps: [], view: "overview" });
      activateProfile(key); rememberPlayer(payload.player || { id: key });
      $("playerProfile").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      if (error.name !== "AbortError") { $("playerProfileStatus").textContent = `Could not load player: ${error.message}`; $("playerProfileStatus").classList.add("error"); }
    }
  }

  $("playerSearchForm").addEventListener("submit", event => { event.preventDefault(); clearTimeout(state.searchTimer); searchPlayers(); });
  $("playerSearchInput").addEventListener("input", event => {
    clearTimeout(state.searchTimer); const query = event.target.value.trim();
    if (!query) { state.searchController?.abort(); $("playerSearchResults").replaceChildren(); setSearchStatus("Search for a player to open their profile."); return; }
    if (query.length >= 2) state.searchTimer = setTimeout(searchPlayers, 250);
  });
  $("playerRecentClear").addEventListener("click", () => { state.recent = []; try { localStorage.removeItem(RECENT_KEY); } catch (_) {} renderRecent(); });
  document.querySelectorAll("[data-player-view]").forEach(button => button.addEventListener("click", () => setPlayerView(button.dataset.playerView)));
  const playerSideFilter = window.NickStatsFilters.bindSideToggle({ selector: "[data-player-side]", valueFor: button => button.dataset.playerSide, onChange: side => { const profile = activeProfile(); if (profile) { profile.side = side; renderProfile(); } } });
  const playerResultFilter = window.NickStatsFilters.bindSegmentedToggle({ selector: "[data-player-result]", valueFor: button => button.dataset.playerResult, onChange: result => { const profile = activeProfile(); if (profile) { profile.result = result; renderProfile(); } } });
  renderRecent(); renderOpenTabs();
})();
