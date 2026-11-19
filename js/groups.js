(() => {
  "use strict";

  const GROUP_DATA_ENDPOINT = "/nickstats/api/groups";
  const MAX_GROUP = 20;
  const MATCH_LIST_LIMIT = 50;
  const GROUP_SELECTION_KEY = "nickstats.groupSelection.v1";
  const GROUP_QUERY_KEY = "nickstats.groupQuery.v2";
  const rules = window.NickStatsGroupRules;
  function readSavedQuery() {
    try { return JSON.parse(localStorage.getItem(GROUP_QUERY_KEY) || "null"); }
    catch (_) { return null; }
  }
  const savedQuery = readSavedQuery();
  const $ = id => document.getElementById(id);
  const ui = Object.fromEntries(["groupStatus", "comboMatchesStatus", "comboGraphPlayerStatus", "comboProfileTitle", "comboProfileMeta"].map(id => [id, window.NickStatsShellUI.text(id)]));
  ui.warnings = window.NickStatsShellUI.warnings("comboWarnings");
  window.NickStatsShellUI.button("groupAnalyze", () => {
    window.NickStatsAnalyzer.open({ mode: "groups", players: [...state.selected.values()], rules: state.rules,
      date: { from: dateFilter.from, through: dateFilter.through }, tags: [...manualFilter.selected],
      map: mapFilter.values().length === 1 ? mapFilter.values()[0] : "" });
  });

  const availability = window.NickStatsAvailability;
  function readSavedRoster() {
    try {
      const rows = Array.isArray(savedQuery?.players) ? savedQuery.players : JSON.parse(localStorage.getItem(GROUP_SELECTION_KEY) || "[]");
      if (!Array.isArray(rows)) return [];
      const roster = [], seen = new Set();
      for (const row of rows) {
        if (!row || row.id == null || seen.has(String(row.id)) || roster.length >= MAX_GROUP) continue;
        const id = String(row.id), choice = row.choice === "exclude" ? "exclude" : "include";
        seen.add(id);
        roster.push({ player: { id, name: row.name || "Unknown player", steam_id: row.steam_id || "", match_count: Number(row.match_count) || 0 }, choice });
      }
      return roster;
    } catch (_) { return []; }
  }
  const savedRoster = readSavedRoster();
  const state = {
    selected: new Map(savedRoster.map(({ player }) => [String(player.id), player])), players: [],
    rules: rules.normalizeEditorRules(savedQuery?.rules || rules.legacyRules(savedRoster), savedRoster.map(({ player }) => player.id)),
    groupController: null, groupStale: false, groupLoadedAt: 0,
    side: "ALL", buy: "ALL", heroOnly: false, opponentBuy: "ALL", roundResult: "ALL", roundPhase: "ALL", result: "ALL",
    comboPlayerId: "", comboView: "overview", comboDisplay: "profile", graphPlayers: null, matchListKey: "", matchListOffset: 0
  };

  function num(value) {
    const result = Number(value);
    return Number.isFinite(result) ? result : 0;
  }

  async function apiJson(response) {
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.reason || `The API returned HTTP ${response.status}.`);
    return body;
  }

  function setStatus(message, error = false) {
    ui.groupStatus.update({ text: message });
    ui.groupStatus.update({ error: error });
  }

  function setSearchStatus(message, error = false) { playerSearch.status(message, error); }

  function persistRoster() {
    const players = [...state.selected.values()].map(player => ({
      id: String(player.id), name: player.name || "Unknown player", steam_id: player.steam_id || "",
      match_count: num(player.match_count)
    }));
    try {
      if (players.length) localStorage.setItem(GROUP_QUERY_KEY, JSON.stringify({ players, rules: state.rules }));
      else { localStorage.removeItem(GROUP_QUERY_KEY); localStorage.removeItem(GROUP_SELECTION_KEY); }
    } catch (_) {}
  }

  function canBuild() { return state.selected.size >= 1; }

  function playerRating(row) {
    const rounds = num(row.rounds);
    if (!rounds) return 0;
    const kpr = num(row.kills) / rounds;
    const dpr = num(row.deaths) / rounds;
    const apr = num(row.assists) / rounds;
    const adr = num(row.damage) / rounds;
    const kast = 100 * num(row.kast_rounds) / rounds;
    const impact = 2.13 * kpr + 0.42 * apr - 0.41;
    return Math.max(0, 0.0073 * kast + 0.3591 * kpr - 0.5329 * dpr +
      0.2372 * impact + 0.0032 * adr + 0.1587);
  }

  function mergeStats(target, source) {
    for (const [key, value] of Object.entries(source || {})) target[key] = key.endsWith("_max") ? Math.max(num(target[key]), num(value)) : num(target[key]) + num(value);
  }

  function selectedView(row) {
    const selected = (row.sideRows || []).filter(side => {
      const rowOpponentBuy = side.opponent_buy_type || "ALL";
      const economyMatches = state.opponentBuy !== "ALL"
        ? rowOpponentBuy === state.opponentBuy && (state.buy === "ALL" || (state.buy === "hero" ? ["eco", "force"].includes(side.buy_type) : side.buy_type === state.buy)) &&
          (state.roundResult === "ALL" || side.round_result === state.roundResult)
        : rowOpponentBuy === "ALL" &&
          (state.buy === "ALL" || state.buy === "hero" ? (side.buy_type || "ALL") === "ALL" : side.buy_type === state.buy) &&
          (state.roundResult === "ALL" ? (side.round_result || "ALL") === "ALL" : side.round_result === state.roundResult);
      return economyMatches && Boolean(side.hero) === state.heroOnly && (side.round_phase || "ALL") === state.roundPhase && (state.side === "ALL" || side.side === state.side);
    });
    const stats = {}, weapons = new Map();
    selected.forEach(side => {
      mergeStats(stats, side.stats);
      (side.weapons || []).forEach(weapon => {
        const current = weapons.get(weapon.weapon) || { kills: 0, damage: 0, shots: 0, hits: 0, rounds_used: 0 };
        current.kills += num(weapon.kills); current.damage += num(weapon.damage); current.shots += num(weapon.shots); current.hits += num(weapon.hits); current.rounds_used += num(weapon.rounds_used); weapons.set(weapon.weapon, current);
      });
    });
    if (!selected.length && !state.heroOnly && state.roundPhase === "ALL" && state.side === "ALL" && state.buy === "ALL" && state.opponentBuy === "ALL" && state.roundResult === "ALL") mergeStats(stats, row.legacy);
    return { stats, weapons };
  }

  function normalizePlayer(player) {
    return {
      profileId: String(player.id),
      label: player.name || "Unknown player",
      steamId: player.steam_id,
      rows: (player.matches || []).map(match => ({
        id: String(match.id), schema: match.schema, date: num(match.played_at), map: match.map || "Unknown",
        result: ["w", "l", "n"].includes(match.result) ? match.result : "n",
        score: [match.score_for, match.score_against],
        teammateIds: (match.teammate_ids || []).map(String),
        opponentIds: Array.isArray(match.opponent_ids) ? match.opponent_ids.map(String) : null,
        sideRows: Array.isArray(match.sides) ? match.sides : [],
        round_kills: Array.isArray(match.round_kills) ? match.round_kills : [],
        legacy: { rounds: num(match.rounds), kills: num(match.kills), deaths: num(match.deaths), assists: num(match.assists), headshots: num(match.headshots), damage: num(match.damage), kast_rounds: num(match.kast_rounds) }
      }))
    };
  }

  function summarize(rows) {
    const qualifyingRows = state.roundPhase === "ALL" && !state.heroOnly ? rows : rows.filter(row => num(selectedView(row).stats.rounds) > 0);
    const n = qualifyingRows.length;
    const stats = {}, weapons = new Map();
    rows.forEach(row => { const view = selectedView(row); availability.add(stats, view.stats, row.schema); view.weapons.forEach((weapon, name) => { const current = weapons.get(name) || { kills: 0, damage: 0, shots: 0, hits: 0, rounds_used: 0 }; Object.keys(current).forEach(key => current[key] += num(weapon[key])); weapons.set(name, current); }); });
    const kills = num(stats.kills), deaths = num(stats.deaths), assists = num(stats.assists);
    const rounds = num(stats.rounds), damage = num(stats.damage), kastRounds = num(stats.kast_rounds);
    const wins = qualifyingRows.filter(row => row.result === "w").length;
    const losses = qualifyingRows.filter(row => row.result === "l").length;
    const ties = qualifyingRows.filter(row => row.result === "n").length;
    const aggregate = { rounds, kills, deaths, assists, damage, kast_rounds: kastRounds };
    const materialized = availability.materialize(stats);
    const assistedOpenings = availability.scope(stats, "opening_assisted_kills");
    const trueMultikills = availability.scope(stats, "trueMultikillPercent");
    const multikillRounds = [2, 3, 4, 5].reduce((total, kills) => total + num(stats[`kill_rounds_${kills}k`]), 0);
    const trueMultikillRounds = trueMultikills
      ? num(trueMultikills.true_multikill_rounds) : 0;
    const matchWinRate = !state.heroOnly && state.roundPhase === "ALL" && state.side === "ALL" && state.buy === "ALL" && state.opponentBuy === "ALL" && state.roundResult === "ALL";
    const result = {
      ...materialized,
      n, wins, losses, ties,
      scores: scoreBreakdown(qualifyingRows, { scoreFor: row => row.score?.[0], scoreAgainst: row => row.score?.[1] }),
      winRate: matchWinRate ? (n ? 100 * wins / n : 0) : (rounds ? 100 * num(stats.round_wins) / rounds : 0), winRateKind: matchWinRate ? "match" : "round",
      kd: deaths ? kills / deaths : kills,
      avgK: n ? kills / n : 0,
      avgD: n ? deaths / n : 0,
      avgA: n ? assists / n : 0,
      avgHs: kills ? 100 * num(stats.headshots) / kills : 0,
      adr: rounds ? damage / rounds : 0,
      damageDiff: damage - num(stats.damage_received),
      kast: rounds ? 100 * kastRounds / rounds : 0,
      rating: playerRating(aggregate), kpr: rounds ? kills / rounds : 0, dpr: rounds ? deaths / rounds : 0, apr: rounds ? assists / rounds : 0,
      hs: kills ? 100 * num(stats.headshots) / kills : 0,
      openingAttempts: num(stats.opening_kills) + num(stats.opening_deaths),
      openingAttemptRate: rounds ? 100 * (num(stats.opening_kills) + num(stats.opening_deaths)) / rounds : 0,
      openingDiff: num(stats.opening_kills) - num(stats.opening_deaths), openingSuccess: 100 * num(stats.opening_kills) / Math.max(1, num(stats.opening_kills) + num(stats.opening_deaths)),
      openingAssistRate: assistedOpenings
        ? 100 * num(assistedOpenings.opening_assisted_kills) / Math.max(1, num(assistedOpenings.opening_kills))
        : Number.NaN,
      multikillPercent: 100 * multikillRounds / Math.max(1, rounds),
      trueMultikillPercent: trueMultikills ? 100 * trueMultikillRounds / Math.max(1, num(trueMultikills.rounds)) : Number.NaN,
      tradeAttemptRate: 100 * num(stats.trade_attempts) / Math.max(1, num(stats.trade_opportunities)), tradeSuccessRate: 100 * num(stats.trade_successes) / Math.max(1, num(stats.trade_attempts)),
      utilityDamage: num(stats.he_damage) + num(stats.fire_damage), udr: rounds ? (num(stats.he_damage) + num(stats.fire_damage)) / rounds : 0,
      blindSeconds: num(stats.blind_duration_ms) / 1000,
      teammateBlindSeconds: num(stats.teammate_blind_duration_ms) / 1000,
      selfBlindSeconds: num(stats.self_blind_duration_ms) / 1000,
      killSpeed: num(stats.kill_speed_total) / Math.max(1, num(stats.kill_speed_samples)),
      killSpeedPercent: num(stats.kill_speed_percent_total) / Math.max(1, num(stats.kill_speed_percent_samples)), deathSpeed: num(stats.death_speed_total) / Math.max(1, num(stats.death_speed_samples)),
      deathSpeedPercent: num(stats.death_speed_percent_total) / Math.max(1, num(stats.death_speed_percent_samples)),
      averageKillTime: num(stats.kill_time_samples) ? num(stats.kill_time_total_ms) / num(stats.kill_time_samples) / 1000 : Number.NaN,
      averageDeathTime: num(stats.death_time_samples) ? num(stats.death_time_total_ms) / num(stats.death_time_samples) / 1000 : Number.NaN
    };
    result.weapons = [...weapons.entries()].map(([name, values]) => ({ weapon: name, ...values })).sort((a, b) => b.kills - a.kills || b.damage - a.damage);
    return result;
  }

  function populateMaps({ reset = true } = {}) {
    const names = []; state.players.forEach(player => player.rows.forEach(row => { if (row.map) names.push(row.map); }));
    mapFilter.setOptions(names, { reset });
  }


  function addPlayer(player) {
    if (state.selected.size >= MAX_GROUP) {
      setSearchStatus(`A group is limited to ${MAX_GROUP} players.`, true);
      return;
    }
    state.selected.set(String(player.id), player);
    state.rules = { ...state.rules, friendly: { ...state.rules.friendly,
      children: [...state.rules.friendly.children, rules.condition(player.id)] } };
    state.rules = rules.normalizeEditorRules(state.rules, state.selected.keys());
    playerSearch.reset();
    persistRoster();
    invalidateGroupResults();
    renderSelectedRoster();
  }

  function removePlayer(id) {
    state.selected.delete(String(id));
    state.rules = rules.normalizeEditorRules(state.rules, state.selected.keys());
    persistRoster();
    invalidateGroupResults();
    renderSelectedRoster();
  }

  function invalidateGroupResults() {
    state.groupController?.abort();
    state.groupController = null;
    state.groupStale = false;
    state.groupLoadedAt = 0;
    state.players = [];
    $("groupResults").hidden = true;
  }

  function setRules(value) {
    state.rules = rules.normalizeEditorRules(value, state.selected.keys());
    persistRoster();
    renderSelectedRoster();
    if (state.players.length) runCombination();
  }

  function orderedRuleCells(node) {
    if (!node.children) return node;
    const children = node.children.map(orderedRuleCells);
    return { ...node, children: [
      ...children.filter(child => child.playerId != null),
      ...children.filter(child => child.playerId == null)
    ] };
  }

  function renderSelectedRoster() {
    window.NickStatsGroupUI.render($("groupSelectedRoster"), {
      players: [...state.selected.values()],
      rules: { friendly: orderedRuleCells(state.rules.friendly), enemy: orderedRuleCells(state.rules.enemy) },
      onRules: setRules, onRemove: removePlayer
    });
    ui.groupBuildButton.update({ disabled: !canBuild() });
    ui.groupClearButton.update({ disabled: state.selected.size === 0 });
    setStatus(state.selected.size ? `${state.selected.size} players` : "");
  }

  async function buildGroup({ refresh = false } = {}) {
    if (!canBuild()) return;
    const perf = window.performance;
    const now = () => perf?.now() ?? Date.now();
    const started = now();
    const measure = (phase, start) => {
      if (!perf?.measure) return;
      const name = `NickStats Groups: ${phase}`;
      perf.clearMeasures(name);
      perf.measure(name, { start, end: now() });
    };
    state.groupController?.abort();
    const controller = new AbortController();
    state.groupController = controller;
    ui.groupBuildButton.update({ disabled: true });
    setStatus(refresh ? "Refreshing group profiles…" : "Loading stored matches and building group profiles…");
    try {
      const parameters = new URLSearchParams({ players: [...state.selected.keys()].join(","), wire: "4" });
      const [payload, ratings] = await Promise.all([
        fetch(`${GROUP_DATA_ENDPOINT}?${parameters}`, {
          headers: { Accept: "application/json" }, cache: "no-store", signal: controller.signal
        }).then(apiJson).then(payload => {
          measure("history request and JSON", started);
          const decodeStart = now();
          const expanded = window.NickStatsPlayerStats.expandDenseProfile(payload);
          measure("layout expansion", decodeStart);
          return expanded;
        }),
        Promise.all([...state.selected.keys()].map(async id => [String(id),
          await window.NickStatsPlayerStats.teammateRatingsFor(id, controller.signal)])).then(ratings => {
            measure("teammate ratings", started);
            return ratings;
          })
      ]);
      if (controller.signal.aborted) return;
      const renderStart = now();
      const ratingsByPlayer = new Map(ratings);
      const players = (payload.players || []).map(player => ({
        ...normalizePlayer(player), teammateRatings: ratingsByPlayer.get(String(player.id)) || {}
      }));
      if (controller.signal.aborted) return;
      state.players = players.sort((a, b) => a.label.localeCompare(b.label));
      populateMaps({ reset: !refresh });
      if (!refresh) state.graphPlayers = null;
      state.players.forEach(player => {
        const selected = state.selected.get(player.profileId);
        if (selected) state.selected.set(player.profileId, { ...selected, name: player.label, match_count: player.rows.length });
      });
      persistRoster();
      renderSelectedRoster();
      state.groupStale = false;
      state.groupLoadedAt = Date.now();
      $("groupResults").hidden = false;
      runCombination();
      setStatus(`Built ${displayedPlayers().length} conditional player profile${displayedPlayers().length === 1 ? "" : "s"}.`);
      measure("prepare and render", renderStart);
      measure("total", started);
    } catch (error) {
      controller.abort();
      if (error.name !== "AbortError") setStatus(`Could not build group profiles: ${error.message}`, true);
    } finally {
      if (state.groupController === controller) {
        state.groupController = null;
        ui.groupBuildButton.update({ disabled: !canBuild() });
      }
    }
  }

  function markGroupStale() {
    if (!state.players.length && !state.groupController) return;
    state.groupStale = true;
    state.groupController?.abort();
    state.groupController = null;
    ui.groupBuildButton.update({ disabled: !canBuild() });
    setStatus("Matches changed. Build profiles to update.");
  }

  window.addEventListener("nickstats:matches-changed", markGroupStale);
  function displayedPlayers() {
    return state.players;
  }

  function findCombination() {
    const profiles = displayedPlayers();
    if (!profiles.length) return null;
    const matches = rules.qualifyingMatches(state.players, state.rules,
      row => mapFilter.matches(row.map) && dateFilter.matches(row.date) && manualFilter.matches(row));
    return { profiles, matches };
  }

  function renderComboWarnings(current) {
    ui.warnings.update({ messages: current.matches.length ? [] : ["No stored matches satisfy these team conditions and filters."] });
  }

  function comboProfileRows(current, player) {
    return current.matches
      .map(match => match.rows.find(item => item.player.profileId === player.profileId)?.row)
      .filter(row => row && matchResultMatches(row.result, state.result));
  }

  function renderComboMatches(rows, player) {
    const matches = rows.filter(row => (state.roundPhase === "ALL" && !state.heroOnly) || num(selectedView(row).stats.rounds) > 0)
      .slice().sort((a, b) => b.date - a.date || String(b.id).localeCompare(String(a.id), undefined, { numeric: true }));
    const key = JSON.stringify([player.profileId, matches.map(row => row.id)]);
    if (state.matchListKey !== key) { state.matchListKey = key; state.matchListOffset = 0; }
    const offset = state.matchListOffset = Math.max(0, Math.min(state.matchListOffset,
      Math.max(0, Math.ceil(matches.length / MATCH_LIST_LIMIT) - 1) * MATCH_LIST_LIMIT));
    const page = matches.slice(offset, offset + MATCH_LIST_LIMIT).map(row => {
      const summary = summarize([row]);
      return {
        id: row.id, map: row.map, played_at: row.date,
        teams: row.score?.[0] == null || row.score?.[1] == null ? [] : [
          { name: `${player.label}'s team`, score: row.score[0] },
          { name: "Opponents", score: row.score[1] }
        ], viewer_team_slot: 0,
        viewer_stats: { rating: summary.rating, kills: summary.kills, deaths: summary.deaths, assists: summary.assists, adr: summary.adr }
      };
    });
    window.NickStatsMatchList.render($("comboMatchesList"), page, match => {
      location.hash = `#match/${encodeURIComponent(match.id)}`;
    }, { editableTags: true });
    ui.comboMatchesStatus.update({ text: `${matches.length} qualifying match${matches.length === 1 ? "" : "es"} for ${player.label}.` });
    ui.comboMatchesPagination.update({ hidden: matches.length <= MATCH_LIST_LIMIT });
    ui.comboMatchesPagination.update({ previousDisabled: offset === 0 });
    ui.comboMatchesPagination.update({ nextDisabled: offset + MATCH_LIST_LIMIT >= matches.length });
    ui.comboMatchesPagination.update({ text: page.length ? `Matches ${offset + 1}–${offset + page.length} of ${matches.length}` : "" });
  }

  const { integer, decimal, percent, ratio, titleCase } = window.NickStatsProfile;
  const { matchResultMatches, resultFilterLabel, scoreBreakdown } = window.NickStatsFilters;
  const mapFilter = window.NickStatsMapFilterUI.create("groupMapFilter", { onChange: () => runCombination(), formatLabel: value => titleCase(value.replace(/^de_/, "")) });
  const dateFilter = window.NickStatsDateFilterUI.create("groupDateFilter", { onChange: () => runCombination() });
  const quickComparison = window.NickStatsComparisonUI.create({ prefix: "combo", title: "Group scoreboard",
    description: "Compare selected players in matches satisfying the team rules.", mapsLabel: "Group quick comparison maps" });
  const manualFilter = window.NickStatsTagFilterUI.create("groupManualFilter", { onChange: () => { if (state.players.length) runCombination(); } });

  function setComboProfileView(view) {
    state.comboView = view;
    profileSectionTabs.set(view, { notify: false });
    document.querySelectorAll("[data-combo-profile-panel]").forEach(panel => { panel.hidden = panel.dataset.comboProfilePanel !== view; });
  }

  function setComboDisplay(display) {
    state.comboDisplay = ["quick", "graphs"].includes(display) ? display : "profile";
    renderComboTabs(findCombination());
    document.querySelectorAll("[data-combo-display-panel]").forEach(panel => {
      panel.hidden = panel.dataset.comboDisplayPanel !== state.comboDisplay;
    });
    if (state.comboDisplay === "graphs") renderComboGraphs(findCombination());
  }

  function renderComboTabs(current) {
    if (!current) return;
    window.NickStatsNavigationUI.group({
      profiles: current.profiles.map(player => ({ id: player.profileId, name: player.label })),
      display: state.comboDisplay, activeId: state.comboPlayerId, onDisplay: setComboDisplay,
      onSelect: id => { state.comboPlayerId = id; state.comboDisplay = "profile"; renderComboProfile(current); setComboDisplay("profile"); }
    });
  }

  function renderComboProfile(current) {
    if (!current.profiles.some(player => player.profileId === state.comboPlayerId)) state.comboPlayerId = current.profiles[0].profileId;
    renderComboTabs(current);
    const player = current.profiles.find(item => item.profileId === state.comboPlayerId);
    const rows = comboProfileRows(current, player), stats = summarize(rows);
    const sideLabel = state.side === "ALL" ? "All sides" : state.side;
    ui.comboProfileTitle.update({ text: player.label });
    const buyLabel = state.buy === "ALL" ? "All buys" : state.buy === "hero" ? "Hero rounds" : `${titleCase(state.buy)} buys`;
    const opponentBuyLabel = state.opponentBuy === "ALL" ? "All enemy buys" : `vs ${titleCase(state.opponentBuy)}`;
    const roundLabel = state.roundResult === "ALL" ? "All rounds" : state.roundResult === "win" ? "Rounds won" : "Rounds lost";
    ui.comboProfileMeta.update({ text: `Steam ${player.steamId || "unknown"} · ${integer(stats.n)} qualifying match${stats.n === 1 ? "" : "es"} · ${sideLabel} · ${buyLabel} · ${opponentBuyLabel} · ${roundLabel} · ${state.roundPhase === "ALL" ? "All phases" : state.roundPhase === "REGULATION" ? "Regulation" : "Overtime"} · ${resultFilterLabel(state.result)}${mapFilter.size ? ` · ${mapFilter.summary()}` : ""}${dateFilter.active ? ` · ${dateFilter.summary()}` : ""}${manualFilter.active ? ` · ${manualFilter.summary()}` : ""}` });
    const maps = new Map(); rows.forEach(row => { const collection = maps.get(row.map) || []; collection.push(row); maps.set(row.map, collection); });
    const normalize = source => ({ stats: source, weapons: source.weapons, matches: source.n, wins: source.wins, losses: source.losses, draws: source.ties, rating: source.rating, kd: source.kd, adr: source.adr, kast: source.kast, winRate: source.winRate, winRateKind: source.winRateKind, scores: source.scores });
    const mapRows = [...maps.entries()].map(([name, mapMatches]) => ({ name, summary: normalize(summarize(mapMatches)) })).sort((a, b) => b.summary.matches - a.summary.matches || a.name.localeCompare(b.name));
    window.NickStatsProfile.render({ prefix: "combo", headlineId: "comboProfileHeadline", summary: normalize(stats), side: state.side, result: state.result, roundResult: state.roundResult, maps: mapRows });
    renderComboMatches(rows, player);
    setComboProfileView(state.comboView);
  }

  function renderComboGraphs(current) {
    if (!current) return;
    const idFor = player => String(player.profileId);
    if (state.graphPlayers == null) state.graphPlayers = new Set(current.profiles.slice(0, 5).map(idFor));
    const selectedCount = current.profiles.filter(player => state.graphPlayers.has(idFor(player))).length;
    window.NickStatsPlayerSelectionUI.graphs($("comboGraphPlayers"), {
      players: current.profiles.map(player => ({ id: idFor(player), name: player.label })),
      selected: current.profiles.filter(player => state.graphPlayers.has(idFor(player))).map(idFor),
      descriptionId: "comboGraphPlayerStatus",
      onChange: (id, checked) => {
        if (checked && selectedCount >= 5) return;
        checked ? state.graphPlayers.add(id) : state.graphPlayers.delete(id);
        renderComboGraphs(current);
      }
    });
    ui.comboGraphPlayerStatus.update({ text: `${selectedCount} of ${current.profiles.length} players selected` });
    const series = current.profiles.map((candidate, colorIndex) => {
      const matches = comboProfileRows(current, candidate);
      return { id: idFor(candidate), colorIndex, label: candidate.label, sessionMatches: candidate.rows,
        samples: window.NickStatsGraphs.samplesForMatches(matches, state.side, state.buy, state.roundResult, state.opponentBuy, state.roundPhase, state.heroOnly, candidate.teammateRatings),
        roundMatches: matches.map(match => ({ round_kills: window.NickStatsRoundTimeline.withDifferentials(match.round_kills).filter(row => window.NickStatsRoundTimeline.matchesFilters(row, {
          side: state.side, buy: state.buy, opponentBuy: state.opponentBuy, result: state.roundResult, phase: state.roundPhase, heroOnly: state.heroOnly
        })) })) };
    });
    window.NickStatsGraphs.render({ prefix: "combo", series: series.filter(player => state.graphPlayers.has(player.id)), domainSeries: series, independent: false });
  }

  function runCombination() {
    const current = findCombination();
    if (!current) { $("comboResults").hidden = true; return; }
    renderComboWarnings(current);
    renderComboProfile(current);
    quickComparison.render({
      players: current.profiles.map(player => ({ ...player, rows: comboProfileRows(current, player) })),
      summarize,
      metaSuffix: "Matching friendly/enemy team rules"
    });
    $("comboResults").hidden = false;
    setComboDisplay(state.comboDisplay);
  }

  function clear() {
    dateFilter.reset();
    state.groupController?.abort();
    state.selected.clear();
    state.rules = rules.emptyRules();
    persistRoster();
    state.result = "ALL";
    state.buy = "ALL";
    state.heroOnly = false;
    groupBuyFilter.set("ALL", { notify: false });
    state.opponentBuy = "ALL";
    groupEnemyBuyFilter.set("ALL", { notify: false });
    state.roundResult = "ALL";
    groupRoundResultFilter.set("ALL", { notify: false });
    state.roundPhase = "ALL";
    groupRoundPhaseFilter.set("ALL", { notify: false });
    state.comboDisplay = "profile"; state.graphPlayers = null;
    quickComparison.reset();
    comboResultFilter.set("ALL", { notify: false });
    invalidateGroupResults();
    playerSearch.reset();
    renderSelectedRoster();
  }

  const playerSearch = window.NickStatsPlayerSearchUI.create({ prefix: "group", limit: 20, onSelect: addPlayer,
    excluded: id => state.selected.has(id), initialMessage: "" });
  ui.comboMatchesPagination = window.NickStatsShellUI.pagination("comboMatchesPagination", () => { state.matchListOffset -= MATCH_LIST_LIMIT; runCombination(); }, () => { state.matchListOffset += MATCH_LIST_LIMIT; runCombination(); });

  ui.groupBuildButton = window.NickStatsShellUI.button("groupBuildButton", () => buildGroup());
  ui.groupClearButton = window.NickStatsShellUI.button("groupClearButton", clear);
  const profileSectionTabs = window.NickStatsSectionTabsUI.create("comboDetailTabsApp", { kind: "combo", onChange: setComboProfileView });
  const comboResultFilter = window.NickStatsSegmentedUI.create("comboResultFilter", { onChange: result => { state.result = result; runCombination(); } });
  const groupSideFilter = window.NickStatsSegmentedUI.create("groupSideFilter", { onChange: side => { state.side = side; runCombination(); } });
  const groupBuyFilter = window.NickStatsSegmentedUI.create("groupBuyFilter", { onChange: buy => { state.buy = buy; state.heroOnly = buy === "hero"; runCombination(); } });
  const groupEnemyBuyFilter = window.NickStatsSegmentedUI.create("groupEnemyBuyFilter", { onChange: opponentBuy => { state.opponentBuy = opponentBuy; runCombination(); } });
  const groupRoundResultFilter = window.NickStatsSegmentedUI.create("groupRoundResultFilter", { onChange: roundResult => { state.roundResult = roundResult; runCombination(); } });
  const groupRoundPhaseFilter = window.NickStatsSegmentedUI.create("groupRoundPhaseFilter", { onChange: phase => { state.roundPhase = phase; runCombination(); } });
  ui.groupResetFilters = window.NickStatsShellUI.button("groupResetFilters", () => {
    window.NickStatsFilters.resetProfileFilters({ state, mapFilter, dateFilter, tagFilter: manualFilter,
      toggles: [groupSideFilter, groupBuyFilter, groupEnemyBuyFilter, groupRoundResultFilter, groupRoundPhaseFilter, comboResultFilter],
      onReset: () => { if (state.players.length) runCombination(); } });
  });
  renderSelectedRoster();
  // Restore the editor only. Fetch histories when Build profiles is clicked.
})();
