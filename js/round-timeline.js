(() => {
  "use strict";
  const metrics = Object.freeze({ kills: "Kills", deaths: "Deaths", damage: "Damage", awp: "AWP kills" });
  const finite = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const phaseMatches = (round, phase) => phase === "ALL" || (phase === "REGULATION" ? round <= 24 : round > 24);
  const matchesFilters = (row, filters = {}) =>
    phaseMatches(finite(row.round), filters.phase || "ALL") &&
    (!filters.side || filters.side === "ALL" || row.side === filters.side) &&
    (!filters.buy || filters.buy === "ALL" || row.buy === filters.buy) &&
    (!filters.opponentBuy || filters.opponentBuy === "ALL" || row.opponent_buy === filters.opponentBuy) &&
    (!filters.result || filters.result === "ALL" || row.result === filters.result);

  function averages(matches, filters = {}) {
    const totals = new Map();
    for (const match of matches || []) for (const row of match.round_kills || []) {
      if (!Number.isInteger(row.round) || row.round < 1 || !matchesFilters(row, filters)) continue;
      const value = totals.get(row.round) || { round: row.round, kills: 0, appearances: 0 };
      value.kills += finite(row.kills);
      value.appearances += 1;
      totals.set(row.round, value);
    }
    return [...totals.values()].sort((a, b) => a.round - b.round).map(row => ({
      round: row.round, value: row.kills / row.appearances, appearances: row.appearances
    }));
  }

  function metricValue(slice, metric) {
    if (metric === "awp") return (slice.stats?.weapons || []).reduce((total, weapon) =>
      total + (String(weapon[0]).toLowerCase() === "awp" ? finite(weapon[1]) : 0), 0);
    return finite(slice.stats?.kda?.[{ kills: 0, deaths: 1, damage: 4 }[metric]]);
  }

  function render(target, payload, metric = "kills", filters = {}) {
    target.replaceChildren();
    const players = payload?.players || [];
    const rounds = Math.max(0, ...players.flatMap(player => (player.round_slices || []).map(row => finite(row.round))));
    if (!rounds) {
      const empty = document.createElement("p");
      empty.className = "graph-empty";
      empty.textContent = "Round data is unavailable for this match. Reparse the demo to build its timeline.";
      target.appendChild(empty);
      return;
    }
    const visibleRounds = Array.from({ length: rounds }, (_, index) => index + 1).filter(round => phaseMatches(round, filters.phase || "ALL"));
    const table = document.createElement("table"); table.className = "round-timeline-table";
    const caption = document.createElement("caption"); caption.textContent = `${metrics[metric]} by player and exact round`; table.appendChild(caption);
    const head = document.createElement("thead"), headers = document.createElement("tr");
    const playerHeader = document.createElement("th"); playerHeader.scope = "col"; playerHeader.textContent = "Player"; headers.appendChild(playerHeader);
    visibleRounds.forEach(round => {
      const th = document.createElement("th"); th.scope = "col"; th.textContent = String(round);
      if (round === 13 || round === 25) th.className = "round-timeline-boundary";
      th.title = round > 24 ? `Overtime round ${round}` : `Regulation round ${round}`;
      headers.appendChild(th);
    });
    head.appendChild(headers); table.appendChild(head);
    const body = document.createElement("tbody");
    (payload.teams || []).forEach((team, teamIndex) => {
      const teamRow = document.createElement("tr"), teamCell = document.createElement("th");
      teamCell.colSpan = visibleRounds.length + 1; teamCell.className = "round-timeline-team";
      teamCell.textContent = team.name || `Team ${teamIndex + 1}`; teamRow.appendChild(teamCell); body.appendChild(teamRow);
      (team.players || []).forEach(index => {
        const player = players[index]; if (!player) return;
        const slices = new Map((player.round_slices || []).filter(row => matchesFilters(row, filters)).map(row => [row.round, row]));
        const row = document.createElement("tr"), name = document.createElement("th"); name.scope = "row"; name.textContent = player.name || "Unknown player"; row.appendChild(name);
        visibleRounds.forEach(round => {
          const cell = document.createElement("td"), slice = slices.get(round);
          if (round === 13 || round === 25) cell.classList.add("round-timeline-boundary");
          if (slice) {
            const value = metricValue(slice, metric);
            cell.textContent = value ? String(value) : "·";
            cell.classList.add(value ? "round-timeline-active" : "round-timeline-zero");
            cell.style.setProperty("--round-intensity", String(Math.min(.78, .12 + value / (metric === "damage" ? 150 : 3) * .55)));
            cell.title = `${player.name || "Player"}, round ${round}: ${value} ${metrics[metric].toLowerCase()}`;
          } else { cell.textContent = "–"; cell.title = `${player.name || "Player"}, round ${round}: no qualifying participation`; }
          row.appendChild(cell);
        });
        body.appendChild(row);
      });
    });
    table.appendChild(body);
    const scroller = document.createElement("div"); scroller.className = "round-timeline-scroll"; scroller.tabIndex = 0;
    scroller.setAttribute("aria-label", "Round timeline, scroll horizontally for later rounds");
    scroller.appendChild(table); target.appendChild(scroller);
  }
  window.NickStatsRoundTimeline = Object.freeze({ metrics, metricValue, matchesFilters, averages, render });
})();
