(() => {
  "use strict";
  const metrics = Object.freeze({ kills: "Kills", deaths: "Deaths", damage: "Damage", awp: "AWP kills", differential: "Round differential" });
  const finite = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const phaseMatches = (round, phase) => phase === "ALL" || (phase === "REGULATION" ? round <= 24 : round > 24);
  const matchesFilters = (row, filters = {}) =>
    phaseMatches(finite(row.round), filters.phase || "ALL") &&
    (!filters.side || filters.side === "ALL" || row.side === filters.side) &&
    (!filters.buy || filters.buy === "ALL" || (filters.buy === "hero" ? row.hero === true && ["eco", "force"].includes(row.buy) : row.buy === filters.buy)) &&
    (!filters.opponentBuy || filters.opponentBuy === "ALL" || row.opponent_buy === filters.opponentBuy) &&
    (!filters.result || filters.result === "ALL" || row.result === filters.result) &&
    (!filters.heroOnly || row.hero === true);

  function withDifferentials(rows) {
    let differential = 0, lastRound = 0;
    const completed = [];
    for (const row of [...(rows || [])].sort((a, b) => a.round - b.round)) {
      if (!Number.isInteger(row.round) || row.round !== lastRound + 1 || !["win", "loss"].includes(row.result)) break;
      differential += row.result === "win" ? 1 : -1;
      completed.push({ ...row, differential });
      lastRound = row.round;
    }
    return completed;
  }

  function matchDifferential(payload, viewerSteamID) {
    const teams = payload?.teams || [], players = payload?.players || [];
    const teamIndex = Math.max(0, teams.findIndex(team => (team.players || []).some(index => players[index]?.steam_id === viewerSteamID && viewerSteamID)));
    const team = teams[teamIndex];
    if (!team) return { name: "Team", points: [] };
    const byRound = new Map();
    (team.players || []).forEach(index => (players[index]?.round_slices || []).forEach(row => {
      if (!byRound.has(row.round) && ["win", "loss"].includes(row.result)) byRound.set(row.round, row.result);
    }));
    const economy = new Map((payload.round_economy || []).map(row => [row[0], row]));
    (payload.round_timing || []).forEach(row => {
      const side = row[4], assignment = economy.get(row[0]);
      if (!byRound.has(row[0]) && assignment && ["T", "CT"].includes(side)) {
        const winner = side === "T" ? assignment[7] : assignment[8];
        if (winner != null) byRound.set(row[0], winner === teamIndex ? "win" : "loss");
      }
    });
    let forScore = 0, againstScore = 0;
    const points = [];
    for (let round = 1; round <= finite(payload.rounds); round += 1) {
      const result = byRound.get(round);
      if (result !== "win" && result !== "loss") break;
      result === "win" ? forScore++ : againstScore++;
      points.push({ round, value: forScore - againstScore, roundValue: result === "win" ? 1 : -1, forScore, againstScore });
    }
    return { name: team.name || `Team ${teamIndex + 1}`, points };
  }

  function averages(matches, filters = {}, metric = "kills") {
    const totals = new Map();
    for (const match of matches || []) for (const row of match.round_kills || []) {
      if (!Number.isInteger(row.round) || row.round < 1 || !matchesFilters(row, filters) || row[metric] == null) continue;
      const value = totals.get(row.round) || { round: row.round, total: 0, appearances: 0 };
      value.total += finite(row[metric]);
      value.appearances += 1;
      totals.set(row.round, value);
    }
    return [...totals.values()].sort((a, b) => a.round - b.round).map(row => ({
      round: row.round, value: row.total / row.appearances, appearances: row.appearances
    }));
  }

  function metricValue(slice, metric) {
    if (metric === "awp") return (slice.stats?.weapons || []).reduce((total, weapon) =>
      total + (String(weapon[0]).toLowerCase() === "awp" ? finite(weapon[1]) : 0), 0);
    return finite(slice.stats?.kda?.[{ kills: 0, deaths: 1, damage: 4 }[metric]]);
  }

  function cumulativeValues(slices, metric, filters, roundCount) {
    if (!slices?.length) return [];
    const qualifying = new Map(slices.filter(row => matchesFilters(row, { ...filters, phase: "ALL" })).map(row => [row.round, row]));
    const points = [];
    let total = 0;
    for (let round = 1; round <= roundCount; round += 1) {
      const roundValue = qualifying.has(round) ? metricValue(qualifying.get(round), metric) : 0;
      total += roundValue;
      if (phaseMatches(round, filters.phase || "ALL")) points.push({ round, value: total, roundValue });
    }
    return points;
  }

  function render(target, payload, metric = "kills", filters = {}, viewerSteamID = null, selectedPlayers = null, displayStyle = "line") {
    target.replaceChildren();
    const players = payload?.players || [];
    const roundCount = finite(payload?.rounds);
    const series = metric === "differential"
      ? (() => {
          const { name, points } = matchDifferential(payload, viewerSteamID);
          return [{ label: name, colorIndex: 1, roundValues: points.filter(point => phaseMatches(point.round, filters.phase || "ALL")) }];
        })()
      : (payload?.teams || []).flatMap(team => team.players || []).filter((index, position, all) => all.indexOf(index) === position)
        .filter(index => selectedPlayers == null || selectedPlayers.has(index)).map(index => ({
          label: players[index]?.name || `Player ${index + 1}`, colorIndex: index,
          roundValues: cumulativeValues(players[index]?.round_slices, metric, filters, roundCount)
        }));
    const visible = series.filter(item => item.roundValues.length);
    if (!visible.length) {
      const empty = document.createElement("p"); empty.className = "graph-empty";
      empty.textContent = metric === "differential"
        ? "Round results are unavailable for this phase. Reparse older demos to add round data."
        : selectedPlayers?.size === 0 ? "Select a player to see the timeline."
          : "No per-round data for the selected players and filters. Reparse older demos to add round data.";
      target.appendChild(empty); return;
    }
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 900 420");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `${metrics[metric]} by exact match round`);
    const firstRound = filters.phase === "OVERTIME" ? 25 : 1;
    const maxRound = filters.phase === "REGULATION" ? Math.min(24, roundCount) : roundCount;
    window.NickStatsGraphs.drawRoundSeries(svg, visible, {
      id: metric === "differential" ? "round_diff" : metric,
      label: metrics[metric], digits: 0, suffix: ""
    }, displayStyle, { exact: true, firstRound, maxRound });
    const frame = document.createElement("div"); frame.className = "round-timeline-graph-frame";
    frame.appendChild(svg); target.appendChild(frame);
  }
  window.NickStatsRoundTimeline = Object.freeze({ metrics, metricValue, matchesFilters, withDifferentials, matchDifferential, cumulativeValues, averages, render });
})();
