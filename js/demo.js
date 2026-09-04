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
    rejectParse: null
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
      const worker = new Worker("./js/demo-worker.js?v=20260904-4");
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
    const steam = document.createElement("small");
    steam.textContent = player.steam_id || "No Steam ID";
    nameCell.appendChild(steam);
    row.appendChild(nameCell);
    cell(row, `${player.kills}-${player.deaths}`);
    cell(row, player.assists);
    cell(row, `${player.headshot_percent.toFixed(0)}%`);
    cell(row, player.adr.toFixed(1));
    cell(row, `${player.kast.toFixed(1)}%`);
    cell(row, `${player.opening_kills}-${player.opening_deaths}`);
    cell(row, player.multikill_rounds);
    cell(row, player.rating.toFixed(2), "demo-rating");
    return row;
  }

  function renderTeam(team, index) {
    const section = document.createElement("section");
    section.className = "demo-team";
    const heading = document.createElement("div");
    heading.className = "demo-team-head";
    const name = document.createElement("h3");
    name.textContent = team.name || `Team ${index + 1}`;
    const score = document.createElement("span");
    score.className = "demo-team-score";
    score.textContent = Number.isFinite(team.score) ? team.score : "—";
    heading.append(name, score);

    const wrap = document.createElement("div");
    wrap.className = "table-wrap";
    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const header = document.createElement("tr");
    ["Player", "K-D", "A", "HS%", "ADR", "KAST", "Opening", "2K+ rounds", "Rating"].forEach(label => {
      const th = document.createElement("th");
      th.textContent = label;
      header.appendChild(th);
    });
    thead.appendChild(header);
    const body = document.createElement("tbody");
    team.players.forEach(player => body.appendChild(playerRow(player)));
    table.append(thead, body);
    wrap.appendChild(table);
    section.append(heading, wrap);
    return section;
  }

  function render(result) {
    const teams = Array.isArray(result.teams) ? result.teams : [];
    const score = teams.length >= 2 && teams.every(team => Number.isFinite(team.score)) ? `${teams[0].score}–${teams[1].score}` : "Unknown";
    $("demoSummary").replaceChildren(
      summaryCard("File", state.file?.name || "Demo"),
      summaryCard("Map", result.map || "Unknown"),
      summaryCard("Rounds", String(result.rounds || 0)),
      summaryCard("Score", score)
    );
    $("demoTeams").replaceChildren(...teams.map(renderTeam));
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
      setStatus("Parsing rounds and player events locally…");
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
