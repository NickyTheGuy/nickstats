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
    expandedGroups: { trades: false, assistedKills: false, utility: false, clutches: false, multikills: false }
  };

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
      const worker = new Worker("./js/demo-worker.js?v=20260905-8");
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
    return row;
  }

  function regularHeader(row, label, rowSpan = 3) {
    const th = document.createElement("th");
    th.textContent = label;
    if (label === "EF") th.title = "Enemies flashed";
    if (label === "FA") th.title = "Flash assists";
    th.rowSpan = rowSpan;
    row.appendChild(th);
  }

  function groupHeader(topRow, detailRow, group, label, labels, collapsedLabel = "Total") {
    const expanded = state.expandedGroups[group];
    const th = document.createElement("th");
    th.colSpan = expanded ? labels.length : 1;
    th.rowSpan = 2;
    th.className = `demo-toggle-heading ${group}-heading`;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "demo-column-toggle";
    button.setAttribute("aria-expanded", String(expanded));
    button.textContent = `${label} ${expanded ? "▾" : "▸"}`;
    button.addEventListener("click", () => toggleColumnGroup(group));
    th.appendChild(button);
    topRow.appendChild(th);
    (expanded ? labels : [collapsedLabel]).forEach(detail => {
      const child = document.createElement("th");
      child.textContent = detail;
      if (detail === "EF") child.title = "Enemies flashed";
      if (detail === "FA") child.title = "Flash assists";
      child.className = `demo-group-detail ${group}-cell`;
      detailRow.appendChild(child);
    });
  }

  function tradeHeader(topRow, middleRow, detailRow) {
    const expanded = state.expandedGroups.trades;
    const th = document.createElement("th");
    th.colSpan = expanded ? 6 : 1;
    th.rowSpan = expanded ? 1 : 3;
    th.className = "demo-toggle-heading trades-heading";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "demo-column-toggle";
    button.setAttribute("aria-expanded", String(expanded));
    button.textContent = expanded ? "Trades ▾" : "Trade K-D ▸";
    button.addEventListener("click", () => toggleColumnGroup("trades"));
    th.appendChild(button);
    topRow.appendChild(th);
    if (!expanded) return;
    for (const label of ["Trade K", "Trade D"]) {
      const group = document.createElement("th");
      group.colSpan = 3;
      group.className = "demo-trade-subhead trades-cell";
      group.textContent = label;
      middleRow.appendChild(group);
    }
    for (const label of ["Opp", "Att", "K (Succ%)", "Opp", "Att", "D (Succ%)"]) {
      const child = document.createElement("th");
      child.className = "demo-group-detail trades-cell";
      child.textContent = label;
      detailRow.appendChild(child);
    }
  }

  function toggleColumnGroup(group) {
    const scrollPositions = [...document.querySelectorAll(".demo-team .table-wrap")].map(wrap => wrap.scrollLeft);
    state.expandedGroups[group] = !state.expandedGroups[group];
    render(state.result);
    document.querySelectorAll(".demo-team .table-wrap").forEach((wrap, index) => {
      wrap.scrollLeft = scrollPositions[index] || 0;
    });
  }

  function scoreboardColumnWidths() {
    const widths = [160, 58, 90, 62, 72, 72, 82];
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
    table.className = `demo-score-table${state.expandedGroups.trades ? " trades-expanded" : ""}${state.expandedGroups.assistedKills ? " assisted-kills-expanded" : ""}${state.expandedGroups.utility ? " utility-expanded" : ""}${state.expandedGroups.clutches ? " clutches-expanded" : ""}${state.expandedGroups.multikills ? " multikills-expanded" : ""}`;
    table.setAttribute("aria-label", `${team.name || `Team ${index + 1}`} player statistics`);
    scoreboardColumns(table);
    const thead = document.createElement("thead");
    const header = document.createElement("tr");
    const subgroupHeader = document.createElement("tr");
    const detailHeader = document.createElement("tr");
    ["Player", "Rnds", "K-D-A", "HS%", "ADR", "KAST", "Opening"]
      .forEach(label => regularHeader(header, label));
    tradeHeader(header, subgroupHeader, detailHeader);
    groupHeader(header, detailHeader, "assistedKills", "Assisted K", ["Dmg", "Flash"]);
    groupHeader(header, detailHeader, "utility", "Utility", ["EF", "FA", "HE Dmg", "Fire Dmg"], "EF/FA · Dmg");
    groupHeader(header, detailHeader, "clutches", "Clutches", ["1v5", "1v4", "1v3", "1v2", "1v1"]);
    groupHeader(header, detailHeader, "multikills", "Kill rounds", ["5K", "4K", "3K", "2K", "1K"]);
    regularHeader(header, "Rating");
    thead.append(header, subgroupHeader, detailHeader);
    const body = document.createElement("tbody");
    team.players.forEach(player => body.appendChild(playerRow(player)));
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
