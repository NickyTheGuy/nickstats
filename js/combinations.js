(() => {
  "use strict";

  const MAX_INCLUDED = 5;
  const state = { players: [], choices: new Map(), current: null };
  const $ = id => document.getElementById(id);

  function num(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function choiceFor(player) {
    return state.choices.get(player.profileId) || "ignore";
  }

  function selectedPlayers(choice) {
    return state.players.filter(player => choiceFor(player) === choice);
  }

  function setStatus(message, error = false) {
    $("comboStatus").textContent = message;
    $("comboStatus").classList.toggle("error", error);
  }

  function summarize(rows) {
    const n = rows.length;
    const sum = key => rows.reduce((total, row) => total + num(row[key]), 0);
    const kills = sum("k"), deaths = sum("d"), assists = sum("a");
    const wins = rows.filter(row => row.result === "w").length;
    const losses = rows.filter(row => row.result === "l").length;
    const ties = rows.filter(row => row.result === "n").length;
    return {
      n, wins, losses, ties,
      winRate: n ? 100 * wins / n : 0,
      kd: deaths ? kills / deaths : kills ? Infinity : 0,
      avgK: n ? kills / n : 0,
      avgD: n ? deaths / n : 0,
      avgA: n ? assists / n : 0,
      avgHs: n ? sum("hs") / n : 0,
      adr: n ? sum("adr") / n : 0,
      rating: n ? sum("rating") / n : 0
    };
  }

  function td(text, className) {
    const cell = document.createElement("td");
    cell.textContent = text;
    if (className) cell.className = className;
    return cell;
  }

  function resultLabel(result) {
    return result === "w" ? "Win" : result === "l" ? "Loss" : "Tie";
  }

  function resultClass(result) {
    return result === "w" ? "result-win" : result === "l" ? "result-loss" : "result-tie";
  }

  function formatDate(timestamp) {
    return timestamp ? new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(new Date(timestamp * 1000)) : "—";
  }

  function record(stats) {
    return `${stats.wins}-${stats.losses}-${stats.ties}`;
  }

  function formatNumber(value, digits = 2) {
    return Number.isFinite(value) ? value.toFixed(digits) : "∞";
  }

  function comparisonClasses(first, second, key, higherIsBetter = true) {
    if (!first.n || !second.n) return ["", ""];
    const a = first[key], b = second[key];
    if (a === b || Math.abs(a - b) < 1e-9) return ["neutral", "neutral"];
    const firstIsBetter = higherIsBetter ? a > b : a < b;
    return firstIsBetter ? ["positive", "negative"] : ["negative", "positive"];
  }

  function csvCell(value) {
    const text = String(value ?? "");
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function cleanName(value) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "player";
  }

  function updateControls(message) {
    const included = selectedPlayers("include").length;
    const excluded = selectedPlayers("exclude").length;
    $("comboSelectionCount").textContent = `${included} / ${MAX_INCLUDED} included · ${excluded} excluded`;
    $("comboRun").disabled = included === 0 || included > MAX_INCLUDED;
    if (message) setStatus(message, true);
    else if (!included) setStatus("Include at least one player.");
    else setStatus(`${included} included, ${excluded} excluded. Ready to run.`);
  }

  function setChoice(player, choice) {
    const oldChoice = choiceFor(player);
    if (oldChoice === choice) return;
    if (choice === "include" && oldChoice !== "include" && selectedPlayers("include").length >= MAX_INCLUDED) {
      updateControls(`A team can have at most ${MAX_INCLUDED} Included players.`);
      return;
    }
    state.choices.set(player.profileId, choice);
    state.current = null;
    $("comboResults").hidden = true;
    renderRoster();
  }

  function renderRoster() {
    const roster = $("comboRoster");
    roster.replaceChildren();
    state.players.forEach(player => {
      const card = document.createElement("article");
      const current = choiceFor(player);
      card.className = `combo-player-card is-${current}`;

      const meta = document.createElement("div");
      meta.className = "combo-player-meta";
      const name = document.createElement("strong");
      name.textContent = player.label;
      const matches = document.createElement("small");
      matches.textContent = `${player.rows.length} loaded matches`;
      meta.append(name, matches);

      const choices = document.createElement("div");
      choices.className = "combo-choice";
      choices.setAttribute("role", "group");
      choices.setAttribute("aria-label", `${player.label} condition`);
      [
        ["ignore", "Ignore"],
        ["include", "Include"],
        ["exclude", "Exclude"]
      ].forEach(([value, label]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.dataset.choice = value;
        button.setAttribute("aria-pressed", String(current === value));
        button.addEventListener("click", () => setChoice(player, value));
        choices.appendChild(button);
      });
      card.append(meta, choices);
      roster.appendChild(card);
    });
    updateControls();
  }

  function findCombination() {
    const included = selectedPlayers("include");
    const excluded = selectedPlayers("exclude");
    if (!included.length || included.length > MAX_INCLUDED) return null;

    const fullTeam = included.length === MAX_INCLUDED;
    const comparisonPossible = excluded.length > 0 && included.length + excluded.length <= MAX_INCLUDED;
    const includedMaps = included.map(player => new Map(player.rows.map(row => [row.id, row])));
    const excludedEntries = fullTeam ? [] : excluded.map(player => ({
      player,
      matchIds: new Set(player.rows.map(row => row.id))
    }));
    const teammatePresent = (row, entry) => Array.isArray(row.teammateIds)
      ? row.teammateIds.includes(entry.player.profileId)
      : entry.matchIds.has(row.id);
    const firstRows = included[0].rows;
    const baseMatches = firstRows
      .filter(row => includedMaps.every((map, index) =>
        map.has(row.id) && (index === 0 || !Array.isArray(row.teammateIds) || row.teammateIds.includes(included[index].profileId))
      ))
      .map(firstRow => ({
        id: firstRow.id,
        rows: included.map((player, index) => ({ player, row: includedMaps[index].get(firstRow.id) }))
      }));
    const matches = (fullTeam
      ? baseMatches.slice()
      : baseMatches.filter(match => excludedEntries.every(entry => !teammatePresent(match.rows[0].row, entry))))
      .sort((a, b) => b.rows[0].row.date - a.rows[0].row.date);
    const comparisonMatches = comparisonPossible
      ? baseMatches
          .filter(match => excludedEntries.every(entry => teammatePresent(match.rows[0].row, entry)))
          .sort((a, b) => b.rows[0].row.date - a.rows[0].row.date)
      : [];
    const partialMatches = !fullTeam && excludedEntries.length > 1
      ? baseMatches.filter(match => {
          const presentCount = excludedEntries.filter(entry => teammatePresent(match.rows[0].row, entry)).length;
          return presentCount > 0 && presentCount < excludedEntries.length;
        })
      : [];

    return { included, excluded, baseMatches, matches, comparisonMatches, partialMatches, fullTeam, comparisonPossible, removed: comparisonMatches.length };
  }

  function renderWarnings(current) {
    const warnings = $("comboWarnings");
    warnings.replaceChildren();
    if (current.fullTeam && current.excluded.length) {
      const warning = document.createElement("div");
      warning.className = "warning";
      warning.textContent = "Five Included players already fill the team. Excluded selections are redundant, so their match histories were not checked.";
      warnings.appendChild(warning);
    } else if (current.excluded.length && !current.comparisonPossible) {
      const warning = document.createElement("div");
      warning.className = "warning";
      warning.textContent = `The ${current.included.length + current.excluded.length}-player “With excluded” roster cannot fit on one team. “Without excluded” is still calculated normally.`;
      warnings.appendChild(warning);
    }
    const differing = current.matches.filter(match => new Set(match.rows.map(item => item.row.result)).size > 1).length;
    if (differing) {
      const warning = document.createElement("div");
      warning.className = "warning";
      warning.textContent = `${differing} qualifying ${differing === 1 ? "match has" : "matches have"} different results across included profiles. Those players may have been opponents; the match table uses ${current.included[0].label}’s result and score.`;
      warnings.appendChild(warning);
    }
    if (current.partialMatches.length) {
      const warning = document.createElement("div");
      warning.className = "warning";
      warning.textContent = `${current.partialMatches.length} ${current.partialMatches.length === 1 ? "match contains" : "matches contain"} only some Excluded players and ${current.partialMatches.length === 1 ? "is" : "are"} omitted from both comparison groups.`;
      warnings.appendChild(warning);
    }
  }

  function renderStats(current) {
    const body = $("comboStatsBody");
    body.replaceChildren();
    const sharedWithoutStats = summarize(current.matches.map(match => match.rows[0].row));
    const sharedWithStats = summarize(current.comparisonMatches.map(match => match.rows[0].row));
    const sharedColors = {
      record: comparisonClasses(sharedWithoutStats, sharedWithStats, "winRate"),
      winRate: comparisonClasses(sharedWithoutStats, sharedWithStats, "winRate")
    };
    current.included.forEach((player, playerIndex) => {
      const withRows = current.matches.map(match => match.rows.find(item => item.player.profileId === player.profileId).row);
      const withoutRows = current.comparisonMatches.map(match => match.rows.find(item => item.player.profileId === player.profileId).row);
      const hasExclusions = current.excluded.length > 0;
      const withStats = summarize(withRows);
      const withoutStats = summarize(withoutRows);
      const groups = [
        [hasExclusions ? "Without excluded" : "Included lineup", withStats, sharedWithoutStats, "condition-with"],
        [!hasExclusions ? "No exclusion comparison" : current.comparisonPossible ? "With excluded" : "With excluded (not possible)", withoutStats, sharedWithStats, "condition-without"]
      ];
      const colors = {
        kd: comparisonClasses(withStats, withoutStats, "kd"),
        avgK: comparisonClasses(withStats, withoutStats, "avgK"),
        avgD: comparisonClasses(withStats, withoutStats, "avgD", false),
        avgA: comparisonClasses(withStats, withoutStats, "avgA"),
        avgHs: comparisonClasses(withStats, withoutStats, "avgHs"),
        adr: comparisonClasses(withStats, withoutStats, "adr"),
        rating: comparisonClasses(withStats, withoutStats, "rating")
      };
      groups.forEach(([label, stats, outcomeStats, className], index) => {
        const tr = document.createElement("tr");
        tr.className = className;
        if (index === 0) {
          const playerCell = td(player.label, "combo-player-name");
          playerCell.rowSpan = 2;
          tr.appendChild(playerCell);
        }
        tr.append(
          td(label), td(outcomeStats.n), td(record(outcomeStats), sharedColors.record[index]), td(`${outcomeStats.winRate.toFixed(1)}%`, sharedColors.winRate[index]),
          td(formatNumber(stats.kd), colors.kd[index]), td(stats.avgK.toFixed(1), colors.avgK[index]), td(stats.avgD.toFixed(1), colors.avgD[index]),
          td(stats.avgA.toFixed(1), colors.avgA[index]), td(`${stats.avgHs.toFixed(1)}%`, colors.avgHs[index]),
          td(stats.adr.toFixed(1), colors.adr[index]), td(stats.rating.toFixed(2), colors.rating[index])
        );
        body.appendChild(tr);
      });
      if (playerIndex < current.included.length - 1) {
        const spacer = document.createElement("tr");
        spacer.className = "combo-player-spacer";
        spacer.setAttribute("aria-hidden", "true");
        const cell = document.createElement("td");
        cell.colSpan = 12;
        spacer.appendChild(cell);
        body.appendChild(spacer);
      }
    });
  }

  function renderMatches(current) {
    const head = $("comboMatchHead");
    const body = $("comboMatchBody");
    head.replaceChildren();
    body.replaceChildren();

    const header = document.createElement("tr");
    ["Date", "Map", "Result", "Score", ...current.included.map(player => player.label), "Match"].forEach(label => {
      const th = document.createElement("th");
      th.textContent = label;
      header.appendChild(th);
    });
    head.appendChild(header);

    current.matches.forEach(match => {
      const first = match.rows[0].row;
      const tr = document.createElement("tr");
      tr.append(td(formatDate(first.date)), td(first.map), td(resultLabel(first.result), resultClass(first.result)), td(`${first.score[0]}–${first.score[1]}`));
      match.rows.forEach(({ row }) => tr.appendChild(td(`${row.k}/${row.d}/${row.a} · ${row.adr.toFixed(0)} ADR · ${row.rating.toFixed(2)} R`, "combo-player-line")));
      const linkCell = document.createElement("td");
      const link = document.createElement("a");
      link.className = "match-link";
      link.href = first.matchUrl || `https://csstats.gg/match/${match.id}`;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = first.matchUrl ? "Open" : `#${match.id}`;
      linkCell.appendChild(link);
      tr.appendChild(linkCell);
      body.appendChild(tr);
    });
    $("comboEmpty").hidden = current.matches.length !== 0;
    $("comboMatchLabel").textContent = `${current.matches.length} matches · Result and score use ${current.included[0].label}’s perspective.`;
  }

  function renderCurrent(current) {
    const includeText = current.included.map(player => player.label).join(" + ");
    const excludeText = current.excluded.length ? ` without ${current.excluded.map(player => player.label).join(" + ")}` : "";
    $("comboTitle").textContent = includeText + excludeText;
    $("comboMatchTotal").textContent = current.matches.length;
    $("comboIncludedTotal").textContent = current.included.length;
    $("comboExcludedTotal").textContent = current.excluded.length;
    $("comboRemovedTotal").textContent = current.removed;
    $("comboDownload").disabled = current.matches.length === 0;
    renderWarnings(current);
    renderStats(current);
    renderMatches(current);
    $("comboResults").hidden = false;
    setStatus(`Found ${current.matches.length} qualifying ${current.matches.length === 1 ? "match" : "matches"}.`);
  }

  function run() {
    const current = findCombination();
    if (!current) {
      updateControls("Choose between one and five Included players.");
      return;
    }
    state.current = current;
    renderCurrent(current);
  }

  function reset() {
    state.players.forEach(player => state.choices.set(player.profileId, "ignore"));
    state.current = null;
    $("comboResults").hidden = true;
    $("comboWarnings").replaceChildren();
    renderRoster();
  }

  function downloadCsv() {
    const current = state.current;
    if (!current || !current.matches.length) return;
    const playerColumns = current.included.flatMap(player => {
      const prefix = cleanName(player.label);
      return ["kills", "deaths", "assists", "hs_percent", "adr", "rating"].map(metric => `${prefix}_${metric}`);
    });
    const headers = ["date_utc", "match_id", "match_url", "map", "result_first_included", "score_for", "score_against", ...playerColumns];
    const lines = [headers.map(csvCell).join(",")];
    current.matches.forEach(match => {
      const first = match.rows[0].row;
      const playerValues = match.rows.flatMap(({ row }) => [row.k, row.d, row.a, row.hs, row.adr, row.rating]);
      lines.push([
        first.date ? new Date(first.date * 1000).toISOString() : "", match.id, first.matchUrl || `https://csstats.gg/match/${match.id}`,
        first.map, resultLabel(first.result), first.score[0], first.score[1], ...playerValues
      ].map(csvCell).join(","));
    });
    const filename = `${current.included.map(player => cleanName(player.label)).join("-and-")}${current.excluded.length ? `-without-${current.excluded.map(player => cleanName(player.label)).join("-and-")}` : ""}.csv`;
    const blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function setPlayers(players) {
    const previous = new Map(state.choices);
    state.players = players.slice();
    state.choices = new Map(players.map(player => [player.profileId, previous.get(player.profileId) || "ignore"]));
    state.current = null;
    $("comboResults").hidden = true;
    $("comboWarnings").replaceChildren();
    renderRoster();
  }

  function activate() {
    renderRoster();
  }

  function clear() {
    state.players = [];
    state.choices.clear();
    state.current = null;
    $("comboRoster").replaceChildren();
    $("comboResults").hidden = true;
    $("comboWarnings").replaceChildren();
  }

  $("comboRun").addEventListener("click", run);
  $("comboReset").addEventListener("click", reset);
  $("comboDownload").addEventListener("click", downloadCsv);

  window.CSStatsCombinations = Object.freeze({ setPlayers, activate, clear });
})();
