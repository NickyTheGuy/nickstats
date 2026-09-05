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
    scoreboardSort: null,
    sideFilter: "ALL",
    resultView: "scoreboard",
    expandedWeaponPlayers: new Set(),
    weaponSorts: new Map()
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
    movingContext: { id: "movingContext", modes: [
      { label: "K", value: player => player.kill_context?.moving_kills ?? 0 },
      { label: "D", value: player => player.kill_context?.deaths_to_moving_killer ?? 0, direction: "asc" }
    ] },
    stillContext: { id: "stillContext", modes: [
      { label: "K", value: player => player.kill_context?.still_kills ?? 0 },
      { label: "D", value: player => player.kill_context?.deaths_to_still_killer ?? 0, direction: "asc" }
    ] },
    runningContext: { id: "runningContext", modes: [
      { label: "K", value: player => player.kill_context?.running_kills ?? 0 },
      { label: "D", value: player => player.kill_context?.deaths_to_running_killer ?? 0, direction: "asc" }
    ] },
    speedContext: { id: "speedContext", modes: [
      { label: "K", value: player => player.kill_context?.speed_on_kill?.average_percent_of_max ?? -1 },
      { label: "D", value: player => player.kill_context?.killer_speed_on_death?.average_percent_of_max ?? -1 }
    ] },
    killContextSummary: { id: "killContextSummary", modes: [
      { label: "K", value: player => player.kill_context?.unfair_kills ?? 0 },
      { label: "D", value: player => player.kill_context?.unfair_deaths ?? 0, direction: "asc" }
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
      const worker = new Worker("./js/demo-worker.js?v=20260905-35");
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
    state.expandedWeaponPlayers.clear();
    state.weaponSorts.clear();
    setSideFilter("ALL", false);
    setResultView("scoreboard");
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
    return Number.isFinite(value) ? `${value.toFixed(0)}%` : "—";
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
    const moving = `${context.moving_kills ?? 0}-${context.deaths_to_moving_killer ?? 0}`;
    const still = `${context.still_kills ?? 0}-${context.deaths_to_still_killer ?? 0}`;
    const running = `${context.running_kills ?? 0}-${context.deaths_to_running_killer ?? 0}`;
    const unfair = `${context.unfair_kills ?? 0}-${context.unfair_deaths ?? 0}`;
    const speed = `${speedValue(context.speed_on_kill?.average_percent_of_max)}-${speedValue(context.killer_speed_on_death?.average_percent_of_max)}`;
    if (state.expandedGroups.killContext) {
      cell(row, blind, "demo-group-cell killContext-cell");
      cell(row, wall, "demo-group-cell killContext-cell");
      cell(row, smoke, "demo-group-cell killContext-cell");
      cell(row, air, "demo-group-cell killContext-cell");
      cell(row, moving, "demo-group-cell killContext-cell");
      cell(row, still, "demo-group-cell killContext-cell");
      cell(row, running, "demo-group-cell killContext-cell");
      cell(row, speed, "demo-group-cell killContext-cell");
    } else {
      cell(row, unfair, "demo-group-cell killContext-cell");
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
      if (detail === "Move K-D") child.title = "Kills while moving above 1 unit/second – deaths to a moving killer";
      if (detail === "Still K-D") child.title = "Kills while moving at most 1 unit/second – deaths to a stationary killer";
      if (detail === "Run K-D") child.title = "Kills by a player moving above 34% of the held weapon's maximum speed – deaths to such a killer";
      if (detail === "Spd% K-D") child.title = "Average horizontal killer speed as a percentage of the held weapon maximum: your kills – your deaths";
      if (detail === "Unfair K-D") child.title = "Unique kills and deaths involving a blinded victim, wall penetration, smoke, an airborne killer, or a running killer; overlaps count once";
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
        "Unfair K-D": sortSpecs.killContextSummary,
        "Blind K-D": sortSpecs.blindContext,
        "Wall K-D": sortSpecs.wallContext,
        "Smoke K-D": sortSpecs.smokeContext,
        "Air K-D": sortSpecs.airContext,
        "Move K-D": sortSpecs.movingContext,
        "Still K-D": sortSpecs.stillContext,
        "Run K-D": sortSpecs.runningContext,
        "Spd% K-D": sortSpecs.speedContext
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
    widths.push(...(state.expandedGroups.killContext ? [88, 88, 94, 82, 88, 88, 88, 96] : [104]));
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
    groupHeader(header, detailHeader, "killContext", "Kill context", ["Blind K-D", "Wall K-D", "Smoke K-D", "Air K-D", "Move K-D", "Still K-D", "Run K-D", "Spd% K-D"], "Unfair K-D");
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

  function weaponName(id) {
    const names = {
      ak47: "AK-47", aug: "AUG", awp: "AWP", bizon: "PP-Bizon", cz75a: "CZ75-Auto",
      deagle: "Desert Eagle", elite: "Dual Berettas", famas: "FAMAS", fiveseven: "Five-SeveN",
      g3sg1: "G3SG1", galilar: "Galil AR", glock: "Glock-18", hkp2000: "P2000",
      m249: "M249", m4a1: "M4A4", m4a1_silencer: "M4A1-S", mac10: "MAC-10",
      mag7: "MAG-7", mp5sd: "MP5-SD", mp7: "MP7", mp9: "MP9", negev: "Negev",
      nova: "Nova", p250: "P250", p90: "P90", revolver: "R8 Revolver", sawedoff: "Sawed-Off",
      scar20: "SCAR-20", sg556: "SG 553", ssg08: "SSG 08", taser: "Zeus x27",
      tec9: "Tec-9", ump45: "UMP-45", usp_silencer: "USP-S", xm1014: "XM1014",
      hegrenade: "HE Grenade", flashbang: "Flashbang", smokegrenade: "Smoke Grenade",
      decoy: "Decoy", fire: "Molotov / Incendiary", knife: "Knife"
    };
    return names[id] || String(id || "Unknown").replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());
  }

  function renderWeaponPlayer(player) {
    const details = document.createElement("details");
    details.className = "demo-weapon-player";
    const identity = duelIdentity(player.steam_id, player.name);
    details.open = state.expandedWeaponPlayers.has(identity);
    details.addEventListener("toggle", () => {
      if (details.open) state.expandedWeaponPlayers.add(identity);
      else state.expandedWeaponPlayers.delete(identity);
    });
    const summary = document.createElement("summary");
    const summaryMain = document.createElement("span");
    summaryMain.className = "demo-weapon-summary-main";
    const name = document.createElement("strong");
    name.textContent = player.name || "Unknown player";
    const action = document.createElement("span");
    action.className = "demo-weapon-action";
    action.setAttribute("aria-hidden", "true");
    const totals = document.createElement("span");
    totals.className = "demo-weapon-totals";
    const weapons = Array.isArray(player.weapon_stats) ? player.weapon_stats : [];
    totals.textContent = `${weapons.reduce((sum, stat) => sum + (stat.kills || 0), 0)} kills · ${weapons.reduce((sum, stat) => sum + (stat.shots || 0), 0)} shots`;
    summaryMain.append(name, action);
    summary.append(summaryMain, totals);
    details.appendChild(summary);

    const wrap = document.createElement("div");
    wrap.className = "table-wrap";
    const table = document.createElement("table");
    table.className = "demo-weapon-table";
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    const columns = [
      ["Weapon", "weapon"],
      ["Kills", "kills"],
      ["Shots", "shots"],
      ["Damage", "damage"],
      ["Rounds used", "rounds_used"]
    ];
    columns.forEach(([label, field]) => {
      const th = document.createElement("th");
      weaponSortableHeader(th, label, field, identity);
      headRow.appendChild(th);
    });
    head.appendChild(headRow);
    const body = document.createElement("tbody");
    sortedWeapons(weapons, identity).forEach(stat => {
      const row = document.createElement("tr");
      cell(row, weaponName(stat.weapon));
      cell(row, stat.kills || 0);
      cell(row, stat.shots || 0);
      cell(row, stat.damage || 0);
      cell(row, stat.rounds_used || 0);
      body.appendChild(row);
    });
    if (!weapons.length) {
      const row = document.createElement("tr");
      const empty = document.createElement("td");
      empty.colSpan = 5;
      empty.className = "empty";
      empty.textContent = "No weapon events were recorded.";
      row.appendChild(empty);
      body.appendChild(row);
    }
    table.append(head, body);
    wrap.appendChild(table);
    details.appendChild(wrap);
    return details;
  }

  function weaponSortableHeader(th, label, field, identity) {
    const active = state.weaponSorts.get(identity) === field;
    const button = document.createElement("button");
    th.classList.add("demo-sort-heading");
    th.setAttribute("aria-sort", active ? (field === "weapon" ? "ascending" : "descending") : "none");
    button.type = "button";
    button.className = "demo-sort-button";
    button.classList.toggle("active", active);
    button.textContent = active ? `${label} •` : label;
    button.title = active ? "Return to the original weapon order" : `Sort by ${label}`;
    button.addEventListener("click", () => {
      if (active) state.weaponSorts.delete(identity);
      else state.weaponSorts.set(identity, field);
      rerenderWeapons();
    });
    th.appendChild(button);
  }

  function sortedWeapons(weapons, identity) {
    const field = state.weaponSorts.get(identity);
    if (!field) return weapons;
    return weapons.map((weapon, index) => ({ weapon, index })).sort((left, right) => {
      const comparison = field === "weapon"
        ? weaponName(left.weapon.weapon).localeCompare(weaponName(right.weapon.weapon))
        : (right.weapon[field] || 0) - (left.weapon[field] || 0);
      return comparison || left.index - right.index;
    }).map(entry => entry.weapon);
  }

  function rerenderWeapons() {
    if (!state.result) return;
    $("demoWeapons").replaceChildren(...teamsForSide(state.result).map(renderWeaponTeam));
  }

  function renderWeaponTeam(team) {
    const section = document.createElement("section");
    section.className = "demo-weapon-team";
    const heading = document.createElement("h4");
    heading.textContent = team.name || "Team";
    section.appendChild(heading);
    (team.players || []).forEach(player => section.appendChild(renderWeaponPlayer(player)));
    return section;
  }

  function duelIdentity(steamId, name) {
    return steamId ? `steam:${steamId}` : `name:${String(name || "").toLocaleLowerCase()}`;
  }

  function renderDuelMatrix(teams) {
    const players = teams.flatMap((team, teamIndex) =>
      (team.players || []).map(player => ({ player, teamIndex, teamName: team.name || `Team ${teamIndex + 1}` }))
    );
    const wrap = document.createElement("div");
    wrap.className = "table-wrap demo-duel-matrix-wrap";
    const table = document.createElement("table");
    table.className = "demo-duel-matrix";
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    const corner = document.createElement("th");
    corner.textContent = "K-D ↓ / Opponent →";
    corner.className = "duel-corner";
    headRow.appendChild(corner);
    players.forEach((entry, index) => {
      const th = document.createElement("th");
      th.textContent = entry.player.name || "Unknown";
      th.title = entry.teamName;
      if (index > 0 && entry.teamIndex !== players[index - 1].teamIndex) th.classList.add("duel-team-column-start");
      headRow.appendChild(th);
    });
    head.appendChild(headRow);

    const body = document.createElement("tbody");
    players.forEach((rowEntry, rowIndex) => {
      const row = document.createElement("tr");
      if (rowIndex > 0 && rowEntry.teamIndex !== players[rowIndex - 1].teamIndex) row.classList.add("duel-team-row-start");
      const rowName = document.createElement("th");
      rowName.scope = "row";
      rowName.textContent = rowEntry.player.name || "Unknown";
      rowName.title = rowEntry.teamName;
      row.appendChild(rowName);
      const duelMap = new Map((rowEntry.player.duels || []).map(duel => [
        duelIdentity(duel.opponent_steam_id, duel.opponent), duel
      ]));
      players.forEach((columnEntry, columnIndex) => {
        const td = document.createElement("td");
        if (columnIndex > 0 && columnEntry.teamIndex !== players[columnIndex - 1].teamIndex) {
          td.classList.add("duel-team-column-start");
        }
        const duel = duelMap.get(duelIdentity(columnEntry.player.steam_id, columnEntry.player.name));
        if (!duel) {
          td.textContent = "—";
          td.classList.add("duel-unavailable");
        } else {
          const kills = duel.kills || 0;
          const deaths = duel.deaths || 0;
          const differential = kills - deaths;
          td.textContent = `${kills}-${deaths}`;
          td.title = rowEntry === columnEntry
            ? `${rowEntry.player.name}: ${deaths} self-kill${deaths === 1 ? "" : "s"}`
            : `${rowEntry.player.name}: ${kills} kills and ${deaths} deaths against ${columnEntry.player.name}`;
          td.classList.add(differential > 0 ? "duel-positive" : differential < 0 ? "duel-negative" : "duel-even");
        }
        row.appendChild(td);
      });
      body.appendChild(row);
    });
    table.append(head, body);
    wrap.appendChild(table);
    return wrap;
  }

  function renderTradeMatrix(teams) {
    const players = teams.flatMap((team, teamIndex) =>
      (team.players || []).map(player => ({ player, teamIndex, teamName: team.name || `Team ${teamIndex + 1}` }))
    );
    const wrap = document.createElement("div");
    wrap.className = "table-wrap demo-duel-matrix-wrap";
    const table = document.createElement("table");
    table.className = "demo-duel-matrix demo-trade-matrix";
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    const corner = document.createElement("th");
    corner.textContent = "O/A/S ↓ / Teammate →";
    corner.title = "Opportunities / attempts / successes";
    headRow.appendChild(corner);
    players.forEach((entry, index) => {
      const th = document.createElement("th");
      th.textContent = entry.player.name || "Unknown";
      th.title = entry.teamName;
      if (index > 0 && entry.teamIndex !== players[index - 1].teamIndex) th.classList.add("duel-team-column-start");
      headRow.appendChild(th);
    });
    head.appendChild(headRow);

    const body = document.createElement("tbody");
    players.forEach((rowEntry, rowIndex) => {
      const row = document.createElement("tr");
      if (rowIndex > 0 && rowEntry.teamIndex !== players[rowIndex - 1].teamIndex) row.classList.add("duel-team-row-start");
      const rowName = document.createElement("th");
      rowName.scope = "row";
      rowName.textContent = rowEntry.player.name || "Unknown";
      rowName.title = `${rowEntry.teamName} · potential trader`;
      row.appendChild(rowName);
      const matchupMap = new Map((rowEntry.player.trade_matchups || []).map(matchup => [
        duelIdentity(matchup.teammate_steam_id, matchup.teammate), matchup
      ]));
      players.forEach((columnEntry, columnIndex) => {
        const td = document.createElement("td");
        if (columnIndex > 0 && columnEntry.teamIndex !== players[columnIndex - 1].teamIndex) {
          td.classList.add("duel-team-column-start");
        }
        const isSelf = rowEntry === columnEntry;
        const isTeammate = rowEntry.teamIndex === columnEntry.teamIndex;
        if (isSelf || !isTeammate) {
          td.textContent = "—";
          td.classList.add("duel-unavailable");
        } else {
          const matchup = matchupMap.get(duelIdentity(columnEntry.player.steam_id, columnEntry.player.name));
          const opportunities = matchup?.opportunities || 0;
          const attempts = matchup?.attempts || 0;
          const successes = matchup?.successes || 0;
          td.textContent = `${opportunities}/${attempts}/${successes}`;
          td.title = `${rowEntry.player.name} responding to ${columnEntry.player.name}: ${opportunities} opportunities, ${attempts} attempts, ${successes} successes`;
          td.classList.add(successes ? "trade-success" : attempts ? "trade-attempt" : opportunities ? "trade-opportunity" : "trade-none");
        }
        row.appendChild(td);
      });
      body.appendChild(row);
    });
    table.append(head, body);
    wrap.appendChild(table);
    return wrap;
  }

  function teamsForSide(result) {
    const teams = Array.isArray(result.teams) ? result.teams : [];
    if (state.sideFilter === "ALL") return teams;
    return teams.map(team => ({
      ...team,
      score: Number.isFinite(team.side_scores?.[state.sideFilter]) ? team.side_scores[state.sideFilter] : null,
      players: (team.players || []).map(player => {
        const sideStats = player.by_side?.[state.sideFilter];
        return sideStats ? { ...sideStats, by_side: player.by_side } : player;
      })
    }));
  }

  function setSideFilter(side, shouldRender = true) {
    if (!["ALL", "CT", "T"].includes(side)) return;
    state.sideFilter = side;
    document.querySelectorAll("[data-demo-side]").forEach(button => {
      const active = button.dataset.demoSide === side;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    if (shouldRender && state.result) render(state.result);
  }

  function setResultView(view) {
    const panels = {
      scoreboard: "demoScoreboardView",
      duels: "demoDuelsView",
      trades: "demoTradesView",
      weapons: "demoWeaponsView"
    };
    if (!panels[view]) return;
    state.resultView = view;
    document.querySelectorAll("[data-demo-result-view]").forEach(button => {
      const active = button.dataset.demoResultView === view;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    Object.entries(panels).forEach(([name, id]) => {
      $(id).hidden = name !== view;
    });
  }

  function render(result) {
    const teams = teamsForSide(result);
    const sideRounds = teams.reduce((maximum, team) => Math.max(
      maximum,
      ...(team.players || []).map(player => player.rounds_played || 0)
    ), 0);
    const score = teams.length >= 2 && teams.every(team => Number.isFinite(team.score)) ? `${teams[0].score}–${teams[1].score}` : "Unknown";
    $("demoSummary").replaceChildren(
      summaryCard("File", state.file?.name || "Demo"),
      summaryCard("Match ID", result.provider_match_id || `SHA ${String(result.demo_sha256 || "").slice(0, 12)}…`),
      summaryCard("Map", result.map || "Unknown"),
      summaryCard(state.sideFilter === "ALL" ? "Rounds" : `${state.sideFilter} rounds`, String(state.sideFilter === "ALL" ? result.rounds || 0 : sideRounds)),
      summaryCard(state.sideFilter === "ALL" ? "Score" : `${state.sideFilter} wins`, score)
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
    $("demoWeapons").replaceChildren(...teams.map(renderWeaponTeam));
    $("demoTrades").replaceChildren(renderTradeMatrix(teams));
    $("demoDuels").replaceChildren(renderDuelMatrix(teams));
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
    state.expandedWeaponPlayers.clear();
    state.weaponSorts.clear();
    setSideFilter("ALL", false);
    setResultView("scoreboard");
    state.diagnostics = null;
    $("demoInput").value = "";
    $("demoFileLabel").textContent = "Choose a FACEIT or CS2 demo";
    $("demoParseButton").disabled = true;
    $("demoClearButton").disabled = true;
    $("demoDiagnosticsButton").hidden = true;
    $("demoResults").hidden = true;
    setStatus("Choose one demo file.");
  }

  function compactMatchResult(result) {
    const sourceTeams = Array.isArray(result.teams) ? result.teams : [];
    const sourcePlayers = sourceTeams.flatMap(team => team.players || []);
    const playerIndex = new Map(sourcePlayers.map((player, index) => [player, index]));
    const steamIndexes = new Map();
    const nameIndexes = new Map();

    sourcePlayers.forEach((player, index) => {
      if (player.steam_id) {
        const key = String(player.steam_id);
        if (!steamIndexes.has(key)) steamIndexes.set(key, []);
        steamIndexes.get(key).push(index);
      }
      const key = `${player.name || ""}\u0000${Boolean(player.is_bot)}`;
      if (!nameIndexes.has(key)) nameIndexes.set(key, []);
      nameIndexes.get(key).push(index);
    });

    const referenceIndex = (name, steamId, isBot) => {
      const steamMatches = steamId == null ? [] : (steamIndexes.get(String(steamId)) || []);
      if (steamMatches.length === 1) return steamMatches[0];
      const matches = nameIndexes.get(`${name || ""}\u0000${Boolean(isBot)}`) || [];
      return matches.length === 1 ? matches[0] : null;
    };

    const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
    const rounded = value => Math.round(number(value) * 1000) / 1000;
    const countArray = (counts, length = 5) => Array.from({ length }, (_, index) => number(counts?.[index + 1]));
    const speedArray = summary => {
      const samples = number(summary?.samples);
      const percentSamples = number(summary?.percent_samples);
      const total = summary?.total ?? (samples ? number(summary?.average) * samples : 0);
      const percentTotal = summary?.percent_total ?? (percentSamples ? number(summary?.average_percent_of_max) * percentSamples : 0);
      return [
        rounded(total), samples, summary?.maximum == null ? null : rounded(summary.maximum),
        rounded(percentTotal), percentSamples, summary?.maximum_percent_of_max == null ? null : rounded(summary.maximum_percent_of_max)
      ];
    };

    const compactStats = player => {
      if (!player) return null;
      const context = player.kill_context || {};
      const kills = number(player.kills);
      const headshots = player.headshots == null
        ? Math.round(kills * number(player.headshot_percent) / 100)
        : number(player.headshots);
      return {
        rounds: [number(player.rounds_played), number(player.round_wins)],
        kda: [kills, number(player.deaths), number(player.assists), headshots, number(player.damage)],
        kast_rounds: number(player.kast_rounds),
        opening: [number(player.opening_kills), number(player.opening_deaths)],
        trade_k: [number(player.trade_opportunities), number(player.trade_attempts), number(player.trade_kills ?? player.trade_successes)],
        trade_d: [number(player.tradeable_deaths), number(player.attempted_tradeable_deaths), number(player.traded_deaths ?? player.traded_tradeable_deaths)],
        assisted: [number(player.assisted_kills?.damage), number(player.assisted_kills?.flash)],
        utility: [
          number(player.enemies_flashed), number(player.flash_assists),
          number(player.grenade_damage?.high_explosive), number(player.grenade_damage?.fire)
        ],
        context: [
          number(context.blinded_enemy_kills), number(context.deaths_while_blind),
          number(context.kills_while_blind), number(context.deaths_to_blind_killer),
          number(context.wallbang_kills), number(context.wallbang_deaths),
          number(context.penetrations_on_kills), number(context.penetrations_on_deaths),
          number(context.smoke_kills), number(context.smoke_deaths),
          number(context.airborne_kills), number(context.deaths_to_airborne_killer),
          number(context.moving_kills), number(context.deaths_to_moving_killer),
          number(context.still_kills), number(context.deaths_to_still_killer),
          number(context.running_kills), number(context.deaths_to_running_killer),
          number(context.unfair_kills), number(context.unfair_deaths)
        ],
        speed: [...speedArray(context.speed_on_kill), ...speedArray(context.killer_speed_on_death)],
        clutches: countArray(player.clutch_wins),
        kill_rounds: countArray(player.kill_rounds),
        weapons: (player.weapon_stats || []).map(stat => [
          stat.weapon, number(stat.kills), number(stat.shots), number(stat.damage), number(stat.rounds_used)
        ]),
        duels: (player.duels || []).map(duel => [
          referenceIndex(duel.opponent, duel.opponent_steam_id, duel.opponent_is_bot),
          number(duel.kills), number(duel.deaths)
        ]).filter(duel => duel[0] != null),
        trades: (player.trade_matchups || []).map(trade => [
          referenceIndex(trade.teammate, trade.teammate_steam_id, trade.teammate_is_bot),
          number(trade.opportunities), number(trade.attempts), number(trade.successes)
        ]).filter(trade => trade[0] != null)
      };
    };

    const trade = result.trade_definition || {};
    const movement = result.kill_context_definition || {};
    return {
      schema: "nickstats.match/2",
      nickstats_build: "2026.09.05.14",
      parser: [result.parser, result.parser_version],
      id: {
        faceit: result.provider_match_id || null,
        sha256: result.demo_sha256
      },
      map: result.map,
      rounds: result.rounds,
      rules: {
        trade: [
          trade.window_seconds, trade.proximity_units, trade.engagement_lull_seconds,
          trade.bullet_path_tolerance_units, trade.he_damage_caps?.unarmored, trade.he_damage_caps?.armored
        ],
        movement: [movement.still_speed_tolerance_units_per_second, movement.running_threshold_percent_of_weapon_max]
      },
      teams: sourceTeams.map(team => ({
        id: team.id,
        name: team.name,
        score: team.score,
        side_scores: [number(team.side_scores?.T), number(team.side_scores?.CT)],
        players: (team.players || []).map(player => playerIndex.get(player))
      })),
      players: sourcePlayers.map(player => ({
        name: player.name,
        steam_id: player.steam_id,
        ...(player.is_bot ? { bot: true } : {}),
        all: compactStats(player),
        T: compactStats(player.by_side?.T),
        CT: compactStats(player.by_side?.CT)
      }))
    };
  }

  function downloadJson() {
    if (!state.result) return;
    const blob = new Blob([JSON.stringify(compactMatchResult(state.result))], { type: "application/json" });
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
  document.querySelectorAll("[data-demo-side]").forEach(button => {
    button.addEventListener("click", () => setSideFilter(button.dataset.demoSide));
  });
  document.querySelectorAll("[data-demo-result-view]").forEach(button => {
    button.addEventListener("click", () => setResultView(button.dataset.demoResultView));
  });

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
