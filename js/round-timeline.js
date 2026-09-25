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
      points.push({ round, value: forScore - againstScore, forScore, againstScore });
    }
    return { name: team.name || `Team ${teamIndex + 1}`, points };
  }

  function renderDifferential(target, payload, filters, viewerSteamID) {
    const { name, points } = matchDifferential(payload, viewerSteamID);
    const visible = points.filter(point => phaseMatches(point.round, filters.phase || "ALL"));
    if (!visible.length) {
      const empty = document.createElement("p"); empty.className = "graph-empty";
      empty.textContent = "Round results are unavailable for this phase. Reparse older demos to add round data.";
      target.appendChild(empty); return;
    }
    const svgNS = "http://www.w3.org/2000/svg";
    const element = (tag, attributes = {}, label) => {
      const node = document.createElementNS(svgNS, tag);
      Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
      if (label != null) node.textContent = label;
      return node;
    };
    const svg = element("svg", { viewBox: "0 0 900 360", role: "img", "aria-label": `${name} round differential by round` });
    const left = 68, top = 26, width = 796, height = 270;
    const low = Math.min(0, ...visible.map(point => point.value)), high = Math.max(0, ...visible.map(point => point.value));
    const extent = Math.max(1, Math.abs(low), Math.abs(high));
    const firstRound = visible[0].round, lastRound = visible.at(-1).round;
    const x = round => left + width * (lastRound === firstRound ? .5 : (round - firstRound) / (lastRound - firstRound));
    const y = value => top + height * (extent - value) / (2 * extent);
    for (let tick = -extent; tick <= extent; tick += Math.max(1, Math.ceil(extent / 4))) {
      svg.appendChild(element("line", { x1: left, y1: y(tick), x2: left + width, y2: y(tick), class: tick === 0 ? "graph-axis" : "graph-grid-line" }));
      svg.appendChild(element("text", { x: left - 10, y: y(tick) + 4, class: "graph-axis-label", "text-anchor": "end" }, tick > 0 ? `+${tick}` : String(tick)));
    }
    svg.appendChild(element("line", { x1: left, y1: top, x2: left, y2: top + height, class: "graph-axis" }));
    for (let round = firstRound; round <= lastRound; round += 1) {
      if (round === 13 || round === 25) svg.appendChild(element("line", { x1: x(round), y1: top, x2: x(round), y2: top + height, class: "graph-bucket-divider" }));
      if (round === firstRound || round === lastRound || round % Math.max(1, Math.ceil((lastRound - firstRound + 1) / 24)) === 0)
        svg.appendChild(element("text", { x: x(round), y: top + height + 20, class: "graph-bucket-label", "text-anchor": "middle" }, String(round)));
    }
    svg.appendChild(element("polyline", { points: visible.map(point => `${x(point.round)},${y(point.value)}`).join(" "), class: "graph-series-line", stroke: "#d18c00" }));
    visible.forEach(point => {
      const dot = element("circle", { cx: x(point.round), cy: y(point.value), r: 5, fill: point.value < 0 ? "#bd343e" : "#d18c00", class: "graph-point" });
      dot.appendChild(element("title", {}, `Round ${point.round}: ${name} ${point.forScore}–${point.againstScore} (${point.value > 0 ? "+" : ""}${point.value})`));
      svg.appendChild(dot);
    });
    svg.appendChild(element("text", { x: 450, y: 346, class: "graph-axis-title", "text-anchor": "middle" }, "Round number"));
    const frame = document.createElement("div"); frame.className = "round-differential-frame";
    frame.appendChild(svg); target.appendChild(frame);
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

  function render(target, payload, metric = "kills", filters = {}, viewerSteamID = null) {
    target.replaceChildren();
    if (metric === "differential") { renderDifferential(target, payload, filters, viewerSteamID); return; }
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
  window.NickStatsRoundTimeline = Object.freeze({ metrics, metricValue, matchesFilters, withDifferentials, matchDifferential, averages, render });
})();
