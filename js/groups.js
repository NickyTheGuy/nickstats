(() => {
  "use strict";

  const PLAYER_ENDPOINT = "/nickstats/api/players";
  const GROUP_DATA_ENDPOINT = "/nickstats/api/groups";
  const MAX_GROUP = 10;
  const MAX_INCLUDED = 5;
  const GROUP_SELECTION_KEY = "nickstats.groupSelection.v1";
  const $ = id => document.getElementById(id);
  const availability = window.NickStatsAvailability;
  function readSavedRoster() {
    try {
      const rows = JSON.parse(localStorage.getItem(GROUP_SELECTION_KEY) || "[]");
      if (!Array.isArray(rows)) return [];
      const roster = [], seen = new Set();
      let included = 0;
      for (const row of rows) {
        if (!row || row.id == null || seen.has(String(row.id)) || roster.length >= MAX_GROUP) continue;
        const id = String(row.id), requestedChoice = row.choice === "exclude" ? "exclude" : "include";
        const choice = requestedChoice === "include" && included >= MAX_INCLUDED ? "exclude" : requestedChoice;
        if (choice === "include") included += 1;
        seen.add(id);
        roster.push({ player: { id, name: row.name || "Unknown player", steam_id: row.steam_id || "", match_count: Number(row.match_count) || 0 }, choice });
      }
      return roster;
    } catch (_) { return []; }
  }
  const savedRoster = readSavedRoster();
  const state = {
    selected: new Map(savedRoster.map(({ player }) => [String(player.id), player])), players: [],
    choices: new Map(savedRoster.map(({ player, choice }) => [String(player.id), choice])),
    searchController: null, groupController: null, searchTimer: null,
    side: "ALL", buy: "ALL", heroOnly: false, opponentBuy: "ALL", roundResult: "ALL", roundPhase: "ALL", result: "ALL",
    comboPlayerId: "", comboCondition: "without", comboView: "overview", comboDisplay: "profile"
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

  function el(tag, text, className) {
    const element = document.createElement(tag);
    if (text != null) element.textContent = text;
    if (className) element.className = className;
    return element;
  }

  function setStatus(message, error = false) {
    $("groupStatus").textContent = message;
    $("groupStatus").classList.toggle("error", error);
  }

  function setSearchStatus(message, error = false) {
    $("groupSearchStatus").textContent = message;
    $("groupSearchStatus").classList.toggle("error", error);
  }

  function persistRoster() {
    const rows = [...state.selected.values()].map(player => ({
      id: String(player.id), name: player.name || "Unknown player", steam_id: player.steam_id || "",
      match_count: num(player.match_count), choice: state.choices.get(String(player.id)) === "exclude" ? "exclude" : "include"
    }));
    try {
      if (rows.length) localStorage.setItem(GROUP_SELECTION_KEY, JSON.stringify(rows));
      else localStorage.removeItem(GROUP_SELECTION_KEY);
    } catch (_) {}
  }

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
        ? rowOpponentBuy === state.opponentBuy && (state.buy === "ALL" || side.buy_type === state.buy) &&
          (state.roundResult === "ALL" || side.round_result === state.roundResult)
        : rowOpponentBuy === "ALL" &&
          (state.buy === "ALL" ? (side.buy_type || "ALL") === "ALL" : side.buy_type === state.buy) &&
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

  function populateMaps() {
    const names = []; state.players.forEach(player => player.rows.forEach(row => { if (row.map) names.push(row.map); }));
    mapFilter.setOptions(names, { reset: true });
  }


  function renderSearchResults(players) {
    const results = $("groupSearchResults");
    results.replaceChildren();
    for (const player of players.filter(candidate => !state.selected.has(String(candidate.id)))) {
      const button = el("button", null, "group-search-result");
      button.type = "button";
      const identity = el("span", null, "group-result-identity");
      identity.append(el("strong", player.name), el("small", `${player.match_count} matches · ${player.steam_id}`));
      button.append(identity, el("span", "+ Add", "group-result-add"));
      button.addEventListener("click", () => addPlayer(player));
      results.appendChild(button);
    }
  }

  async function searchPlayers() {
    const query = $("groupSearchInput").value.trim();
    if (!query) return;
    state.searchController?.abort();
    state.searchController = new AbortController();
    setSearchStatus("Searching players…");
    try {
      const parameters = new URLSearchParams({ q: query, limit: "20", offset: "0" });
      const payload = await apiJson(await fetch(`${PLAYER_ENDPOINT}?${parameters}`, {
        headers: { Accept: "application/json" }, signal: state.searchController.signal
      }));
      const players = Array.isArray(payload.players) ? payload.players : [];
      renderSearchResults(players);
      setSearchStatus(players.length ? `${players.length} player${players.length === 1 ? "" : "s"} found.` : "No players matched that search.");
    } catch (error) {
      if (error.name === "AbortError") return;
      setSearchStatus(`Could not search players: ${error.message}`, true);
    }
  }

  function addPlayer(player) {
    if (state.selected.size >= MAX_GROUP) {
      setSearchStatus(`A group is limited to ${MAX_GROUP} players.`, true);
      return;
    }
    state.selected.set(String(player.id), player);
    if (!state.choices.has(String(player.id))) {
      const included = [...state.choices.values()].filter(choice => choice === "include").length;
      state.choices.set(String(player.id), included < MAX_INCLUDED ? "include" : "exclude");
    }
    $("groupSearchInput").value = "";
    $("groupSearchResults").replaceChildren();
    setSearchStatus("Search for another player, or build the current selection.");
    persistRoster();
    invalidateGroupResults();
    renderSelectedRoster();
  }

  function removePlayer(id) {
    state.selected.delete(String(id));
    state.choices.delete(String(id));
    persistRoster();
    invalidateGroupResults();
    renderSelectedRoster();
  }

  function invalidateGroupResults() {
    state.players = [];
    $("groupResults").hidden = true;
  }

  function setRosterChoice(id, choice) {
    const current = state.choices.get(String(id));
    const included = [...state.choices.values()].filter(value => value === "include").length;
    if (choice === "include" && current !== "include" && included >= MAX_INCLUDED) {
      setStatus(`A team can have at most ${MAX_INCLUDED} Included players.`, true);
      return;
    }
    state.choices.set(String(id), choice);
    persistRoster();
    invalidateGroupResults();
    renderSelectedRoster();
  }

  function renderSelectedRoster() {
    const roster = $("groupSelectedRoster");
    roster.replaceChildren();
    for (const player of state.selected.values()) {
      const choice = state.choices.get(String(player.id)) || "include";
      const chip = el("div", null, `group-selected-player is-${choice}`);
      const identity = el("span", null);
      identity.append(el("strong", player.name), el("small", `${player.match_count} matches`));
      const remove = el("button", "×", "group-player-remove");
      remove.type = "button";
      remove.setAttribute("aria-label", `Remove ${player.name}`);
      remove.title = `Remove ${player.name}`;
      remove.addEventListener("click", () => removePlayer(player.id));
      chip.append(remove, identity);
      const roles = el("div", null, "group-roster-role");
      roles.setAttribute("role", "group"); roles.setAttribute("aria-label", `Include or exclude ${player.name}`);
      [["include", "Include"], ["exclude", "Exclude"]].forEach(([value, label]) => {
        const button = el("button", label); button.type = "button";
        button.dataset.choice = value;
        const active = choice === value;
        button.classList.toggle("active", active); button.setAttribute("aria-pressed", String(active));
        button.addEventListener("click", () => setRosterChoice(player.id, value)); roles.appendChild(button);
      });
      chip.appendChild(roles);
      roster.appendChild(chip);
    }
    const count = state.selected.size;
    const included = [...state.choices.entries()].filter(([id, choice]) => state.selected.has(id) && choice === "include").length;
    $("groupBuildButton").disabled = count < 2 || included === 0;
    $("groupClearButton").disabled = count === 0;
    setStatus(count < 2 ? "Choose at least two players." : !included ? "Choose at least one Included player." : `${included} included · ${count - included} excluded. Ready to build.`);
  }

  async function buildGroup() {
    if (state.selected.size < 2) return;
    state.groupController?.abort();
    state.groupController = new AbortController();
    $("groupBuildButton").disabled = true;
    setStatus("Loading stored matches and building group profiles…");
    try {
      const parameters = new URLSearchParams({ players: [...state.selected.keys()].join(",") });
      const payload = await apiJson(await fetch(`${GROUP_DATA_ENDPOINT}?${parameters}`, {
        headers: { Accept: "application/json" }, signal: state.groupController.signal
      }));
      state.players = (payload.players || []).map(normalizePlayer).sort((a, b) => a.label.localeCompare(b.label));
      populateMaps();
      state.players.forEach(player => { if (!state.choices.has(player.profileId)) state.choices.set(player.profileId, "include"); });
      $("groupResults").hidden = false;
      runCombination();
      setStatus(`Built ${selectedPlayers("include").length} conditional player profile${selectedPlayers("include").length === 1 ? "" : "s"}.`);
    } catch (error) {
      if (error.name !== "AbortError") setStatus(`Could not build group profiles: ${error.message}`, true);
    } finally {
      const included = [...state.choices.entries()].filter(([id, choice]) => state.selected.has(id) && choice === "include").length;
      $("groupBuildButton").disabled = state.selected.size < 2 || included === 0;
    }
  }

  function choiceFor(player) {
    return state.choices.get(player.profileId) || "include";
  }

  function selectedPlayers(choice) {
    return state.players.filter(player => choiceFor(player) === choice);
  }

  function findCombination() {
    const included = selectedPlayers("include");
    const excluded = selectedPlayers("exclude");
    if (!included.length) return null;
    const first = included[0];
    const eligible = player => player.rows.filter(row => mapFilter.matches(row.map) && dateFilter.matches(row.date));
    const rowMaps = new Map(included.map(player => [player.profileId, new Map(eligible(player).map(row => [row.id, row]))]));
    const baseMatches = eligible(first).filter(row => included.every(player =>
      player.profileId === first.profileId || row.teammateIds.includes(player.profileId)
    )).map(firstRow => ({
      id: firstRow.id,
      rows: included.map(player => ({ player, row: rowMaps.get(player.profileId).get(firstRow.id) })).filter(item => item.row)
    })).filter(match => match.rows.length === included.length);
    const isPresent = (match, player) => match.rows[0].row.teammateIds.includes(player.profileId);
    const fullTeam = included.length === MAX_INCLUDED;
    const comparisonPossible = excluded.length > 0 && included.length + excluded.length <= MAX_INCLUDED;
    const matches = (fullTeam ? baseMatches : baseMatches.filter(match => excluded.every(player => !isPresent(match, player))))
      .sort((a, b) => b.rows[0].row.date - a.rows[0].row.date || num(b.id) - num(a.id));
    const comparisonMatches = comparisonPossible
      ? baseMatches.filter(match => excluded.every(player => isPresent(match, player)))
          .sort((a, b) => b.rows[0].row.date - a.rows[0].row.date || num(b.id) - num(a.id))
      : [];
    const partialMatches = !fullTeam && excluded.length > 1 ? baseMatches.filter(match => {
      const present = excluded.filter(player => isPresent(match, player)).length;
      return present > 0 && present < excluded.length;
    }) : [];
    return { included, excluded, baseMatches, matches, comparisonMatches, partialMatches, fullTeam, comparisonPossible };
  }

  function renderComboWarnings(current) {
    const warnings = $("comboWarnings");
    warnings.replaceChildren();
    const add = message => warnings.appendChild(el("div", message, "warning"));
    if (current.fullTeam && current.excluded.length) add("Five Included players already fill the team, so Excluded players cannot be added.");
    else if (current.excluded.length && !current.comparisonPossible) add(`The ${current.included.length + current.excluded.length}-player “With” roster cannot fit on one team.`);
    if (current.partialMatches.length) add(`${current.partialMatches.length} match${current.partialMatches.length === 1 ? " contains" : "es contain"} only some Excluded players and ${current.partialMatches.length === 1 ? "is" : "are"} omitted from both groups.`);
  }

  function comboMatchesForCondition(current) {
    return state.comboCondition === "with" ? current.comparisonMatches : current.matches;
  }

  function comboProfileRows(current, player) {
    return comboMatchesForCondition(current)
      .map(match => match.rows.find(item => item.player.profileId === player.profileId)?.row)
      .filter(row => row && matchResultMatches(row.result, state.result));
  }

  const { integer, decimal, percent, ratio, titleCase } = window.NickStatsProfile;
  const { bindSegmentedToggle, matchResultMatches, resultFilterLabel, scoreBreakdown } = window.NickStatsFilters;
  const mapFilter = new window.NickStatsFilters.MultiMapFilter("groupMapFilter", { onChange: () => runCombination(), formatLabel: value => titleCase(value.replace(/^de_/, "")) });
  const dateFilter = new window.NickStatsFilters.DateRangeFilter("groupDateFilter", { onChange: () => runCombination() });
  const quickComparison = window.NickStatsQuickComparison.create({ prefix: "combo" });

  function setComboProfileView(view) {
    state.comboView = view;
    document.querySelectorAll("[data-combo-profile-view]").forEach(button => {
      const active = button.dataset.comboProfileView === view;
      button.classList.toggle("active", active); button.setAttribute("aria-selected", String(active)); button.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll("[data-combo-profile-panel]").forEach(panel => { panel.hidden = panel.dataset.comboProfilePanel !== view; });
  }

  function setComboDisplay(display) {
    state.comboDisplay = display === "quick" ? "quick" : "profile";
    document.querySelectorAll("[data-combo-player-id], [data-combo-display]").forEach(button => {
      const active = button.dataset.comboDisplay === "quick"
        ? state.comboDisplay === "quick"
        : state.comboDisplay === "profile" && button.dataset.comboPlayerId === state.comboPlayerId;
      button.closest(".player-open-tab")?.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll("[data-combo-display-panel]").forEach(panel => {
      panel.hidden = panel.dataset.comboDisplayPanel !== state.comboDisplay;
    });
  }

  function renderComboProfile(current) {
    if (!current.included.some(player => player.profileId === state.comboPlayerId)) state.comboPlayerId = current.included[0].profileId;
    const canCompare = current.excluded.length > 0 && current.comparisonPossible;
    if (state.comboCondition === "with" && !canCompare) state.comboCondition = "without";
    document.querySelectorAll("[data-combo-condition]").forEach(button => {
      const active = button.dataset.comboCondition === state.comboCondition;
      button.classList.toggle("active", active); button.setAttribute("aria-pressed", String(active));
      button.disabled = button.dataset.comboCondition === "with" && !canCompare;
    });

    const profileTabs = $("comboProfilePlayers"); profileTabs.replaceChildren();
    const quickActive = state.comboDisplay === "quick";
    const quickItem = el("div", "", `player-open-tab single${quickActive ? " active" : ""}`);
    const quickButton = el("button", "Quick comparison", "player-open-tab-label");
    quickButton.type = "button"; quickButton.setAttribute("role", "tab"); quickButton.dataset.comboDisplay = "quick";
    quickButton.setAttribute("aria-selected", String(quickActive)); quickButton.tabIndex = quickActive ? 0 : -1;
    quickButton.addEventListener("click", () => setComboDisplay("quick"));
    quickItem.appendChild(quickButton); profileTabs.appendChild(quickItem);
    current.included.forEach(player => {
      const active = state.comboDisplay === "profile" && player.profileId === state.comboPlayerId;
      const item = el("div", "", `player-open-tab single${active ? " active" : ""}`);
      const button = el("button", player.label, "player-open-tab-label");
      button.type = "button"; button.setAttribute("role", "tab"); button.dataset.comboPlayerId = player.profileId;
      button.setAttribute("aria-selected", String(active)); button.tabIndex = active ? 0 : -1;
      button.addEventListener("click", () => { state.comboPlayerId = player.profileId; renderComboProfile(current); setComboDisplay("profile"); });
      item.appendChild(button); profileTabs.appendChild(item);
    });
    const player = current.included.find(item => item.profileId === state.comboPlayerId);
    const rows = comboProfileRows(current, player), stats = summarize(rows);
    const sideLabel = state.side === "ALL" ? "All sides" : state.side;
    $("comboProfileTitle").textContent = player.label;
    const buyLabel = state.buy === "ALL" ? "All buys" : `${titleCase(state.buy)} buys${state.heroOnly ? " · Hero only" : ""}`;
    const opponentBuyLabel = state.opponentBuy === "ALL" ? "All enemy buys" : `vs ${titleCase(state.opponentBuy)}`;
    const roundLabel = state.roundResult === "ALL" ? "All rounds" : state.roundResult === "win" ? "Rounds won" : "Rounds lost";
    $("comboProfileMeta").textContent = `Steam ${player.steamId || "unknown"} · ${integer(stats.n)} qualifying match${stats.n === 1 ? "" : "es"} · ${sideLabel} · ${buyLabel} · ${opponentBuyLabel} · ${roundLabel} · ${state.roundPhase === "ALL" ? "All phases" : state.roundPhase === "REGULATION" ? "Regulation" : "Overtime"} · ${resultFilterLabel(state.result)}${mapFilter.size ? ` · ${mapFilter.summary()}` : ""}${dateFilter.active ? ` · ${dateFilter.summary()}` : ""}`;
    const maps = new Map(); rows.forEach(row => { const collection = maps.get(row.map) || []; collection.push(row); maps.set(row.map, collection); });
    const normalize = source => ({ stats: source, weapons: source.weapons, matches: source.n, wins: source.wins, losses: source.losses, draws: source.ties, rating: source.rating, kd: source.kd, adr: source.adr, kast: source.kast, winRate: source.winRate, winRateKind: source.winRateKind, scores: source.scores });
    const mapRows = [...maps.entries()].map(([name, mapMatches]) => ({ name, summary: normalize(summarize(mapMatches)) })).sort((a, b) => b.summary.matches - a.summary.matches || a.name.localeCompare(b.name));
    window.NickStatsProfile.render({ prefix: "combo", headlineId: "comboProfileHeadline", summary: normalize(stats), side: state.side, result: state.result, roundResult: state.roundResult, maps: mapRows });
    window.NickStatsGraphs.render({ prefix: "combo", series: current.included.map(candidate => ({ label: candidate.label, samples: window.NickStatsGraphs.samplesForMatches(comboProfileRows(current, candidate), state.side, state.buy, state.roundResult, state.opponentBuy, state.roundPhase, state.heroOnly) })) });
    setComboProfileView(state.comboView);
  }

  function runCombination() {
    const current = findCombination();
    if (!current) return;
    renderComboWarnings(current);
    renderComboProfile(current);
    quickComparison.render({
      players: current.included.map(player => ({ ...player, rows: comboProfileRows(current, player) })),
      summarize,
      metaSuffix: state.comboCondition === "with" ? "With excluded players" : "Without excluded players"
    });
    $("comboResults").hidden = false;
    setComboDisplay(state.comboDisplay);
  }

  function clear() {
    dateFilter.reset();
    state.searchController?.abort();
    state.groupController?.abort();
    state.selected.clear();
    state.choices.clear();
    persistRoster();
    state.result = "ALL";
    state.buy = "ALL";
    state.heroOnly = false;
    $("groupHeroControl").hidden = true;
    $("groupHeroOnly").checked = false;
    state.opponentBuy = "ALL";
    state.roundResult = "ALL";
    state.roundPhase = "ALL";
    groupRoundPhaseFilter.set("ALL", { notify: false });
    state.comboDisplay = "profile";
    quickComparison.reset();
    comboResultFilter.set("ALL", { notify: false });
    invalidateGroupResults();
    $("groupSearchInput").value = "";
    $("groupSearchResults").replaceChildren();
    setSearchStatus("Search and add at least two players.");
    renderSelectedRoster();
  }

  $("groupSearchForm").addEventListener("submit", event => { event.preventDefault(); clearTimeout(state.searchTimer); searchPlayers(); });
  $("groupSearchInput").addEventListener("input", event => {
    clearTimeout(state.searchTimer);
    const query = event.target.value.trim();
    if (!query) { $("groupSearchResults").replaceChildren(); return; }
    if (query.length >= 2) state.searchTimer = setTimeout(searchPlayers, 250);
  });
  $("groupBuildButton").addEventListener("click", buildGroup);
  $("groupClearButton").addEventListener("click", clear);
  document.querySelectorAll("[data-combo-profile-view]").forEach(button => button.addEventListener("click", () => setComboProfileView(button.dataset.comboProfileView)));
  const comboResultFilter = bindSegmentedToggle({ selector: "[data-combo-result]", valueFor: button => button.dataset.comboResult, onChange: result => { state.result = result; runCombination(); } });
  document.querySelectorAll("[data-combo-condition]").forEach(button => button.addEventListener("click", () => {
    if (button.disabled) return;
    state.comboCondition = button.dataset.comboCondition; runCombination();
  }));
  window.NickStatsFilters.bindSideToggle({ selector: "[data-group-side]", valueFor: button => button.dataset.groupSide, onChange: side => { state.side = side; runCombination(); } });
  window.NickStatsFilters.bindSegmentedToggle({ selector: "[data-group-buy]", valueFor: button => button.dataset.groupBuy, onChange: buy => { state.buy = buy; if (buy !== "eco" && buy !== "force") state.heroOnly = false; $("groupHeroControl").hidden = buy !== "eco" && buy !== "force"; $("groupHeroOnly").checked = state.heroOnly; runCombination(); } });
  $("groupHeroOnly").addEventListener("change", event => { state.heroOnly = event.target.checked; runCombination(); });
  window.NickStatsFilters.bindSegmentedToggle({ selector: "[data-group-enemy-buy]", valueFor: button => button.dataset.groupEnemyBuy, onChange: opponentBuy => { state.opponentBuy = opponentBuy; runCombination(); } });
  window.NickStatsFilters.bindSegmentedToggle({ selector: "[data-group-round-result]", valueFor: button => button.dataset.groupRoundResult, onChange: roundResult => { state.roundResult = roundResult; runCombination(); } });
  const groupRoundPhaseFilter = window.NickStatsFilters.bindSegmentedToggle({ selector: "[data-group-round-phase]", valueFor: button => button.dataset.groupRoundPhase, onChange: phase => { state.roundPhase = phase; runCombination(); } });
  renderSelectedRoster();
})();
