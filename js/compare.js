(() => {
  "use strict";

  const PLAYER_ENDPOINT = "/nickstats/api/players";
  const COMPARE_ENDPOINT = "/nickstats/api/compare";
  const MAX_GROUP = 10;
  const MAX_INCLUDED = 5;
  const scoring = {
    winRateWeight: 0.8, ratingWeight: 0.2,
    winRateScale: 10, ratingScale: 0.10,
    shrinkage: 10, lifterThreshold: 0.25, draggerThreshold: -0.25
  };
  const $ = id => document.getElementById(id);
  const state = {
    selected: new Map(), players: [], choices: new Map(), analysis: null,
    searchController: null, compareController: null, searchTimer: null,
    side: "ALL", metricGroup: "core", weapon: "",
    comboPlayerId: "", comboCondition: "without", comboView: "overview",
    workspace: location.hash === "#matrix" ? "matrix" : "compare"
  };

  const metricGroups = {
    core: [["Win rate", "winRate", "percent"], ["Rating", "rating", "rating"], ["K/D", "kd", "ratio"], ["ADR", "adr", "decimal"], ["KAST", "kast", "percent"], ["K/R", "kpr", "ratio"], ["D/R", "dpr", "ratio", false], ["A/R", "apr", "ratio"], ["HS%", "hs", "percent"]],
    openings: [["Opening K", "opening_kills", "countRate"], ["Opening D", "opening_deaths", "countRate", false], ["Opening diff", "openingDiff", "signedRate"], ["Success", "openingSuccess", "percent"]],
    trades: [["Trade K", "trade_kills", "countRate"], ["Opportunities", "trade_opportunities", "countRate"], ["Attempts", "trade_attempts", "countRate"], ["Successes", "trade_successes", "countRate"], ["Attempt rate", "tradeAttemptRate", "percent"], ["Success rate", "tradeSuccessRate", "percent"], ["Tradeable D", "tradeable_deaths", "countRate", false], ["D attempted", "attempted_tradeable_deaths", "countRate"], ["D traded", "traded_deaths", "countRate"]],
    utility: [["Utility dmg", "utilityDamage", "damageRate"], ["UD/R", "udr", "decimal"], ["HE dmg", "he_damage", "damageRate"], ["Fire dmg", "fire_damage", "damageRate"], ["Flashed", "enemies_flashed", "countRate"], ["Blind sec", "blindSeconds", "secondsRate"], ["Flash assists", "flash_assists", "countRate"], ["Damage assists", "damage_assisted_kills", "countRate"], ["Teammate-flash K", "teammate_flash_assisted_kills", "countRate"], ["Own-flash K", "own_flash_kills", "countRate"]],
    context: [["Enemy blind", "blinded_kills", "countRate"], ["Player blind", "blind_kills", "countRate"], ["Wallbang kills", "wallbang_kills", "countRate"], ["Smoke kills", "smoke_kills", "countRate"], ["Airborne kills", "airborne_kills", "countRate"], ["Running kills", "running_kills", "countRate"], ["Enemy grenade out", "grenade_out_kills", "countRate"], ["Enemy knife out", "knife_out_kills", "countRate"], ["Paul kills", "equipment_disadvantage_kills", "countRate"], ["Bullshit kills", "unfair_kills", "countRate"]],
    contextDeaths: [["Player blind", "deaths_while_blind", "countRate", false], ["Enemy blind", "deaths_to_blind_killer", "countRate", false], ["Wallbang deaths", "wallbang_deaths", "countRate", false], ["Smoke deaths", "smoke_deaths", "countRate", false], ["Airborne enemy", "airborne_deaths", "countRate", false], ["Running enemy", "running_killer_deaths", "countRate", false], ["Player grenade out", "grenade_out_deaths", "countRate", false], ["Player knife out", "knife_out_deaths", "countRate", false], ["Paul deaths", "equipment_disadvantage_deaths", "countRate", false], ["Bullshit deaths", "unfair_deaths", "countRate", false]],
    rounds: [["Round wins", "round_wins", "countRate"], ["1v1 W/A", "clutch_1v1", "clutch1"], ["1v2 W/A", "clutch_1v2", "clutch2"], ["1v3 W/A", "clutch_1v3", "clutch3"], ["1v4 W/A", "clutch_1v4", "clutch4"], ["1v5 W/A", "clutch_1v5", "clutch5"], ["1K rounds", "kill_rounds_1k", "countRate"], ["2K rounds", "kill_rounds_2k", "countRate"], ["3K rounds", "kill_rounds_3k", "countRate"], ["4K rounds", "kill_rounds_4k", "countRate"], ["5K rounds", "kill_rounds_5k", "countRate"]],
    movement: [["Kill speed", "killSpeed", "decimal"], ["Kill speed %", "killSpeedPercent", "percent"], ["Peak kill speed", "kill_speed_max", "decimal"], ["Death speed", "deathSpeed", "decimal", false], ["Death speed %", "deathSpeedPercent", "percent", false], ["Peak death speed", "death_speed_max", "decimal", false], ["Moving K", "moving_kills", "countRate"], ["Still K", "still_kills", "countRate"], ["Running K", "running_kills", "countRate"]],
    weapons: [["Kills", "weaponKills", "countRate"], ["Damage", "weaponDamage", "damageRate"], ["Shots", "weaponShots", "countRate"], ["Rounds used", "weaponRounds", "countRate"]]
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

  function td(text, className) {
    return el("td", text, className);
  }

  function setStatus(message, error = false) {
    $("compareStatus").textContent = message;
    $("compareStatus").classList.toggle("error", error);
  }

  function setSearchStatus(message, error = false) {
    $("compareSearchStatus").textContent = message;
    $("compareSearchStatus").classList.toggle("error", error);
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
    const selected = (row.sideRows || []).filter(side => state.side === "ALL" || side.side === state.side);
    const stats = {}, weapons = new Map();
    selected.forEach(side => {
      mergeStats(stats, side.stats);
      (side.weapons || []).forEach(weapon => {
        const current = weapons.get(weapon.weapon) || { kills: 0, damage: 0, shots: 0, rounds_used: 0 };
        current.kills += num(weapon.kills); current.damage += num(weapon.damage); current.shots += num(weapon.shots); current.rounds_used += num(weapon.rounds_used); weapons.set(weapon.weapon, current);
      });
    });
    if (!selected.length && state.side === "ALL") mergeStats(stats, row.legacy);
    return { stats, weapons };
  }

  function normalizePlayer(player) {
    return {
      profileId: String(player.id),
      label: player.name || "Unknown player",
      steamId: player.steam_id,
      rows: (player.matches || []).map(match => ({
        id: String(match.id), date: num(match.played_at), map: match.map || "Unknown",
        result: ["w", "l", "n"].includes(match.result) ? match.result : "n",
        score: [match.score_for, match.score_against],
        teammateIds: (match.teammate_ids || []).map(String),
        sideRows: Array.isArray(match.sides) ? match.sides : [],
        legacy: { rounds: num(match.rounds), kills: num(match.kills), deaths: num(match.deaths), assists: num(match.assists), headshots: num(match.headshots), damage: num(match.damage), kast_rounds: num(match.kast_rounds) }
      }))
    };
  }

  function summarize(rows) {
    const n = rows.length;
    const stats = {}, weapons = new Map();
    rows.forEach(row => { const view = selectedView(row); mergeStats(stats, view.stats); view.weapons.forEach((weapon, name) => { const current = weapons.get(name) || { kills: 0, damage: 0, shots: 0, rounds_used: 0 }; Object.keys(current).forEach(key => current[key] += num(weapon[key])); weapons.set(name, current); }); });
    const kills = num(stats.kills), deaths = num(stats.deaths), assists = num(stats.assists);
    const rounds = num(stats.rounds), damage = num(stats.damage), kastRounds = num(stats.kast_rounds);
    const wins = rows.filter(row => row.result === "w").length;
    const losses = rows.filter(row => row.result === "l").length;
    const ties = rows.filter(row => row.result === "n").length;
    const aggregate = { rounds, kills, deaths, assists, damage, kast_rounds: kastRounds };
    const result = {
      ...stats,
      n, wins, losses, ties,
      winRate: state.side === "ALL" ? (n ? 100 * wins / n : 0) : (rounds ? 100 * num(stats.round_wins) / rounds : 0),
      kd: deaths ? kills / deaths : kills,
      avgK: n ? kills / n : 0,
      avgD: n ? deaths / n : 0,
      avgA: n ? assists / n : 0,
      avgHs: kills ? 100 * num(stats.headshots) / kills : 0,
      adr: rounds ? damage / rounds : 0,
      kast: rounds ? 100 * kastRounds / rounds : 0,
      rating: playerRating(aggregate), kpr: rounds ? kills / rounds : 0, dpr: rounds ? deaths / rounds : 0, apr: rounds ? assists / rounds : 0,
      hs: kills ? 100 * num(stats.headshots) / kills : 0,
      openingDiff: num(stats.opening_kills) - num(stats.opening_deaths), openingSuccess: 100 * num(stats.opening_kills) / Math.max(1, num(stats.opening_kills) + num(stats.opening_deaths)),
      tradeAttemptRate: 100 * num(stats.trade_attempts) / Math.max(1, num(stats.trade_opportunities)), tradeSuccessRate: 100 * num(stats.trade_successes) / Math.max(1, num(stats.trade_attempts)),
      utilityDamage: num(stats.he_damage) + num(stats.fire_damage), udr: rounds ? (num(stats.he_damage) + num(stats.fire_damage)) / rounds : 0,
      blindSeconds: num(stats.blind_duration_ms) / 1000, killSpeed: num(stats.kill_speed_total) / Math.max(1, num(stats.kill_speed_samples)),
      killSpeedPercent: num(stats.kill_speed_percent_total) / Math.max(1, num(stats.kill_speed_percent_samples)), deathSpeed: num(stats.death_speed_total) / Math.max(1, num(stats.death_speed_samples)),
      deathSpeedPercent: num(stats.death_speed_percent_total) / Math.max(1, num(stats.death_speed_percent_samples))
    };
    const weapon = weapons.get(state.weapon) || {};
    result.weaponKills = num(weapon.kills); result.weaponDamage = num(weapon.damage); result.weaponShots = num(weapon.shots); result.weaponRounds = num(weapon.rounds_used);
    result.weapons = [...weapons.entries()].map(([name, values]) => ({ weapon: name, ...values })).sort((a, b) => b.kills - a.kills || b.damage - a.damage);
    return result;
  }

  function signed(value, digits = 1, suffix = "") {
    const magnitude = Math.abs(num(value)).toFixed(digits);
    return `${value > 0 ? "+" : value < 0 ? "−" : ""}${magnitude}${suffix}`;
  }

  function metricFields() { return metricGroups[state.metricGroup] || metricGroups.core; }
  function formatMetric(value, type, stats = {}) {
    const perRound = digits => {
      const total = type === "signedRate" ? signed(value, 0) : Math.round(num(value)).toLocaleString();
      const rate = num(value) / Math.max(1, num(stats.rounds));
      return `${total} · ${type === "signedRate" && rate > 0 ? "+" : ""}${rate.toFixed(digits)}/R`;
    };
    if (type === "countRate" || type === "signedRate") return perRound(2);
    if (type.startsWith("clutch")) {
      const opponents = type.slice("clutch".length);
      const attempts = num(stats[`clutch_attempt_1v${opponents}`]);
      return `${Math.round(num(value))}/${Math.round(attempts)} · ${(100 * num(value) / Math.max(1, attempts)).toFixed(1)}%`;
    }
    if (type === "damageRate") return `${Math.round(num(value)).toLocaleString()} · ${(num(value) / Math.max(1, num(stats.rounds))).toFixed(1)}/R`;
    if (type === "secondsRate") return `${num(value).toFixed(1)}s · ${(num(value) / Math.max(1, num(stats.rounds))).toFixed(2)}s/R`;
    if (type === "percent") return `${num(value).toFixed(1)}%`;
    if (type === "rating") return num(value).toFixed(2);
    if (type === "ratio") return num(value).toFixed(2);
    if (type === "decimal") return num(value).toFixed(1);
    if (type === "signed") return signed(value, 0);
    return Math.round(num(value)).toLocaleString();
  }

  function classify(score) {
    return score >= scoring.lifterThreshold ? "Lifter" : score <= scoring.draggerThreshold ? "Dragger" : "Exister";
  }

  function pairImpact(target, actor) {
    const eligibleRows = target.rows.filter(row => mapFilter.matches(row.map));
    const withRows = eligibleRows.filter(row => row.teammateIds.includes(actor.profileId));
    const withoutRows = eligibleRows.filter(row => !row.teammateIds.includes(actor.profileId));
    const withStats = summarize(withRows), withoutStats = summarize(withoutRows);
    const delta = {
      winRate: withStats.winRate - withoutStats.winRate,
      rating: withStats.rating - withoutStats.rating
    };
    const effectiveN = withRows.length && withoutRows.length
      ? withRows.length * withoutRows.length / (withRows.length + withoutRows.length) : 0;
    const rawScore = scoring.winRateWeight * (delta.winRate / scoring.winRateScale) +
      scoring.ratingWeight * (delta.rating / scoring.ratingScale);
    const reliability = effectiveN / (effectiveN + scoring.shrinkage);
    const score = rawScore * reliability;
    return {
      target, actor, withN: withRows.length, withoutN: withoutRows.length,
      withStats, withoutStats, delta, effectiveN, score, classification: classify(score),
      confidence: Math.min(withRows.length, withoutRows.length) < 10 ? "Low" : effectiveN < 25 ? "Medium" : "High"
    };
  }

  function buildAnalysis(players) {
    const pairs = [];
    for (const target of players) {
      for (const actor of players) {
        if (target.profileId !== actor.profileId) pairs.push(pairImpact(target, actor));
      }
    }
    const overall = players.map(actor => {
      const effects = pairs.filter(pair => pair.actor.profileId === actor.profileId);
      const totalWeight = effects.reduce((sum, pair) => sum + pair.effectiveN, 0);
      const weighted = getter => totalWeight
        ? effects.reduce((sum, pair) => sum + getter(pair) * pair.effectiveN, 0) / totalWeight : 0;
      const score = weighted(pair => pair.score);
      return {
        player: actor, score, classification: classify(score),
        delta: { winRate: weighted(pair => pair.delta.winRate), rating: weighted(pair => pair.delta.rating) }
      };
    }).sort((left, right) => right.score - left.score);
    return { players, pairs, overall };
  }

  function populateWeapons() {
    const names = new Set();
    state.players.forEach(player => player.rows.forEach(row => row.sideRows.forEach(side => (side.weapons || []).forEach(weapon => names.add(weapon.weapon)))));
    const select = $("compareWeapon"), previous = state.weapon;
    select.replaceChildren(...[...names].sort().map(name => { const option = el("option", name.replace(/^weapon_/, "").replaceAll("_", " ")); option.value = name; return option; }));
    state.weapon = names.has(previous) ? previous : ([...names].sort()[0] || ""); select.value = state.weapon;
  }

  function populateMaps() {
    const names = []; state.players.forEach(player => player.rows.forEach(row => { if (row.map) names.push(row.map); }));
    mapFilter.setOptions(names, { reset: true });
  }

  function refreshAnalysis() {
    if (!state.players.length) return;
    state.analysis = buildAnalysis(state.players);
    renderVerdicts(state.analysis.overall); renderMatrix(state.analysis); renderPairDetails(state.analysis.pairs);
    if (!$("comboResults").hidden) runCombination();
  }

  function renderVerdicts(overall) {
    const grid = $("compareVerdicts");
    grid.replaceChildren();
    for (const item of overall) {
      const kind = item.classification.toLowerCase();
      const card = el("article", null, `verdict-card ${kind}`);
      const top = el("div", null, "verdict-top");
      top.append(el("div", item.player.label, "player-name"), el("span", item.classification, `badge ${kind}`));
      const alias = el("div", `${item.player.rows.length} recorded matches`, "alias");
      const deltas = el("div", null, "delta-row");
      const win = el("div", null, "delta");
      win.append(el("strong", signed(item.delta.winRate, 1, " pp"), item.delta.winRate > 0 ? "positive" : item.delta.winRate < 0 ? "negative" : "neutral"), el("span", state.side === "ALL" ? "Teammate match win rate" : `Teammate ${state.side} round win rate`));
      const rating = el("div", null, "delta");
      rating.append(el("strong", signed(item.delta.rating, 3), item.delta.rating > 0 ? "positive" : item.delta.rating < 0 ? "negative" : "neutral"), el("span", "Teammate rating"));
      deltas.append(win, rating);
      card.append(top, alias, deltas);
      grid.appendChild(card);
    }
  }

  function renderMatrix(analysis) {
    const pairMap = new Map(analysis.pairs.map(pair => [`${pair.target.profileId}:${pair.actor.profileId}`, pair]));
    const header = document.createElement("tr");
    header.appendChild(el("th", "Measured ↓ / Present →"));
    analysis.players.forEach(player => header.appendChild(el("th", player.label)));
    $("compareMatrixHead").replaceChildren(header);
    const body = $("compareMatrixBody");
    body.replaceChildren();
    for (const target of analysis.players) {
      const row = document.createElement("tr");
      row.appendChild(el("td", target.label));
      for (const actor of analysis.players) {
        const cell = document.createElement("td");
        if (target.profileId === actor.profileId) {
          cell.appendChild(el("span", "—", "diagonal"));
        } else {
          const pair = pairMap.get(`${target.profileId}:${actor.profileId}`);
          const kind = pair.classification.toLowerCase();
          const box = el("div", null, `matrix-cell ${kind}`);
          box.append(el("strong", pair.classification), el("small", `${signed(pair.delta.winRate, 1, "pp")} · ${signed(pair.delta.rating, 2, "R")}`));
          box.title = `${target.label} with ${actor.label}: ${pair.withN} matches; without: ${pair.withoutN}; ${pair.confidence.toLowerCase()} confidence.`;
          cell.appendChild(box);
        }
        row.appendChild(cell);
      }
      body.appendChild(row);
    }
  }

  function renderPairDetails(pairs) {
    const header = document.createElement("tr");
    ["Measured player", "Player present", "Group", "Sample", ...metricFields().map(field => field[0]), "Confidence"].forEach(label => header.appendChild(el("th", label)));
    $("compareDetailsHead").replaceChildren(header);
    const body = $("compareDetailsBody");
    body.replaceChildren();
    for (const pair of pairs) {
      [["With", pair.withN, pair.withStats], ["Without", pair.withoutN, pair.withoutStats]].forEach(([label, sample, stats], index) => {
        const row = document.createElement("tr");
        if (!index) { const target = td(pair.target.label); target.rowSpan = 2; row.appendChild(target); const actor = td(pair.actor.label); actor.rowSpan = 2; row.appendChild(actor); }
        row.append(td(label), td(sample));
        metricFields().forEach(([, key, type]) => row.appendChild(td(formatMetric(stats[key], type, stats))));
        if (!index) { const confidence = td(pair.confidence); confidence.rowSpan = 2; row.appendChild(confidence); }
        body.appendChild(row);
      });
    }
  }

  function renderSearchResults(players) {
    const results = $("compareSearchResults");
    results.replaceChildren();
    for (const player of players.filter(candidate => !state.selected.has(String(candidate.id)))) {
      const button = el("button", null, "compare-search-result");
      button.type = "button";
      const identity = el("span", null, "compare-result-identity");
      identity.append(el("strong", player.name), el("small", `${player.match_count} matches · ${player.steam_id}`));
      button.append(identity, el("span", "+ Add", "compare-result-add"));
      button.addEventListener("click", () => addPlayer(player));
      results.appendChild(button);
    }
  }

  async function searchPlayers() {
    const query = $("compareSearchInput").value.trim();
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
      setSearchStatus(`A comparison group is limited to ${MAX_GROUP} players.`, true);
      return;
    }
    state.selected.set(String(player.id), player);
    if (!state.choices.has(String(player.id))) {
      const included = [...state.choices.values()].filter(choice => choice === "include").length;
      state.choices.set(String(player.id), included < MAX_INCLUDED ? "include" : "exclude");
    }
    $("compareSearchInput").value = "";
    $("compareSearchResults").replaceChildren();
    setSearchStatus("Search for another player, or build the current selection.");
    invalidateAnalysis();
    renderSelectedRoster();
  }

  function removePlayer(id) {
    state.selected.delete(String(id));
    state.choices.delete(String(id));
    invalidateAnalysis();
    renderSelectedRoster();
  }

  function invalidateAnalysis() {
    state.players = [];
    state.analysis = null;
    $("compareResults").hidden = true;
  }

  function setRosterChoice(id, choice) {
    const current = state.choices.get(String(id));
    const included = [...state.choices.values()].filter(value => value === "include").length;
    if (choice === "include" && current !== "include" && included >= MAX_INCLUDED) {
      setStatus(`A team can have at most ${MAX_INCLUDED} Included players.`, true);
      return;
    }
    state.choices.set(String(id), choice);
    invalidateAnalysis();
    renderSelectedRoster();
  }

  function renderSelectedRoster() {
    const roster = $("compareSelectedRoster");
    roster.replaceChildren();
    for (const player of state.selected.values()) {
      const choice = state.choices.get(String(player.id)) || "include";
      const chip = el("div", null, `compare-selected-player${state.workspace === "compare" ? ` is-${choice}` : ""}`);
      const identity = el("span", null);
      identity.append(el("strong", player.name), el("small", `${player.match_count} matches`));
      const remove = el("button", "×", "compare-player-remove");
      remove.type = "button";
      remove.setAttribute("aria-label", `Remove ${player.name}`);
      remove.title = `Remove ${player.name}`;
      remove.addEventListener("click", () => removePlayer(player.id));
      chip.append(remove, identity);
      if (state.workspace === "compare") {
        const roles = el("div", null, "compare-roster-role");
        roles.setAttribute("role", "group"); roles.setAttribute("aria-label", `Include or exclude ${player.name}`);
        [["include", "Include"], ["exclude", "Exclude"]].forEach(([value, label]) => {
          const button = el("button", label); button.type = "button";
          button.dataset.choice = value;
          const active = choice === value;
          button.classList.toggle("active", active); button.setAttribute("aria-pressed", String(active));
          button.addEventListener("click", () => setRosterChoice(player.id, value)); roles.appendChild(button);
        });
        chip.appendChild(roles);
      }
      roster.appendChild(chip);
    }
    const count = state.selected.size;
    const included = [...state.choices.entries()].filter(([id, choice]) => state.selected.has(id) && choice === "include").length;
    $("compareAnalyzeButton").disabled = count < 2 || (state.workspace === "compare" && included === 0);
    $("compareClearButton").disabled = count === 0;
    setStatus(count < 2 ? "Choose at least two players." : state.workspace === "matrix" ? `${count} players selected. Ready to build.` : !included ? "Choose at least one Included player." : `${included} included · ${count - included} excluded. Ready to build.`);
  }

  async function analyze() {
    if (state.selected.size < 2) return;
    state.compareController?.abort();
    state.compareController = new AbortController();
    $("compareAnalyzeButton").disabled = true;
    setStatus("Loading stored matches and comparing every pair…");
    try {
      const parameters = new URLSearchParams({ players: [...state.selected.keys()].join(",") });
      const payload = await apiJson(await fetch(`${COMPARE_ENDPOINT}?${parameters}`, {
        headers: { Accept: "application/json" }, signal: state.compareController.signal
      }));
      state.players = (payload.players || []).map(normalizePlayer).sort((a, b) => a.label.localeCompare(b.label));
      populateWeapons(); populateMaps(); state.analysis = buildAnalysis(state.players);
      state.players.forEach(player => { if (!state.choices.has(player.profileId)) state.choices.set(player.profileId, "include"); });
      renderVerdicts(state.analysis.overall);
      renderMatrix(state.analysis);
      renderPairDetails(state.analysis.pairs);
      $("compareResults").hidden = false;
      setWorkspace(state.workspace);
      setStatus(state.workspace === "matrix" ? `Built a matrix for ${state.players.length} players.` : `Built ${selectedPlayers("include").length} conditional player profile${selectedPlayers("include").length === 1 ? "" : "s"}.`);
    } catch (error) {
      if (error.name !== "AbortError") setStatus(`Could not compare players: ${error.message}`, true);
    } finally {
      const included = [...state.choices.entries()].filter(([id, choice]) => state.selected.has(id) && choice === "include").length;
      $("compareAnalyzeButton").disabled = state.selected.size < 2 || (state.workspace === "compare" && included === 0);
    }
  }

  function setCompareMode(mode) {
    document.querySelectorAll("[data-compare-mode]").forEach(button => {
      button.setAttribute("aria-selected", String(button.dataset.compareMode === mode));
    });
    document.querySelectorAll("[data-compare-view]").forEach(view => {
      view.hidden = view.dataset.compareView !== mode;
    });
  }

  function setWorkspace(page) {
    state.workspace = page === "matrix" ? "matrix" : "compare";
    const matrix = state.workspace === "matrix";
    $("compareBuilderEyebrow").textContent = matrix ? "Group analysis" : "Conditional profiles";
    $("compareBuilderTitle").textContent = matrix ? "Build a matrix group" : "Build a player profile";
    $("compareBuilderDescription").textContent = matrix
      ? "Add the players whose teammate impact you want to compare."
      : "Add players, then mark each one Include or Exclude for the lineup comparison.";
    $("compareAnalyzeButton").textContent = matrix ? "Build matrix" : "Build profiles";
    document.querySelector(".compare-stats-toolbar").hidden = !matrix;
    setCompareMode(matrix ? "group" : "combination");
    renderSelectedRoster();
    if (!matrix && state.players.length) runCombination();
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
    const eligible = player => player.rows.filter(row => mapFilter.matches(row.map));
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
    return comboMatchesForCondition(current).map(match => match.rows.find(item => item.player.profileId === player.profileId)?.row).filter(Boolean);
  }

  const { integer, decimal, percent, ratio, titleCase } = window.NickStatsProfile;
  const mapFilter = new window.NickStatsFilters.MultiMapFilter(["compareMapFilter", "matrixMapFilter"], { onChange: () => refreshAnalysis(), formatLabel: value => titleCase(value.replace(/^de_/, "")) });

  function setComboProfileView(view) {
    state.comboView = view;
    document.querySelectorAll("[data-combo-profile-view]").forEach(button => {
      const active = button.dataset.comboProfileView === view;
      button.classList.toggle("active", active); button.setAttribute("aria-selected", String(active)); button.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll("[data-combo-profile-panel]").forEach(panel => { panel.hidden = panel.dataset.comboProfilePanel !== view; });
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
    current.included.forEach(player => {
      const active = player.profileId === state.comboPlayerId;
      const button = el("button", player.label, `match-browser-tab${active ? " active" : ""}`);
      button.type = "button"; button.setAttribute("role", "tab"); button.setAttribute("aria-selected", String(active)); button.tabIndex = active ? 0 : -1;
      button.addEventListener("click", () => { state.comboPlayerId = player.profileId; renderComboProfile(current); });
      profileTabs.appendChild(button);
    });
    const player = current.included.find(item => item.profileId === state.comboPlayerId);
    const rows = comboProfileRows(current, player), stats = summarize(rows), s = stats;
    const sideLabel = state.side === "ALL" ? "All sides" : state.side;
    $("comboProfileTitle").textContent = player.label;
    $("comboProfileMeta").textContent = `Steam ${player.steamId || "unknown"} · ${integer(rows.length)} qualifying match${rows.length === 1 ? "" : "es"} · ${sideLabel}${mapFilter.size ? ` · ${mapFilter.summary()}` : ""}`;
    $("comboProfileRecord").textContent = state.side === "ALL" ? `${stats.wins}–${stats.losses}${stats.ties ? `–${stats.ties}` : ""}` : `${integer(s.round_wins)}–${integer(s.rounds - num(s.round_wins))} rounds`;
    const maps = new Map(); rows.forEach(row => { const collection = maps.get(row.map) || []; collection.push(row); maps.set(row.map, collection); });
    const normalize = source => ({ stats: source, weapons: source.weapons, matches: source.n, wins: source.wins, losses: source.losses, draws: source.ties, rating: source.rating, kd: source.kd, adr: source.adr, kast: source.kast, winRate: source.winRate });
    const mapRows = [...maps.entries()].map(([name, mapMatches]) => ({ name, summary: normalize(summarize(mapMatches)) })).sort((a, b) => b.summary.matches - a.summary.matches || a.name.localeCompare(b.name));
    window.NickStatsProfile.render({ prefix: "combo", headlineId: "comboProfileHeadline", summary: normalize(stats), side: state.side, maps: mapRows });
    setComboProfileView(state.comboView);
  }

  function runCombination() {
    const current = findCombination();
    if (!current) return;
    renderComboWarnings(current);
    renderComboProfile(current);
    $("comboResults").hidden = false;
  }

  function clear() {
    state.searchController?.abort();
    state.compareController?.abort();
    state.selected.clear();
    state.choices.clear();
    invalidateAnalysis();
    $("compareSearchInput").value = "";
    $("compareSearchResults").replaceChildren();
    setSearchStatus("Search and add at least two players.");
    renderSelectedRoster();
  }

  $("compareSearchForm").addEventListener("submit", event => { event.preventDefault(); clearTimeout(state.searchTimer); searchPlayers(); });
  $("compareSearchInput").addEventListener("input", event => {
    clearTimeout(state.searchTimer);
    const query = event.target.value.trim();
    if (!query) { $("compareSearchResults").replaceChildren(); return; }
    if (query.length >= 2) state.searchTimer = setTimeout(searchPlayers, 250);
  });
  $("compareAnalyzeButton").addEventListener("click", analyze);
  $("compareClearButton").addEventListener("click", clear);
  document.querySelectorAll("[data-combo-profile-view]").forEach(button => button.addEventListener("click", () => setComboProfileView(button.dataset.comboProfileView)));
  document.querySelectorAll("[data-combo-condition]").forEach(button => button.addEventListener("click", () => {
    if (button.disabled) return;
    state.comboCondition = button.dataset.comboCondition; runCombination();
  }));
  $("compareMetricGroup").addEventListener("change", event => {
    state.metricGroup = event.target.value;
    $("compareWeapon").hidden = state.metricGroup !== "weapons";
    refreshAnalysis();
  });
  $("compareWeapon").addEventListener("change", event => { state.weapon = event.target.value; refreshAnalysis(); });
  window.NickStatsFilters.bindSideToggle({ selector: "[data-matrix-side], [data-compare-side]", valueFor: button => button.dataset.matrixSide || button.dataset.compareSide, onChange: side => { state.side = side; refreshAnalysis(); } });
  document.querySelectorAll("[data-compare-mode]").forEach(button => button.addEventListener("click", () => setCompareMode(button.dataset.compareMode)));
  window.addEventListener("nickstats:page", event => {
    if (["compare", "matrix"].includes(event.detail?.page)) setWorkspace(event.detail.page);
  });
  setWorkspace(state.workspace);
  renderSelectedRoster();
})();
