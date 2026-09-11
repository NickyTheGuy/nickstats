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
    searchController: null, compareController: null, searchTimer: null
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
        rounds: num(match.rounds), k: num(match.kills), d: num(match.deaths),
        a: num(match.assists), headshots: num(match.headshots), damage: num(match.damage),
        kastRounds: num(match.kast_rounds), rating: playerRating(match)
      }))
    };
  }

  function summarize(rows) {
    const n = rows.length;
    const sum = key => rows.reduce((total, row) => total + num(row[key]), 0);
    const kills = sum("k"), deaths = sum("d"), assists = sum("a");
    const rounds = sum("rounds"), damage = sum("damage"), kastRounds = sum("kastRounds");
    const wins = rows.filter(row => row.result === "w").length;
    const losses = rows.filter(row => row.result === "l").length;
    const ties = rows.filter(row => row.result === "n").length;
    const aggregate = { rounds, kills, deaths, assists, damage, kast_rounds: kastRounds };
    return {
      n, wins, losses, ties,
      winRate: n ? 100 * wins / n : 0,
      kd: deaths ? kills / deaths : kills,
      avgK: n ? kills / n : 0,
      avgD: n ? deaths / n : 0,
      avgA: n ? assists / n : 0,
      avgHs: kills ? 100 * sum("headshots") / kills : 0,
      adr: rounds ? damage / rounds : 0,
      kast: rounds ? 100 * kastRounds / rounds : 0,
      rating: playerRating(aggregate)
    };
  }

  function signed(value, digits = 1, suffix = "") {
    const magnitude = Math.abs(num(value)).toFixed(digits);
    return `${value > 0 ? "+" : value < 0 ? "−" : ""}${magnitude}${suffix}`;
  }

  function classify(score) {
    return score >= scoring.lifterThreshold ? "Lifter" : score <= scoring.draggerThreshold ? "Dragger" : "Exister";
  }

  function pairImpact(target, actor) {
    const withRows = target.rows.filter(row => row.teammateIds.includes(actor.profileId));
    const withoutRows = target.rows.filter(row => !row.teammateIds.includes(actor.profileId));
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
      win.append(el("strong", signed(item.delta.winRate, 1, " pp"), item.delta.winRate > 0 ? "positive" : item.delta.winRate < 0 ? "negative" : "neutral"), el("span", "Teammate win rate"));
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
    const body = $("compareDetailsBody");
    body.replaceChildren();
    for (const pair of pairs) {
      const row = document.createElement("tr");
      const kind = pair.classification.toLowerCase();
      [pair.target.label, pair.actor.label, pair.classification, pair.withN, pair.withoutN,
        signed(pair.delta.winRate, 1, " pp"), signed(pair.delta.rating, 3), pair.confidence]
        .forEach((value, index) => row.appendChild(td(value, index === 2 ? (kind === "lifter" ? "positive" : kind === "dragger" ? "negative" : "neutral") : "")));
      body.appendChild(row);
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
    $("compareSearchInput").value = "";
    $("compareSearchResults").replaceChildren();
    setSearchStatus("Search for another player, or analyze this group.");
    invalidateAnalysis();
    renderSelectedRoster();
  }

  function removePlayer(id) {
    state.selected.delete(String(id));
    invalidateAnalysis();
    renderSelectedRoster();
  }

  function invalidateAnalysis() {
    state.players = [];
    state.analysis = null;
    state.choices.clear();
    $("compareResults").hidden = true;
  }

  function renderSelectedRoster() {
    const roster = $("compareSelectedRoster");
    roster.replaceChildren();
    for (const player of state.selected.values()) {
      const chip = el("div", null, "compare-selected-player");
      const identity = el("span", null);
      identity.append(el("strong", player.name), el("small", `${player.match_count} matches`));
      const remove = el("button", "Remove");
      remove.type = "button";
      remove.setAttribute("aria-label", `Remove ${player.name}`);
      remove.addEventListener("click", () => removePlayer(player.id));
      chip.append(identity, remove);
      roster.appendChild(chip);
    }
    const count = state.selected.size;
    $("compareAnalyzeButton").disabled = count < 2;
    $("compareClearButton").disabled = count === 0;
    setStatus(count < 2 ? "Choose at least two players." : `${count} players selected. Ready to analyze.`);
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
      state.analysis = buildAnalysis(state.players);
      state.choices = new Map(state.players.map(player => [player.profileId, "ignore"]));
      renderVerdicts(state.analysis.overall);
      renderMatrix(state.analysis);
      renderPairDetails(state.analysis.pairs);
      renderComboRoster();
      $("compareResults").hidden = false;
      setCompareMode("group");
      setStatus(`Compared ${state.players.length} players across their stored team histories.`);
    } catch (error) {
      if (error.name !== "AbortError") setStatus(`Could not compare players: ${error.message}`, true);
    } finally {
      $("compareAnalyzeButton").disabled = state.selected.size < 2;
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

  function choiceFor(player) {
    return state.choices.get(player.profileId) || "ignore";
  }

  function selectedPlayers(choice) {
    return state.players.filter(player => choiceFor(player) === choice);
  }

  function setChoice(player, choice) {
    if (choice === "include" && choiceFor(player) !== "include" && selectedPlayers("include").length >= MAX_INCLUDED) {
      $("comboStatus").textContent = `A team can have at most ${MAX_INCLUDED} Included players.`;
      $("comboStatus").classList.add("error");
      return;
    }
    state.choices.set(player.profileId, choice);
    $("comboResults").hidden = true;
    renderComboRoster();
  }

  function renderComboRoster() {
    const roster = $("comboRoster");
    roster.replaceChildren();
    for (const player of state.players) {
      const current = choiceFor(player);
      const card = el("article", null, `combo-player-card is-${current}`);
      const meta = el("div", null, "combo-player-meta");
      meta.append(el("strong", player.label), el("small", `${player.rows.length} recorded matches`));
      const choices = el("div", null, "combo-choice");
      choices.setAttribute("role", "group");
      choices.setAttribute("aria-label", `${player.label} condition`);
      [["ignore", "Ignore"], ["include", "Include"], ["exclude", "Exclude"]].forEach(([value, label]) => {
        const button = el("button", label);
        button.type = "button";
        button.dataset.choice = value;
        button.setAttribute("aria-pressed", String(current === value));
        button.addEventListener("click", () => setChoice(player, value));
        choices.appendChild(button);
      });
      card.append(meta, choices);
      roster.appendChild(card);
    }
    const included = selectedPlayers("include").length;
    const excluded = selectedPlayers("exclude").length;
    $("comboSelectionCount").textContent = `${included} / ${MAX_INCLUDED} included · ${excluded} excluded`;
    $("comboRun").disabled = included === 0;
    $("comboStatus").classList.remove("error");
    $("comboStatus").textContent = included ? `${included} included, ${excluded} excluded. Ready to run.` : "Include at least one player.";
  }

  function findCombination() {
    const included = selectedPlayers("include");
    const excluded = selectedPlayers("exclude");
    if (!included.length) return null;
    const first = included[0];
    const rowMaps = new Map(included.map(player => [player.profileId, new Map(player.rows.map(row => [row.id, row]))]));
    const baseMatches = first.rows.filter(row => included.every(player =>
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

  function comparisonClasses(first, second, key, higherIsBetter = true) {
    if (!first.n || !second.n) return ["", ""];
    if (Math.abs(first[key] - second[key]) < 1e-9) return ["neutral", "neutral"];
    const firstBetter = higherIsBetter ? first[key] > second[key] : first[key] < second[key];
    return firstBetter ? ["positive", "negative"] : ["negative", "positive"];
  }

  function record(stats) {
    return `${stats.wins}-${stats.losses}-${stats.ties}`;
  }

  function renderComboWarnings(current) {
    const warnings = $("comboWarnings");
    warnings.replaceChildren();
    const add = message => warnings.appendChild(el("div", message, "warning"));
    if (current.fullTeam && current.excluded.length) add("Five Included players already fill the team, so Excluded selections are redundant.");
    else if (current.excluded.length && !current.comparisonPossible) add(`The ${current.included.length + current.excluded.length}-player “With excluded” roster cannot fit on one team.`);
    if (current.partialMatches.length) add(`${current.partialMatches.length} match${current.partialMatches.length === 1 ? " contains" : "es contain"} only some Excluded players and ${current.partialMatches.length === 1 ? "is" : "are"} omitted from both groups.`);
  }

  function renderComboStats(current) {
    const body = $("comboStatsBody");
    body.replaceChildren();
    const sharedWithout = summarize(current.matches.map(match => match.rows[0].row));
    const sharedWith = summarize(current.comparisonMatches.map(match => match.rows[0].row));
    current.included.forEach((player, playerIndex) => {
      const withoutStats = summarize(current.matches.map(match => match.rows.find(item => item.player.profileId === player.profileId).row));
      const withStats = summarize(current.comparisonMatches.map(match => match.rows.find(item => item.player.profileId === player.profileId).row));
      const outcomes = [sharedWithout, sharedWith];
      const statsRows = [withoutStats, withStats];
      const labels = [current.excluded.length ? "Without excluded" : "Included lineup", current.excluded.length ? "With excluded" : "No comparison"];
      const fields = {
        winRate: comparisonClasses(sharedWithout, sharedWith, "winRate"),
        kd: comparisonClasses(withoutStats, withStats, "kd"), avgK: comparisonClasses(withoutStats, withStats, "avgK"),
        avgD: comparisonClasses(withoutStats, withStats, "avgD", false), avgA: comparisonClasses(withoutStats, withStats, "avgA"),
        avgHs: comparisonClasses(withoutStats, withStats, "avgHs"), adr: comparisonClasses(withoutStats, withStats, "adr"),
        rating: comparisonClasses(withoutStats, withStats, "rating")
      };
      for (let index = 0; index < 2; index += 1) {
        const row = document.createElement("tr");
        row.className = index ? "condition-without" : "condition-with";
        if (!index) {
          const playerCell = td(player.label, "combo-player-name");
          playerCell.rowSpan = 2;
          row.appendChild(playerCell);
        }
        const stats = statsRows[index], outcome = outcomes[index];
        row.append(td(labels[index]), td(outcome.n), td(record(outcome), fields.winRate[index]), td(`${outcome.winRate.toFixed(1)}%`, fields.winRate[index]),
          td(stats.kd.toFixed(2), fields.kd[index]), td(stats.avgK.toFixed(1), fields.avgK[index]), td(stats.avgD.toFixed(1), fields.avgD[index]),
          td(stats.avgA.toFixed(1), fields.avgA[index]), td(`${stats.avgHs.toFixed(1)}%`, fields.avgHs[index]),
          td(stats.adr.toFixed(1), fields.adr[index]), td(stats.rating.toFixed(2), fields.rating[index]));
        body.appendChild(row);
      }
      if (playerIndex < current.included.length - 1) {
        const spacer = el("tr", null, "combo-player-spacer");
        const cell = document.createElement("td");
        cell.colSpan = 12;
        spacer.appendChild(cell);
        body.appendChild(spacer);
      }
    });
  }

  function formatDate(timestamp) {
    return timestamp ? new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(new Date(timestamp * 1000)) : "—";
  }

  function renderComboMatches(current) {
    const header = document.createElement("tr");
    ["Date", "Map", "Result", "Score", ...current.included.map(player => player.label), "Match"].forEach(label => header.appendChild(el("th", label)));
    $("comboMatchHead").replaceChildren(header);
    const body = $("comboMatchBody");
    body.replaceChildren();
    for (const match of current.matches) {
      const first = match.rows[0].row;
      const row = document.createElement("tr");
      const result = first.result === "w" ? "Win" : first.result === "l" ? "Loss" : "Tie";
      row.append(td(formatDate(first.date)), td(first.map.replace(/^de_/, "")), td(result, first.result === "w" ? "result-win" : first.result === "l" ? "result-loss" : "result-tie"),
        td(first.score.every(value => value != null) ? `${first.score[0]}–${first.score[1]}` : "—"));
      match.rows.forEach(item => row.appendChild(td(`${item.row.k}/${item.row.d}/${item.row.a} · ${summarize([item.row]).adr.toFixed(0)} ADR · ${item.row.rating.toFixed(2)} R`, "combo-player-line")));
      row.appendChild(td(`#${match.id}`));
      body.appendChild(row);
    }
    $("comboEmpty").hidden = current.matches.length > 0;
    $("comboMatchLabel").textContent = `${current.matches.length} without-excluded match${current.matches.length === 1 ? "" : "es"}; result and score use ${current.included[0].label}’s perspective.`;
  }

  function runCombination() {
    const current = findCombination();
    if (!current) return;
    $("comboTitle").textContent = `${current.included.map(player => player.label).join(" + ")}${current.excluded.length ? ` without ${current.excluded.map(player => player.label).join(" + ")}` : ""}`;
    $("comboMatchTotal").textContent = current.matches.length;
    $("comboIncludedTotal").textContent = current.included.length;
    $("comboExcludedTotal").textContent = current.excluded.length;
    $("comboComparisonTotal").textContent = current.comparisonMatches.length;
    renderComboWarnings(current);
    renderComboStats(current);
    renderComboMatches(current);
    $("comboResults").hidden = false;
    $("comboStatus").textContent = `Found ${current.matches.length} without-excluded and ${current.comparisonMatches.length} with-excluded matches.`;
  }

  function resetCombination() {
    state.players.forEach(player => state.choices.set(player.profileId, "ignore"));
    $("comboResults").hidden = true;
    $("comboWarnings").replaceChildren();
    renderComboRoster();
  }

  function clear() {
    state.searchController?.abort();
    state.compareController?.abort();
    state.selected.clear();
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
  $("comboRun").addEventListener("click", runCombination);
  $("comboReset").addEventListener("click", resetCombination);
  document.querySelectorAll("[data-compare-mode]").forEach(button => button.addEventListener("click", () => setCompareMode(button.dataset.compareMode)));
  renderSelectedRoster();
})();
