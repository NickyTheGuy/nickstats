(() => {
  "use strict";
  const PLAYER_ENDPOINT = "/nickstats/api/players";
  const MATCH_ENDPOINT = "/nickstats/api/matches";
  const MATCH_HISTORY_LIMIT = 25;
  const RECENT_KEY = "nickstats.recentPlayers.v1";
  const MAX_RECENT = 10;
  const MAX_GRAPH_PLAYERS = 5;
  const $ = id => document.getElementById(id);
  const { number, integer, ratio, titleCase } = window.NickStatsProfile;
  const { matchResultMatches, resultFilterLabel, scoreBreakdown } = window.NickStatsFilters;
  const availability = window.NickStatsAvailability;
  const matchList = window.NickStatsMatchList;

  function readRecent() {
    try {
      const rows = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
      return Array.isArray(rows) ? rows.filter(row => row && row.id != null).slice(0, MAX_RECENT) : [];
    } catch (_) { return []; }
  }

  const state = {
    profiles: new Map(), activeId: null, graphPlayers: new Set(), recent: readRecent(),
    display: "profile", view: "overview", searchController: null, profileController: null, searchTimer: null,
    side: "ALL", buy: "ALL", heroOnly: false, opponentBuy: "ALL", roundResult: "ALL", roundPhase: "ALL", result: "ALL", maps: []
  };
  const activeProfile = () => state.profiles.get(state.activeId) || null;
  const mapFilter = new window.NickStatsFilters.MultiMapFilter("playerMapFilter", {
    formatLabel: value => titleCase(value.replace(/^de_/, "")),
    onChange: values => { state.maps = values; if (activeProfile()) renderCurrentDisplay(); }
  });
  const dateFilter = new window.NickStatsFilters.DateRangeFilter(["playerDateFilter", "playerHistoryDateFilter"], {
    onChange: () => {
      state.profiles.forEach(profile => {
        if (profile.matchHistory) { profile.matchHistory.controller?.abort(); profile.matchHistory.loaded = false; profile.matchHistory.loading = false; }
      });
      if (activeProfile()) { renderCurrentDisplay(); if (state.display === "profile" && state.view === "matches") renderPlayerMatches(); }
    }
  });
  const quickComparison = window.NickStatsQuickComparison.create({ prefix: "player" });

  async function apiJson(response) {
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.reason || `The API returned HTTP ${response.status}.`);
    return body;
  }
  function expandDenseProfile(payload) {
    const keys = Array.isArray(payload?.stat_keys) ? payload.stat_keys : [];
    if (!keys.length) return payload;
    for (const match of payload.matches || []) {
      for (const row of match.sides || []) {
        if (!Array.isArray(row.stats)) continue;
        const values = row.stats, stats = {};
        for (let index = 0; index < keys.length && index < values.length; index += 1) {
          if (values[index] != null) stats[keys[index]] = values[index];
        }
        row.stats = stats;
      }
    }
    delete payload.stat_keys;
    return payload;
  }
  function setSearchStatus(message, error = false) {
    $("playerSearchStatus").textContent = message;
    $("playerSearchStatus").classList.toggle("error", error);
  }
  function setPlayerView(view) {
    state.view = view;
    document.querySelectorAll("[data-player-view]").forEach(button => {
      const active = button.dataset.playerView === view;
      button.classList.toggle("active", active); button.setAttribute("aria-selected", String(active)); button.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll("[data-player-profile-view]").forEach(panel => { panel.hidden = panel.dataset.playerProfileView !== view; });
    syncStatsToolbar();
    if (view === "matches" && state.display === "profile" && activeProfile()) renderPlayerMatches();
    if (view === "graphs" && state.display === "profile" && activeProfile()) {
      renderGraphPlayers();
      renderGraphs();
    }
  }
  function setPlayerDisplay(display) {
    state.display = display === "quick" ? "quick" : "profile";
    document.querySelectorAll("[data-player-display-panel]").forEach(panel => {
      panel.hidden = panel.dataset.playerDisplayPanel !== state.display;
    });
    syncStatsToolbar();
    renderOpenTabs();
    if (activeProfile()) renderCurrentDisplay();
  }

  function syncStatsToolbar() {
    $("playerStatsToolbar").hidden = state.display === "profile" && state.view === "matches";
  }

  function renderCurrentDisplay() {
    if (state.display === "quick") renderQuickComparison();
    else renderProfile();
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

  function matchHistory(profile) {
    if (!profile.matchHistory) {
      profile.matchHistory = { loaded: false, loading: false, offset: 0, matches: [], controller: null };
    }
    return profile.matchHistory;
  }

  function openHistoryMatch(match) {
    if (match?.id == null) return;
    location.hash = `#match/${encodeURIComponent(match.id)}`;
  }

  function renderPlayerMatches() {
    const profile = activeProfile();
    if (!profile) return;
    const history = matchHistory(profile);
    const status = $("playerMatchesStatus");
    if (!history.loaded && !history.loading) {
      loadPlayerMatches(profile, 0);
      return;
    }
    if (history.loading && !history.loaded) {
      $("playerMatchesList").replaceChildren();
      $("playerMatchesPagination").hidden = true;
      status.textContent = "Loading match history…";
      return;
    }
    matchList.render($("playerMatchesList"), history.matches, openHistoryMatch);
    status.classList.remove("error");
    status.textContent = history.matches.length
      ? `${history.matches.length} match${history.matches.length === 1 ? "" : "es"} shown for ${profile.payload.player?.name || "this player"}.`
      : history.offset ? "No more matches." : "No matches found for this player.";
    $("playerMatchesPagination").hidden = history.offset === 0 && history.matches.length < MATCH_HISTORY_LIMIT;
    $("playerMatchesPrevious").disabled = history.loading || history.offset === 0;
    $("playerMatchesNext").disabled = history.loading || history.matches.length < MATCH_HISTORY_LIMIT;
    $("playerMatchesPageLabel").textContent = history.matches.length
      ? `Matches ${history.offset + 1}–${history.offset + history.matches.length}` : "";
  }

  async function loadPlayerMatches(profile, offset) {
    const history = matchHistory(profile);
    history.controller?.abort();
    const controller = new AbortController();
    history.controller = controller;
    history.loading = true;
    const isCurrent = () => activeProfile() === profile && state.display === "profile" && state.view === "matches";
    if (isCurrent()) {
      $("playerMatchesList").replaceChildren();
      $("playerMatchesPagination").hidden = true;
      $("playerMatchesStatus").textContent = "Loading match history…";
      $("playerMatchesStatus").classList.remove("error");
      $("playerMatchesPrevious").disabled = true;
      $("playerMatchesNext").disabled = true;
    }
    try {
      const steamID = profile.payload.player?.steam_id;
      if (!steamID) throw new Error("This player has no Steam ID.");
      const parameters = new URLSearchParams({
        steam_id: steamID,
        limit: String(MATCH_HISTORY_LIMIT),
        offset: String(Math.max(0, offset))
      });
      dateFilter.appendQuery(parameters);
      const accountPlayerID = window.NickStatsAccountPlayer?.id;
      if (accountPlayerID) parameters.set("viewer_player_id", accountPlayerID);
      const payload = await apiJson(await fetch(`${MATCH_ENDPOINT}?${parameters}`, {
        headers: { Accept: "application/json" },
        signal: controller.signal
      }));
      if (history.controller !== controller) return;
      history.matches = Array.isArray(payload.matches) ? payload.matches : [];
      history.offset = Math.max(0, offset);
      history.loaded = true;
    } catch (error) {
      if (error.name === "AbortError") return;
      history.matches = [];
      history.offset = Math.max(0, offset);
      history.loaded = false;
      if (isCurrent()) {
        $("playerMatchesList").replaceChildren();
        $("playerMatchesStatus").textContent = `Could not load match history: ${error.message}`;
        $("playerMatchesStatus").classList.add("error");
        $("playerMatchesPagination").hidden = true;
      }
      return;
    } finally {
      if (history.controller === controller) {
        history.loading = false;
        history.controller = null;
      }
    }
    if (isCurrent()) renderPlayerMatches();
  }

  function mergeStats(target, source) {
    for (const [key, value] of Object.entries(source || {})) target[key] = key.endsWith("_max") ? Math.max(number(target[key]), number(value)) : number(target[key]) + number(value);
  }
  function economyRowMatches(row, buy, opponentBuy, roundResult, roundPhase = "ALL", heroOnly = false) {
    if ((row.round_phase || "ALL") !== roundPhase) return false;
    if (Boolean(row.hero) !== heroOnly) return false;
    const rowOpponentBuy = row.opponent_buy_type || "ALL";
    if (opponentBuy !== "ALL") {
      return rowOpponentBuy === opponentBuy && (buy === "ALL" || (buy === "hero" ? ["eco", "force"].includes(row.buy_type) : row.buy_type === buy)) &&
        (roundResult === "ALL" || row.round_result === roundResult);
    }
    return rowOpponentBuy === "ALL" &&
      (buy === "ALL" || buy === "hero" ? (row.buy_type || "ALL") === "ALL" : row.buy_type === buy) &&
      (roundResult === "ALL" ? (row.round_result || "ALL") === "ALL" : row.round_result === roundResult);
  }
  function matchView(match, side, buy = "ALL", roundResult = "ALL", opponentBuy = "ALL", roundPhase = "ALL", heroOnly = false) {
    const stats = {}, weapons = new Map();
    const selected = (match.sides || []).filter(row =>
      economyRowMatches(row, buy, opponentBuy, roundResult, roundPhase, heroOnly) &&
      (side === "ALL" || row.side === side));
    if (!selected.length && !heroOnly && roundPhase === "ALL" && side === "ALL" && buy === "ALL" && opponentBuy === "ALL" && roundResult === "ALL") mergeStats(stats, { rounds: match.rounds, kills: match.kills, deaths: match.deaths, assists: match.assists, headshots: match.headshots, damage: match.damage, kast_rounds: match.kast_rounds });
    for (const row of selected) {
      mergeStats(stats, row.stats);
      for (const weapon of row.weapons || []) {
        const current = weapons.get(weapon.weapon) || { weapon: weapon.weapon, kills: 0, shots: 0, hits: 0, damage: 0, rounds_used: 0 };
        current.kills += number(weapon.kills); current.shots += number(weapon.shots); current.hits += number(weapon.hits); current.damage += number(weapon.damage); current.rounds_used += number(weapon.rounds_used); weapons.set(weapon.weapon, current);
      }
    }
    return { match, stats, weapons: [...weapons.values()] };
  }
  function aggregate(matches, side, buy = "ALL", roundResult = "ALL", opponentBuy = "ALL", roundPhase = "ALL", heroOnly = false) {
    const stats = {}, weapons = new Map();
    const views = matches.map(match => matchView(match, side, buy, roundResult, opponentBuy, roundPhase, heroOnly));
    const qualifyingMatches = roundPhase === "ALL" && !heroOnly ? matches : views.filter(view => number(view.stats.rounds) > 0).map(view => view.match);
    for (const view of views) {
      availability.add(stats, view.stats, view.match.schema);
      for (const weapon of view.weapons) {
        const current = weapons.get(weapon.weapon) || { ...weapon, kills: 0, shots: 0, hits: 0, damage: 0, rounds_used: 0 };
        for (const key of ["kills", "shots", "hits", "damage", "rounds_used"]) current[key] += number(weapon[key]);
        weapons.set(weapon.weapon, current);
      }
    }
    const wins = qualifyingMatches.filter(match => match.result === "w").length, losses = qualifyingMatches.filter(match => match.result === "l").length;
    const draws = qualifyingMatches.length - wins - losses, rounds = number(stats.rounds), kills = number(stats.kills), deaths = number(stats.deaths), assists = number(stats.assists);
    const kpr = ratio(kills, rounds), dpr = ratio(deaths, rounds), apr = ratio(assists, rounds), adr = ratio(stats.damage, rounds), kast = 100 * ratio(stats.kast_rounds, rounds);
    const impact = 2.13 * kpr + .42 * apr - .41;
    const rating = rounds ? Math.max(0, .0073 * kast + .3591 * kpr - .5329 * dpr + .2372 * impact + .0032 * adr + .1587) : 0;
    const matchWinRate = !heroOnly && roundPhase === "ALL" && side === "ALL" && buy === "ALL" && opponentBuy === "ALL" && roundResult === "ALL";
    return {
      stats: availability.materialize(stats), weapons: [...weapons.values()].sort((a, b) => b.kills - a.kills || b.damage - a.damage),
      matches: qualifyingMatches.length, wins, losses, draws, rounds, rating, kd: ratio(kills, deaths), adr, kast,
      winRate: matchWinRate ? 100 * ratio(wins, qualifyingMatches.length) : 100 * ratio(stats.round_wins, rounds), winRateKind: matchWinRate ? "match" : "round", scores: scoreBreakdown(qualifyingMatches)
    };
  }

  function matchesFor(payload) {
    const selectedMaps = new Set(state.maps);
    return (payload.matches || []).filter(match => (!selectedMaps.size || selectedMaps.has(match.map)) && matchResultMatches(match.result, state.result) && dateFilter.matches(match.played_at));
  }
  function aggregationKey(map = "ALL") {
    return [state.side, state.buy, state.heroOnly, state.opponentBuy, state.roundResult, state.roundPhase, state.result, [...state.maps].sort().join(","), dateFilter.from, dateFilter.through, map].join("|");
  }
  function summaryFor(profile, map = "ALL") {
    profile.summaryCache ||= new Map();
    const key = aggregationKey(map);
    if (!profile.summaryCache.has(key)) {
      const matches = matchesFor(profile.payload).filter(match => map === "ALL" || match.map === map);
      profile.summaryCache.set(key, aggregate(matches, state.side, state.buy, state.roundResult, state.opponentBuy, state.roundPhase, state.heroOnly));
    }
    return profile.summaryCache.get(key);
  }
  function renderGraphPlayers() {
    const target = $("playerGraphPlayers"); target.replaceChildren();
    state.profiles.forEach((profile, id) => {
      const label = document.createElement("label"); label.className = "graph-player-choice";
      const input = document.createElement("input"); input.type = "checkbox"; input.checked = state.graphPlayers.has(id);
      const name = document.createElement("span"); name.textContent = profile.payload.player?.name || "Unknown player";
      input.addEventListener("change", () => {
        if (input.checked && state.graphPlayers.size >= MAX_GRAPH_PLAYERS) {
          input.checked = false;
          $("playerGraphPlayerStatus").textContent = `Choose up to ${MAX_GRAPH_PLAYERS} players.`;
          return;
        }
        input.checked ? state.graphPlayers.add(id) : state.graphPlayers.delete(id);
        renderGraphPlayers(); renderGraphs();
      });
      label.append(input, name); target.appendChild(label);
    });
    $("playerGraphPlayerStatus").textContent = `${state.graphPlayers.size} of ${MAX_GRAPH_PLAYERS} players selected`;
  }
  function renderGraphs() {
    if (!activeProfile()) return;
    const availableSeries = [...state.profiles.entries()].map(([id, candidate], colorIndex) => {
      const matches = matchesFor(candidate.payload);
      candidate.graphCache ||= new Map();
      const key = aggregationKey();
      if (!candidate.graphCache.has(key)) {
        candidate.graphCache.set(key, window.NickStatsGraphs.samplesForMatches(matches, state.side, state.buy, state.roundResult, state.opponentBuy, state.roundPhase, state.heroOnly));
      }
      return { id, colorIndex, label: candidate.payload.player?.name || "Unknown player", samples: candidate.graphCache.get(key),
        roundMatches: matches.map(match => ({ round_kills: window.NickStatsRoundTimeline.withDifferentials(match.round_kills).filter(row => window.NickStatsRoundTimeline.matchesFilters(row, {
          side: state.side, buy: state.buy, opponentBuy: state.opponentBuy, result: state.roundResult, phase: state.roundPhase, heroOnly: state.heroOnly
        })) })) };
    });
    const series = availableSeries.filter(candidate => state.graphPlayers.has(candidate.id));
    window.NickStatsGraphs.render({ prefix: "player", series, domainSeries: availableSeries, independent: true });
  }
  function quickSummary(matches, cachedSummary = null) {
    const summary = cachedSummary || aggregate(matches, state.side, state.buy, state.roundResult, state.opponentBuy, state.roundPhase, state.heroOnly), stats = summary.stats;
    const openingKills = number(stats.opening_kills), openingDeaths = number(stats.opening_deaths);
    const assistedOpenings = availability.scope(stats, "opening_assisted_kills");
    return {
      ...stats,
      rounds: summary.rounds,
      kd: summary.kd,
      adr: summary.adr,
      rating: summary.rating,
      winRate: summary.winRate,
      winRateKind: summary.winRateKind,
      kast: summary.kast,
      openingAttemptRate: 100 * ratio(openingKills + openingDeaths, summary.rounds),
      openingDiff: openingKills - openingDeaths,
      openingSuccess: 100 * ratio(openingKills, openingKills + openingDeaths),
      openingAssistRate: assistedOpenings
        ? 100 * ratio(assistedOpenings.opening_assisted_kills, assistedOpenings.opening_kills)
        : Number.NaN
    };
  }
  function renderQuickComparison() {
    if (!activeProfile()) return;
    quickComparison.render({
      players: [...state.profiles.entries()]
        .map(([id, candidate]) => ({
          id,
          label: candidate.payload.player?.name || "Unknown player",
          rows: matchesFor(candidate.payload),
          summarize: (rows, map) => quickSummary(rows, summaryFor(candidate, map))
        })),
      summarize: quickSummary,
      metaSuffix: resultFilterLabel(state.result)
    });
  }

  function renderOpenTabs() {
    const tabs = $("playerOpenProfiles"); tabs.replaceChildren(); tabs.hidden = !state.profiles.size;
    const quickActive = state.display === "quick";
    const quickItem = document.createElement("div"); quickItem.className = `player-open-tab single${quickActive ? " active" : ""}`;
    const quick = document.createElement("button"); quick.type = "button"; quick.className = "player-open-tab-label"; quick.setAttribute("role", "tab");
    quick.setAttribute("aria-selected", String(quickActive)); quick.tabIndex = quickActive ? 0 : -1; quick.textContent = "Quick comparison";
    quick.addEventListener("click", () => setPlayerDisplay("quick"));
    quickItem.appendChild(quick); tabs.appendChild(quickItem);
    state.profiles.forEach((profile, id) => {
      const active = state.display === "profile" && id === state.activeId;
      const item = document.createElement("div"); item.className = `player-open-tab${active ? " active" : ""}`;
      const open = document.createElement("button"); open.type = "button"; open.className = "player-open-tab-label"; open.setAttribute("role", "tab");
      open.setAttribute("aria-selected", String(active)); open.tabIndex = active ? 0 : -1; open.textContent = profile.payload.player?.name || "Unknown player";
      open.addEventListener("click", () => { state.display = "profile"; activateProfile(id); });
      const close = document.createElement("button"); close.type = "button"; close.className = "player-open-tab-close"; close.textContent = "×";
      close.setAttribute("aria-label", `Close ${profile.payload.player?.name || "player"} profile`); close.addEventListener("click", () => closeProfile(id));
      item.append(open, close); tabs.appendChild(item);
    });
  }

  function renderProfile() {
    const profile = activeProfile(); if (!profile) return;
    const payload = profile.payload, player = payload.player || {}, matches = matchesFor(payload), summary = summaryFor(profile);
    const sideLabel = state.side === "ALL" ? "All sides" : state.side;
    $("playerProfileName").textContent = player.name || "Unknown player";
    const buyLabel = state.buy === "ALL" ? "All buys" : state.buy === "hero" ? "Hero rounds" : `${titleCase(state.buy)} buys`;
    const opponentBuyLabel = state.opponentBuy === "ALL" ? "All enemy buys" : `vs ${titleCase(state.opponentBuy)}`;
    const roundLabel = state.roundResult === "ALL" ? "All rounds" : state.roundResult === "win" ? "Rounds won" : "Rounds lost";
    $("playerProfileMeta").textContent = `Steam ${player.steam_id || "unknown"} · ${integer(summary.matches)} match${summary.matches === 1 ? "" : "es"} · ${sideLabel} · ${buyLabel} · ${opponentBuyLabel} · ${roundLabel} · ${state.roundPhase === "ALL" ? "All phases" : state.roundPhase === "REGULATION" ? "Regulation" : "Overtime"} · ${resultFilterLabel(state.result)}${state.maps.length ? ` · ${mapFilter.summary()}` : ""}${dateFilter.active ? ` · ${dateFilter.summary()}` : ""}`;
    const maps = new Map(); for (const match of matches) { const current = maps.get(match.map) || { name: match.map, rows: [] }; current.rows.push(match); maps.set(match.map, current); }
    const mapRows = [...maps.values()].map(map => ({ name: map.name, summary: summaryFor(profile, map.name) })).sort((a, b) => b.summary.matches - a.summary.matches || a.name.localeCompare(b.name));
    window.NickStatsProfile.render({ prefix: "player", headlineId: "playerHeadlineStats", summary, side: state.side, result: state.result, roundResult: state.roundResult, maps: mapRows });
    if (state.view === "graphs") { renderGraphPlayers(); renderGraphs(); }
    $("playerProfile").hidden = false; $("playerProfileStatus").textContent = "";
  }

  function activateProfile(id) {
    id = String(id); const profile = state.profiles.get(id); if (!profile) return;
    state.activeId = id;
    const availableMaps = [...state.profiles.values()].flatMap(candidate => (candidate.payload.matches || []).map(match => match.map));
    mapFilter.setOptions(availableMaps); state.maps = mapFilter.values();
    setPlayerView(state.view); setPlayerDisplay(state.display);
  }
  function closeProfile(id) {
    id = String(id); const ids = [...state.profiles.keys()], index = ids.indexOf(id);
    state.profiles.get(id)?.matchHistory?.controller?.abort();
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
      const payload = expandDenseProfile(await apiJson(await fetch(`${PLAYER_ENDPOINT}/${encodeURIComponent(id)}?compact=true&wire=2`, { headers: { Accept: "application/json" }, signal: state.profileController.signal })));
      const key = String(payload.player?.id ?? id);
      state.profiles.set(key, { payload });
      if (state.graphPlayers.size < MAX_GRAPH_PLAYERS) state.graphPlayers.add(key);
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
  $("playerMatchesPrevious").addEventListener("click", () => {
    const profile = activeProfile(); if (!profile) return;
    loadPlayerMatches(profile, Math.max(0, matchHistory(profile).offset - MATCH_HISTORY_LIMIT));
  });
  $("playerMatchesNext").addEventListener("click", () => {
    const profile = activeProfile(); if (!profile) return;
    loadPlayerMatches(profile, matchHistory(profile).offset + MATCH_HISTORY_LIMIT);
  });
  window.addEventListener("nickstats:account-player", () => {
    for (const profile of state.profiles.values()) {
      profile.matchHistory?.controller?.abort();
      if (profile.matchHistory) {
        profile.matchHistory.loaded = false;
        profile.matchHistory.loading = false;
        profile.matchHistory.controller = null;
      }
    }
    if (state.view === "matches" && state.display === "profile" && activeProfile()) renderPlayerMatches();
  });
  window.NickStatsFilters.bindSideToggle({ selector: "[data-player-side]", valueFor: button => button.dataset.playerSide, onChange: side => { state.side = side; if (activeProfile()) renderCurrentDisplay(); } });
  window.NickStatsFilters.bindSegmentedToggle({ selector: "[data-player-buy]", valueFor: button => button.dataset.playerBuy, onChange: buy => { state.buy = buy; state.heroOnly = buy === "hero"; if (activeProfile()) renderCurrentDisplay(); } });
  window.NickStatsFilters.bindSegmentedToggle({ selector: "[data-player-enemy-buy]", valueFor: button => button.dataset.playerEnemyBuy, onChange: opponentBuy => { state.opponentBuy = opponentBuy; if (activeProfile()) renderCurrentDisplay(); } });
  window.NickStatsFilters.bindSegmentedToggle({ selector: "[data-player-round-result]", valueFor: button => button.dataset.playerRoundResult, onChange: roundResult => { state.roundResult = roundResult; if (activeProfile()) renderCurrentDisplay(); } });
  window.NickStatsFilters.bindSegmentedToggle({ selector: "[data-player-round-phase]", valueFor: button => button.dataset.playerRoundPhase, onChange: phase => { state.roundPhase = phase; if (activeProfile()) renderCurrentDisplay(); } });
  window.NickStatsFilters.bindSegmentedToggle({ selector: "[data-player-result]", valueFor: button => button.dataset.playerResult, onChange: result => { state.result = result; if (activeProfile()) renderCurrentDisplay(); } });
  renderRecent(); renderOpenTabs();
})();
