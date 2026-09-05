(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const state = {
    activeSource: "csstats",
    csstatsResultsVisible: false,
    file: null,
    result: null,
    diagnostics: null,
    worker: null,
    workerReady: null,
    resolveReady: null,
    rejectReady: null,
    resolveParse: null,
    rejectParse: null,
    expandedGroups: { killContext: false, trades: false, assistedKills: false, utility: false, clutches: false, multikills: false },
    scoreboardSort: null
  };

  const sortSpecs = {
    player: { id: "player", modes: [{ label: "A-Z", value: player => player.name || "", direction: "asc" }] },
    rounds: { id: "rounds", modes: [{ label: "Rnds", value: player => player.rounds_played ?? 0 }] },
    kda: { id: "kda", modes: [
      { label: "K", value: player => player.kills ?? 0 },
      { label: "D", value: player => player.deaths ?? 0, direction: "asc" },
      { label: "A", value: player => player.assists ?? 0 }
    ] },
    hs: { id: "hs", modes: [{ label: "HS%", value: player => player.headshot_percent ?? 0 }] },
    adr: { id: "adr", modes: [{ label: "ADR", value: player => player.adr ?? 0 }] },
    kast: { id: "kast", modes: [{ label: "KAST", value: player => player.kast ?? 0 }] },
    opening: { id: "opening", modes: [
      { label: "K", value: player => player.opening_kills ?? 0 },
      { label: "D", value: player => player.opening_deaths ?? 0, direction: "asc" }
    ] },
    blindContext: { id: "blindContext", modes: [
      { label: "K", value: player => player.kill_context?.blinded_enemy_kills ?? 0 },
      { label: "D", value: player => player.kill_context?.deaths_while_blind ?? 0, direction: "asc" }
    ] },
    wallContext: { id: "wallContext", modes: [
      { label: "K", value: player => player.kill_context?.wallbang_kills ?? 0 },
      { label: "D", value: player => player.kill_context?.wallbang_deaths ?? 0, direction: "asc" }
    ] },
    smokeContext: { id: "smokeContext", modes: [
      { label: "K", value: player => player.kill_context?.smoke_kills ?? 0 },
      { label: "D", value: player => player.kill_context?.smoke_deaths ?? 0, direction: "asc" }
    ] },
    airContext: { id: "airContext", modes: [
      { label: "K", value: player => player.kill_context?.airborne_kills ?? 0 },
      { label: "D", value: player => player.kill_context?.deaths_to_airborne_killer ?? 0, direction: "asc" }
    ] },
    speedContext: { id: "speedContext", modes: [
      { label: "K", value: player => player.kill_context?.speed_on_kill?.average ?? -1 },
      { label: "D", value: player => player.kill_context?.killer_speed_on_death?.average ?? -1 }
    ] },
    killContextSummary: { id: "killContextSummary", modes: [
      { label: "Blind K", value: player => player.kill_context?.blinded_enemy_kills ?? 0 },
      { label: "Blind D", value: player => player.kill_context?.deaths_while_blind ?? 0, direction: "asc" },
      { label: "Wall K", value: player => player.kill_context?.wallbang_kills ?? 0 },
      { label: "Wall D", value: player => player.kill_context?.wallbang_deaths ?? 0, direction: "asc" },
      { label: "Smoke K", value: player => player.kill_context?.smoke_kills ?? 0 },
      { label: "Smoke D", value: player => player.kill_context?.smoke_deaths ?? 0, direction: "asc" },
      { label: "Air K", value: player => player.kill_context?.airborne_kills ?? 0 },
      { label: "Air D", value: player => player.kill_context?.deaths_to_airborne_killer ?? 0, direction: "asc" },
      { label: "Speed K", value: player => player.kill_context?.speed_on_kill?.average ?? -1 },
      { label: "Speed D", value: player => player.kill_context?.killer_speed_on_death?.average ?? -1 }
    ] },
    tradeKD: { id: "tradeKD", modes: [
      { label: "K", value: player => player.trade_kills ?? 0 },
      { label: "D", value: player => player.traded_deaths ?? 0 }
    ] },
    tradeKOpp: oneMode("tradeKOpp", "K Opp", player => player.trade_opportunities ?? 0),
    tradeKAtt: oneMode("tradeKAtt", "K Att", player => player.trade_attempts ?? 0),
    tradeKResult: { id: "tradeKResult", modes: [
      { label: "K", value: player => player.trade_kills ?? 0 },
      { label: "K%", value: player => player.trade_success_percent ?? 0 }
    ] },
    tradeDOpp: oneMode("tradeDOpp", "D Opp", player => player.tradeable_deaths ?? 0),
    tradeDAtt: oneMode("tradeDAtt", "D Att", player => player.attempted_tradeable_deaths ?? 0),
    tradeDResult: { id: "tradeDResult", modes: [
      { label: "D", value: player => player.traded_deaths ?? 0 },
      { label: "D%", value: player => player.traded_death_percent ?? 0 }
    ] },
    assistedTotal: oneMode("assistedTotal", "Total", player => player.assisted_kills?.total ?? 0),
    assistedDamage: oneMode("assistedDamage", "Dmg", player => player.assisted_kills?.damage ?? 0),
    assistedFlash: oneMode("assistedFlash", "Flash", player => player.assisted_kills?.flash ?? 0),
    utilitySummary: { id: "utilitySummary", modes: [
      { label: "EF", value: player => player.enemies_flashed ?? 0 },
      { label: "FA", value: player => player.flash_assists ?? 0 },
      { label: "Dmg", value: player => player.grenade_damage?.total ?? 0 }
    ] },
    ef: oneMode("ef", "EF", player => player.enemies_flashed ?? 0),
    fa: oneMode("fa", "FA", player => player.flash_assists ?? 0),
    heDamage: oneMode("heDamage", "HE", player => player.grenade_damage?.high_explosive ?? 0),
    fireDamage: oneMode("fireDamage", "Fire", player => player.grenade_damage?.fire ?? 0),
    clutchTotal: oneMode("clutchTotal", "Total", player => sumCounts(player.clutch_wins)),
    multikillTotal: oneMode("multikillTotal", "Total", player => sumCounts(player.kill_rounds)),
    rating: oneMode("rating", "Rating", player => player.rating ?? 0)
  };

  for (let opponents = 5; opponents >= 1; opponents -= 1) {
    sortSpecs[`clutch${opponents}`] = oneMode(`clutch${opponents}`, `1v${opponents}`, player => player.clutch_wins?.[opponents] ?? 0);
  }
  for (let kills = 5; kills >= 1; kills -= 1) {
    sortSpecs[`kills${kills}`] = oneMode(`kills${kills}`, `${kills}K`, player => player.kill_rounds?.[kills] ?? 0);
  }

  function oneMode(id, label, value, direction = "desc") {
    return { id, modes: [{ label, value, direction }] };
  }

  function sumCounts(counts) {
    return [1, 2, 3, 4, 5].reduce((sum, key) => sum + (counts?.[key] ?? 0), 0);
  }

  function setStatus(message, error = false) {
    $("demoStatus").textContent = message;
    $("demoStatus").classList.toggle("error", error);
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes)) return "";
    const units = ["B", "KB", "MB", "GB"];
    let value = bytes, index = 0;
    while (value >= 1024 && index < units.length - 1) {
      value /= 1024;
      index += 1;
    }
    return `${value.toFixed(index ? 1 : 0)} ${units[index]}`;
  }

  function switchSource(source) {
    if (source === state.activeSource) return;
    const demo = source === "demo";
    if (demo) {
      state.csstatsResultsVisible = !$("results").hidden;
      $("results").hidden = true;
    } else {
      $("results").hidden = !state.csstatsResultsVisible;
    }
    state.activeSource = source;
    $("csstatsDataTab").setAttribute("aria-selected", String(!demo));
    $("demoDataTab").setAttribute("aria-selected", String(demo));
    $("csstatsDataView").hidden = demo;
    $("demoDataView").hidden = !demo;
  }

  function resetWorker(error) {
    state.worker?.terminate();
    state.worker = null;
    state.workerReady = null;
    state.rejectReady?.(error);
    state.rejectParse?.(error);
    state.resolveReady = null;
    state.rejectReady = null;
    state.resolveParse = null;
    state.rejectParse = null;
  }

  function ensureWorker() {
    if (state.workerReady) return state.workerReady;
    state.workerReady = new Promise((resolve, reject) => {
      state.resolveReady = resolve;
      state.rejectReady = reject;
      const worker = new Worker("./js/demo-worker.js?v=20260905-14");
      state.worker = worker;
      const timeout = setTimeout(() => {
        const error = new Error("The demo parser took too long to start.");
        resetWorker(error);
      }, 60000);

      worker.addEventListener("message", event => {
        const message = event.data || {};
        if (message.type === "ready") {
          clearTimeout(timeout);
          state.resolveReady?.();
          state.resolveReady = null;
          state.rejectReady = null;
        } else if (message.type === "result") {
          state.resolveParse?.(message.result);
          state.resolveParse = null;
          state.rejectParse = null;
        } else if (message.type === "error") {
          const error = new Error(message.message || "The demo parser failed.");
          state.diagnostics = message.diagnostics || null;
          $("demoDiagnosticsButton").hidden = !state.diagnostics;
          if (state.rejectParse) {
            state.rejectParse(error);
            state.resolveParse = null;
            state.rejectParse = null;
          } else {
            clearTimeout(timeout);
            resetWorker(error);
          }
        }
      });

      worker.addEventListener("error", event => {
        clearTimeout(timeout);
        resetWorker(new Error(event.message || "The demo parser could not start."));
      });
    });
    return state.workerReady;
  }

  function chooseFile(file) {
    if (!file) return;
    if (!/\.dem(?:\.gz)?$/i.test(file.name) && !/\.gz$/i.test(file.name)) {
      setStatus("Choose a .dem or .dem.gz file.", true);
      return;
    }
    state.file = file;
    state.result = null;
    state.scoreboardSort = null;
    state.diagnostics = null;
    $("demoResults").hidden = true;
    $("demoDiagnosticsButton").hidden = true;
    $("demoFileLabel").textContent = `${file.name} · ${formatBytes(file.size)}`;
    $("demoParseButton").disabled = false;
    $("demoClearButton").disabled = false;
    setStatus("Ready to parse. The demo stays inside this browser.");
  }

  async function readDemo(file) {
    if (!/\.gz$/i.test(file.name)) return file.arrayBuffer();
    if (!("DecompressionStream" in window)) {
      throw new Error("This browser cannot unpack .gz files. Extract the .dem first and select that file.");
    }
    setStatus("Decompressing demo locally…");
    const stream = file.stream().pipeThrough(new DecompressionStream("gzip"));
    return new Response(stream).arrayBuffer();
  }

  function parseWithWorker(name, data) {
    return new Promise((resolve, reject) => {
      state.resolveParse = resolve;
      state.rejectParse = reject;
      state.worker.postMessage({ type: "parse", name, data }, [data]);
    });
  }

  function summaryCard(label, value) {
    const card = document.createElement("div");
    card.className = "demo-summary-card";
    const name = document.createElement("span");
    name.textContent = label;
    const strong = document.createElement("strong");
    strong.textContent = value;
    card.append(name, strong);
    return card;
  }

  function cell(row, value, className) {
    const td = document.createElement("td");
    td.textContent = value;
    if (className) td.className = className;
    row.appendChild(td);
  }

  function speedValue(value) {
    return Number.isFinite(value) ? value.toFixed(0) : "—";
  }

  function playerRow(player) {
    const row = document.createElement("tr");
    const nameCell = document.createElement("td");
    nameCell.className = "demo-player-name";
    nameCell.textContent = player.name || "Unknown player";
    if (player.is_bot) {
      const badge = document.createElement("span");
      badge.className = "demo-bot-badge";
      badge.textContent = "BOT";
      nameCell.appendChild(badge);
    }
    row.appendChild(nameCell);
    cell(row, player.rounds_played ?? 0);
    cell(row, `${player.kills}-${player.deaths}-${player.assists}`);
    cell(row, `${player.headshot_percent.toFixed(0)}%`);
    cell(row, player.adr.toFixed(1));
    cell(row, `${player.kast.toFixed(1)}%`);
    cell(row, `${player.opening_kills}-${player.opening_deaths}`);
    const context = player.kill_context || {};
    const blind = `${context.blinded_enemy_kills ?? 0}-${context.deaths_while_blind ?? 0}`;
    const wall = `${context.wallbang_kills ?? 0}-${context.wallbang_deaths ?? 0}`;
    const smoke = `${context.smoke_kills ?? 0}-${context.smoke_deaths ?? 0}`;
    const air = `${context.airborne_kills ?? 0}-${context.deaths_to_airborne_killer ?? 0}`;
    const speed = `${speedValue(context.speed_on_kill?.average)}-${speedValue(context.killer_speed_on_death?.average)}`;
    if (state.expandedGroups.killContext) {
      cell(row, blind, "demo-group-cell killContext-cell");
      cell(row, wall, "demo-group-cell killContext-cell");
      cell(row, smoke, "demo-group-cell killContext-cell");
      cell(row, air, "demo-group-cell killContext-cell");
      cell(row, speed, "demo-group-cell killContext-cell");
    } else {
      cell(row, `${blind} · ${wall} · ${smoke} · ${air} · ${speed}`, "demo-group-cell killContext-cell");
    }
    if (state.expandedGroups.trades) {
      cell(row, player.trade_opportunities ?? 0, "demo-group-cell trades-cell");
      cell(row, player.trade_attempts ?? 0, "demo-group-cell trades-cell");
      cell(row, `${player.trade_kills ?? 0} (${(player.trade_success_percent ?? 0).toFixed(0)}%)`, "demo-group-cell trades-cell");
      cell(row, player.tradeable_deaths ?? 0, "demo-group-cell trades-cell");
      cell(row, player.attempted_tradeable_deaths ?? 0, "demo-group-cell trades-cell");
      cell(row, `${player.traded_deaths ?? 0} (${(player.traded_death_percent ?? 0).toFixed(0)}%)`, "demo-group-cell trades-cell");
    } else {
      cell(row, `${player.trade_kills ?? 0}-${player.traded_deaths ?? 0}`, "demo-group-cell trades-cell");
    }
    if (state.expandedGroups.assistedKills) {
      cell(row, player.assisted_kills?.damage ?? 0, "demo-group-cell assistedKills-cell");
      cell(row, player.assisted_kills?.flash ?? 0, "demo-group-cell assistedKills-cell");
    } else {
      cell(row, player.assisted_kills?.total ?? 0, "demo-group-cell assistedKills-cell");
    }
    if (state.expandedGroups.utility) {
      cell(row, player.enemies_flashed ?? 0, "demo-group-cell utility-cell");
      cell(row, player.flash_assists ?? 0, "demo-group-cell utility-cell");
      cell(row, player.grenade_damage?.high_explosive ?? 0, "demo-group-cell utility-cell");
      cell(row, player.grenade_damage?.fire ?? 0, "demo-group-cell utility-cell");
    } else {
      cell(row, `${player.enemies_flashed ?? 0}/${player.flash_assists ?? 0} · ${player.grenade_damage?.total ?? 0}`, "demo-group-cell utility-cell");
    }
    if (state.expandedGroups.clutches) {
      for (let opponents = 5; opponents >= 1; opponents -= 1) {
        cell(row, player.clutch_wins?.[opponents] ?? 0, "demo-group-cell clutches-cell");
      }
    } else {
      cell(row, [1, 2, 3, 4, 5].reduce((sum, opponents) => sum + (player.clutch_wins?.[opponents] ?? 0), 0), "demo-group-cell clutches-cell");
    }
    if (state.expandedGroups.multikills) {
      for (let kills = 5; kills >= 1; kills -= 1) {
        cell(row, player.kill_rounds?.[kills] ?? 0, "demo-group-cell multikills-cell");
      }
    } else {
      cell(row, [1, 2, 3, 4, 5].reduce((sum, kills) => sum + (player.kill_rounds?.[kills] ?? 0), 0), "demo-group-cell multikills-cell");
    }
    const ratingClass = player.rating >= 1.10 ? "rating-good" : player.rating <= 0.90 ? "rating-bad" : "rating-average";
    cell(row, player.rating.toFixed(2), `demo-rating ${ratingClass}`);
    markGroupBoundaries(row);
    return row;
  }

  function markGroupBoundaries(row) {
    for (const group of ["killContext", "trades", "assistedKills", "utility", "clutches", "multikills"]) {
      const cells = [...row.cells].filter(item => item.classList.contains(`${group}-cell`));
      cells[0]?.classList.add("demo-group-start");
      cells.at(-1)?.classList.add("demo-group-end");
    }
  }

  function regularHeader(row, label) {
    const th = document.createElement("th");
    if (label === "EF") th.title = "Enemies flashed";
    if (label === "FA") th.title = "Flash assists";
    th.rowSpan = 2;
    sortableHeader(th, label, {
      Player: sortSpecs.player,
      Rnds: sortSpecs.rounds,
      "K-D-A": sortSpecs.kda,
      "HS%": sortSpecs.hs,
      ADR: sortSpecs.adr,
      KAST: sortSpecs.kast,
      Opening: sortSpecs.opening,
      Rating: sortSpecs.rating
    }[label]);
    row.appendChild(th);
  }

  function groupHeader(topRow, detailRow, group, label, labels, collapsedLabel = "Total") {
    const expanded = state.expandedGroups[group];
    const th = document.createElement("th");
    th.colSpan = expanded ? labels.length : 1;
    th.className = `demo-toggle-heading ${group}-heading demo-group-start demo-group-end`;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "demo-column-toggle";
    button.setAttribute("aria-expanded", String(expanded));
    button.textContent = `${label} ${expanded ? "▾" : "▸"}`;
    button.addEventListener("click", () => toggleColumnGroup(group));
    th.appendChild(button);
    topRow.appendChild(th);
    const details = expanded ? labels : [collapsedLabel];
    details.forEach((detail, index) => {
      const child = document.createElement("th");
      if (detail === "EF") child.title = "Enemies flashed";
      if (detail === "FA") child.title = "Flash assists";
      if (detail === "Blind K-D") child.title = "Kills against blinded enemies – deaths while blinded";
      if (detail === "Wall K-D") child.title = "Wallbang kills – wallbang deaths";
      if (detail === "Smoke K-D") child.title = "Kills through smoke – deaths through smoke";
      if (detail === "Air K-D") child.title = "Kills while airborne – deaths to airborne killers";
      if (detail === "Spd K-D") child.title = "Average horizontal speed on kills – average horizontal speed of your killers (units/second)";
      if (detail === "B · W · S · A · Spd") child.title = "Blind, wallbang, smoke, airborne, and average killer-speed K-D pairs";
      child.className = `demo-group-detail ${group}-cell`;
      if (index === 0) child.classList.add("demo-group-start");
      if (index === details.length - 1) child.classList.add("demo-group-end");
      sortableHeader(child, detail, groupSortSpec(group, detail));
      detailRow.appendChild(child);
    });
  }

  function groupSortSpec(group, detail) {
    const maps = {
      trades: {
        "K-D": sortSpecs.tradeKD,
        "K Opp": sortSpecs.tradeKOpp,
        "K Att": sortSpecs.tradeKAtt,
        "K (Succ%)": sortSpecs.tradeKResult,
        "D Opp": sortSpecs.tradeDOpp,
        "D Att": sortSpecs.tradeDAtt,
        "D (Succ%)": sortSpecs.tradeDResult
      },
      killContext: {
        "B · W · S · A · Spd": sortSpecs.killContextSummary,
        "Blind K-D": sortSpecs.blindContext,
        "Wall K-D": sortSpecs.wallContext,
        "Smoke K-D": sortSpecs.smokeContext,
        "Air K-D": sortSpecs.airContext,
        "Spd K-D": sortSpecs.speedContext
      },
      assistedKills: {
        Total: sortSpecs.assistedTotal,
        Dmg: sortSpecs.assistedDamage,
        Flash: sortSpecs.assistedFlash
      },
      utility: {
        "EF/FA · Dmg": sortSpecs.utilitySummary,
        EF: sortSpecs.ef,
        FA: sortSpecs.fa,
        "HE Dmg": sortSpecs.heDamage,
        "Fire Dmg": sortSpecs.fireDamage
      },
      clutches: {
        Total: sortSpecs.clutchTotal,
        "1v5": sortSpecs.clutch5,
        "1v4": sortSpecs.clutch4,
        "1v3": sortSpecs.clutch3,
        "1v2": sortSpecs.clutch2,
        "1v1": sortSpecs.clutch1
      },
      multikills: {
        Total: sortSpecs.multikillTotal,
        "5K": sortSpecs.kills5,
        "4K": sortSpecs.kills4,
        "3K": sortSpecs.kills3,
        "2K": sortSpecs.kills2,
        "1K": sortSpecs.kills1
      }
    };
    return maps[group]?.[detail];
  }

  function sortableHeader(th, label, spec) {
    if (!spec) {
      th.textContent = label;
      return;
    }
    const button = document.createElement("button");
    th.classList.add("demo-sort-heading");
    button.type = "button";
    button.className = "demo-sort-button";
    const active = state.scoreboardSort?.id === spec.id;
    const mode = active ? spec.modes[state.scoreboardSort.mode] : null;
    th.setAttribute("aria-sort", active ? (mode.direction === "asc" ? "ascending" : "descending") : "none");
    button.classList.toggle("active", active);
    button.textContent = active
      ? spec.modes.length === 1 ? `${label} •` : `${label} · ${mode.label}`
      : label;
    button.title = active ? `Sorted by ${mode.label}; click for next mode` : `Sort by ${spec.modes[0].label}`;
    button.addEventListener("click", () => cycleScoreboardSort(spec));
    th.appendChild(button);
  }

  function cycleScoreboardSort(spec) {
    if (state.scoreboardSort?.id !== spec.id) {
      state.scoreboardSort = { id: spec.id, mode: 0, spec };
    } else if (state.scoreboardSort.mode + 1 < spec.modes.length) {
      state.scoreboardSort = { id: spec.id, mode: state.scoreboardSort.mode + 1, spec };
    } else {
      state.scoreboardSort = null;
    }
    rerenderScoreboard();
  }

  function sortedPlayers(players) {
    if (!state.scoreboardSort) return players;
    const mode = state.scoreboardSort.spec.modes[state.scoreboardSort.mode];
    return players.map((player, index) => ({ player, index })).sort((a, b) => {
      const left = mode.value(a.player);
      const right = mode.value(b.player);
      let comparison;
      if (typeof left === "string" || typeof right === "string") {
        comparison = String(left).localeCompare(String(right));
      } else {
        comparison = Number(left) - Number(right);
      }
      if (mode.direction !== "asc") comparison *= -1;
      return comparison || a.index - b.index;
    }).map(item => item.player);
  }

  function rerenderScoreboard() {
    const scrollPositions = [...document.querySelectorAll(".demo-team .table-wrap")].map(wrap => wrap.scrollLeft);
    render(state.result);
    document.querySelectorAll(".demo-team .table-wrap").forEach((wrap, index) => {
      wrap.scrollLeft = scrollPositions[index] || 0;
    });
  }

  function toggleColumnGroup(group) {
    state.scoreboardSort = null;
    state.expandedGroups[group] = !state.expandedGroups[group];
    rerenderScoreboard();
  }

  function scoreboardColumnWidths() {
    const widths = [160, 58, 90, 62, 72, 72, 82];
    widths.push(...(state.expandedGroups.killContext ? [88, 88, 94, 82, 96] : [236]));
    widths.push(...(state.expandedGroups.trades ? [58, 54, 96, 58, 54, 96] : [88]));
    widths.push(...(state.expandedGroups.assistedKills ? [68, 68] : [90]));
    widths.push(...(state.expandedGroups.utility ? [58, 58, 82, 82] : [132]));
    widths.push(...(state.expandedGroups.clutches ? [55, 55, 55, 55, 55] : [82]));
    widths.push(...(state.expandedGroups.multikills ? [55, 55, 55, 55, 55] : [92]));
    widths.push(72);
    return widths;
  }

  function scoreboardColumns(table) {
    const colgroup = document.createElement("colgroup");
    const widths = scoreboardColumnWidths();
    for (const width of widths) {
      const column = document.createElement("col");
      column.style.width = `${width}px`;
      colgroup.appendChild(column);
    }
    table.style.minWidth = `${widths.reduce((sum, width) => sum + width, 0)}px`;
    table.appendChild(colgroup);
  }

  function renderTeam(team, index, outcome) {
    const section = document.createElement("section");
    section.className = "demo-team";
    const heading = document.createElement("div");
    heading.className = "demo-team-head";
    const name = document.createElement("h3");
    name.textContent = team.name || `Team ${index + 1}`;
    const score = document.createElement("span");
    score.className = `demo-team-score${outcome ? ` score-${outcome}` : ""}`;
    score.textContent = Number.isFinite(team.score) ? team.score : "—";
    heading.append(name, score);

    const wrap = document.createElement("div");
    wrap.className = "table-wrap";
    const table = document.createElement("table");
    table.className = `demo-score-table${state.expandedGroups.killContext ? " kill-context-expanded" : ""}${state.expandedGroups.trades ? " trades-expanded" : ""}${state.expandedGroups.assistedKills ? " assisted-kills-expanded" : ""}${state.expandedGroups.utility ? " utility-expanded" : ""}${state.expandedGroups.clutches ? " clutches-expanded" : ""}${state.expandedGroups.multikills ? " multikills-expanded" : ""}`;
    table.setAttribute("aria-label", `${team.name || `Team ${index + 1}`} player statistics`);
    scoreboardColumns(table);
    const thead = document.createElement("thead");
    const header = document.createElement("tr");
    const detailHeader = document.createElement("tr");
    ["Player", "Rnds", "K-D-A", "HS%", "ADR", "KAST", "Opening"]
      .forEach(label => regularHeader(header, label));
    groupHeader(header, detailHeader, "killContext", "Kill context", ["Blind K-D", "Wall K-D", "Smoke K-D", "Air K-D", "Spd K-D"], "B · W · S · A · Spd");
    groupHeader(header, detailHeader, "trades", "Trades", ["K Opp", "K Att", "K (Succ%)", "D Opp", "D Att", "D (Succ%)"], "K-D");
    groupHeader(header, detailHeader, "assistedKills", "Assisted K", ["Dmg", "Flash"]);
    groupHeader(header, detailHeader, "utility", "Utility", ["EF", "FA", "HE Dmg", "Fire Dmg"], "EF/FA · Dmg");
    groupHeader(header, detailHeader, "clutches", "Clutches", ["1v5", "1v4", "1v3", "1v2", "1v1"]);
    groupHeader(header, detailHeader, "multikills", "Kill rounds", ["5K", "4K", "3K", "2K", "1K"]);
    regularHeader(header, "Rating");
    thead.append(header, detailHeader);
    const body = document.createElement("tbody");
    sortedPlayers(team.players).forEach(player => body.appendChild(playerRow(player)));
    if (index === 0) table.appendChild(thead);
    table.appendChild(body);
    wrap.appendChild(table);
    section.append(heading, wrap);
    return section;
  }

  function render(result) {
    const teams = Array.isArray(result.teams) ? result.teams : [];
    const score = teams.length >= 2 && teams.every(team => Number.isFinite(team.score)) ? `${teams[0].score}–${teams[1].score}` : "Unknown";
    $("demoSummary").replaceChildren(
      summaryCard("File", state.file?.name || "Demo"),
      summaryCard("Match ID", result.provider_match_id || `SHA ${String(result.demo_sha256 || "").slice(0, 12)}…`),
      summaryCard("Map", result.map || "Unknown"),
      summaryCard("Rounds", String(result.rounds || 0)),
      summaryCard("Score", score)
    );
    const finiteScores = teams.map(team => team.score).filter(Number.isFinite);
    const highScore = finiteScores.length ? Math.max(...finiteScores) : null;
    const lowScore = finiteScores.length ? Math.min(...finiteScores) : null;
    $("demoTeams").replaceChildren(...teams.map((team, index) => {
      const outcome = highScore === lowScore || !Number.isFinite(team.score)
        ? ""
        : team.score === highScore ? "winner" : "loser";
      return renderTeam(team, index, outcome);
    }));
    $("demoResults").hidden = false;
  }

  async function parseDemo() {
    if (!state.file) return;
    state.diagnostics = null;
    $("demoDiagnosticsButton").hidden = true;
    $("demoParseButton").disabled = true;
    setStatus("Loading the browser demo parser…");
    try {
      await ensureWorker();
      const data = await readDemo(state.file);
      if (data.byteLength > 450 * 1024 * 1024) {
        throw new Error("The uncompressed demo exceeds the 450 MB browser prototype limit.");
      }
      setStatus("Fingerprinting and parsing the demo locally…");
      const result = await parseWithWorker(state.file.name.replace(/\.gz$/i, ""), data);
      if (!result || result.error) throw new Error(result?.error || "The parser returned no match data.");
      state.result = result;
      render(result);
      setStatus(`Parsed ${result.rounds} rounds and ${result.player_count} players.`);
    } catch (error) {
      const nextStep = state.diagnostics ? " Download diagnostics and send me the JSON." : "";
      setStatus((error.message || "The demo could not be parsed.") + nextStep, true);
    } finally {
      $("demoParseButton").disabled = !state.file;
    }
  }

  function clear() {
    state.file = null;
    state.result = null;
    state.scoreboardSort = null;
    state.diagnostics = null;
    $("demoInput").value = "";
    $("demoFileLabel").textContent = "Choose a FACEIT or CS2 demo";
    $("demoParseButton").disabled = true;
    $("demoClearButton").disabled = true;
    $("demoDiagnosticsButton").hidden = true;
    $("demoResults").hidden = true;
    setStatus("Choose one demo file.");
  }

  function downloadJson() {
    if (!state.result) return;
    const blob = new Blob([JSON.stringify(state.result, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${(state.file?.name || "demo").replace(/\.dem(?:\.gz)?$/i, "")}-nickstats.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadDiagnostics() {
    if (!state.diagnostics) return;
    const blob = new Blob([JSON.stringify(state.diagnostics, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${(state.file?.name || "demo").replace(/\.dem(?:\.gz)?$/i, "")}-diagnostics.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  $("csstatsDataTab").addEventListener("click", () => switchSource("csstats"));
  $("demoDataTab").addEventListener("click", () => switchSource("demo"));
  $("demoInput").addEventListener("change", event => chooseFile(event.target.files[0]));
  $("demoParseButton").addEventListener("click", parseDemo);
  $("demoClearButton").addEventListener("click", clear);
  $("demoDiagnosticsButton").addEventListener("click", downloadDiagnostics);
  $("demoDownloadButton").addEventListener("click", downloadJson);

  const drop = $("demoDropZone");
  ["dragenter", "dragover"].forEach(type => drop.addEventListener(type, event => {
    event.preventDefault();
    drop.classList.add("dragging");
  }));
  ["dragleave", "drop"].forEach(type => drop.addEventListener(type, event => {
    event.preventDefault();
    drop.classList.remove("dragging");
  }));
  drop.addEventListener("drop", event => chooseFile(event.dataTransfer.files[0]));
})();
