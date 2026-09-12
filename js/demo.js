(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const MATCH_UPLOAD_ENDPOINT = "/nickstats/api/matches";
  const MATCH_LIST_LIMIT = 25;
  const state = {
    file: null,
    parsedResult: null,
    result: null,
    storedPayload: null,
    selectedMatchID: null,
    matchListOffset: 0,
    matchListCount: 0,
    matchListLoading: false,
    matchListController: null,
    matchDetailLoading: false,
    diagnostics: null,
    uploadToken: "",
    uploadPending: false,
    uploading: false,
    duplicateMatchID: null,
    parsePending: false,
    worker: null,
    workerReady: null,
    resolveReady: null,
    rejectReady: null,
    resolveParse: null,
    rejectParse: null,
    expandedGroups: { combat: false, opening: false, trades: false, clutches: false, multikills: false, objectives: false, killContext: false, movement: false, utility: false },
    scoreboardSort: null,
    sideFilter: "ALL",
    resultView: "scoreboard",
    expandedWeaponPlayers: new Set(),
    weaponSorts: new Map()
  };
  const matchMapFilter = new window.NickStatsFilters.MultiMapFilter("matchMapFilter", {
    onChange: () => loadMatches(0),
    formatLabel: value => String(value || "Unknown").replace(/^de_/, "").replaceAll("_", " ").replace(/\b\w/g, character => character.toUpperCase())
  });
  let demoSideControl;

  const sortSpecs = {
    player: { id: "player", modes: [{ label: "A-Z", value: player => player.name || "", direction: "asc" }] },
    rounds: { id: "rounds", modes: [
      { label: "Played", value: player => player.rounds_played ?? 0 },
      { label: "Won", value: player => player.round_wins ?? 0 }
    ] },
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
    openingKills: oneMode("openingKills", "K", player => player.opening_kills ?? 0),
    openingDeaths: oneMode("openingDeaths", "D", player => player.opening_deaths ?? 0, "asc"),
    openingDiff: oneMode("openingDiff", "Diff", player => (player.opening_kills ?? 0) - (player.opening_deaths ?? 0)),
    openingSuccess: oneMode("openingSuccess", "Success", player => 100 * (player.opening_kills ?? 0) / Math.max(1, (player.opening_kills ?? 0) + (player.opening_deaths ?? 0))),
    combatKills: oneMode("combatKills", "K", player => player.kills ?? 0),
    combatDeaths: oneMode("combatDeaths", "D", player => player.deaths ?? 0, "asc"),
    combatAssists: oneMode("combatAssists", "A", player => player.assists ?? 0),
    kd: oneMode("kd", "K/D", player => (player.kills ?? 0) / Math.max(1, player.deaths ?? 0)),
    damage: oneMode("damage", "Dmg", player => player.damage ?? 0),
    damageReceived: oneMode("damageReceived", "Received", player => player.damage_received ?? 0, "asc"),
    damageDiff: oneMode("damageDiff", "Diff", player => (player.damage ?? 0) - (player.damage_received ?? 0)),
    blindContext: { id: "blindContext", modes: [
      { label: "K", value: player => player.kill_context?.blinded_enemy_kills ?? 0 },
      { label: "D", value: player => player.kill_context?.deaths_while_blind ?? 0, direction: "asc" }
    ] },
    blindKillerContext: { id: "blindKillerContext", modes: [
      { label: "K", value: player => player.kill_context?.kills_while_blind ?? 0 },
      { label: "D", value: player => player.kill_context?.deaths_to_blind_killer ?? 0, direction: "asc" }
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
    equipmentContext: { id: "equipmentContext", modes: [
      { label: "K", value: player => player.kill_context?.equipment_disadvantage_kills ?? 0 },
      { label: "D", value: player => player.kill_context?.equipment_disadvantage_deaths ?? 0, direction: "asc" }
    ] },
    grenadeContext: { id: "grenadeContext", modes: [
      { label: "K", value: player => player.kill_context?.grenade_out_kills ?? 0 },
      { label: "D", value: player => player.kill_context?.grenade_out_deaths ?? 0, direction: "asc" }
    ] },
    knifeContext: { id: "knifeContext", modes: [
      { label: "K", value: player => player.kill_context?.knife_out_kills ?? 0 },
      { label: "D", value: player => player.kill_context?.knife_out_deaths ?? 0, direction: "asc" }
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
    assistedDamage: oneMode("assistedDamage", "Dmg", player => player.assisted_kills?.damage ?? 0),
    assistedFlash: oneMode("assistedFlash", "Flash", player => player.assisted_kills?.flash ?? 0),
    assistedOwnFlash: oneMode("assistedOwnFlash", "Own-flash K", player => player.assisted_kills?.own_flash ?? 0),
    utilitySummary: { id: "utilitySummary", modes: [
      { label: "Dmg", value: player => player.grenade_damage?.total ?? 0 },
      { label: "Thrown", value: player => ["high_explosive", "flashbang", "smoke", "fire", "decoy"].reduce((sum, key) => sum + (player.utility_thrown?.[key] ?? 0), 0) },
      { label: "EF", value: player => player.enemies_flashed ?? 0 },
      { label: "FA", value: player => player.flash_assists ?? 0 }
    ] },
    ef: oneMode("ef", "EF", player => player.enemies_flashed ?? 0),
    fa: oneMode("fa", "FA", player => player.flash_assists ?? 0),
    heDamage: oneMode("heDamage", "HE", player => player.grenade_damage?.high_explosive ?? 0),
    fireDamage: oneMode("fireDamage", "Fire", player => player.grenade_damage?.fire ?? 0),
    heThrown: oneMode("heThrown", "HE", player => player.utility_thrown?.high_explosive ?? 0),
    flashThrown: oneMode("flashThrown", "Flash", player => player.utility_thrown?.flashbang ?? 0),
    smokeThrown: oneMode("smokeThrown", "Smoke", player => player.utility_thrown?.smoke ?? 0),
    fireThrown: oneMode("fireThrown", "Fire", player => player.utility_thrown?.fire ?? 0),
    decoyThrown: oneMode("decoyThrown", "Decoy", player => player.utility_thrown?.decoy ?? 0),
    blindDuration: oneMode("blindDuration", "Blind sec", player => enemyFlashMatchups(player).reduce((sum, row) => sum + (row.blind_duration || 0), 0)),
    bombPlants: oneMode("bombPlants", "Plants", player => player.objectives?.plants ?? 0),
    bombDefuses: oneMode("bombDefuses", "Defuses", player => player.objectives?.defuses ?? 0),
    movementSummary: { id: "movementSummary", modes: [
      { label: "Move K", value: player => player.kill_context?.moving_kills ?? 0 },
      { label: "Run K", value: player => player.kill_context?.running_kills ?? 0 },
      { label: "Air K", value: player => player.kill_context?.airborne_kills ?? 0 }
    ] },
    killSpeedUnits: { id: "killSpeedUnits", modes: [
      { label: "Avg", value: player => player.kill_context?.speed_on_kill?.average ?? -1 },
      { label: "Max", value: player => player.kill_context?.speed_on_kill?.maximum ?? -1 }
    ] },
    killSpeedPercents: { id: "killSpeedPercents", modes: [
      { label: "Avg", value: player => player.kill_context?.speed_on_kill?.average_percent_of_max ?? -1 },
      { label: "Peak", value: player => player.kill_context?.speed_on_kill?.maximum_percent_of_max ?? -1 }
    ] },
    deathSpeedUnits: { id: "deathSpeedUnits", modes: [
      { label: "Avg", value: player => player.kill_context?.killer_speed_on_death?.average ?? -1, direction: "asc" },
      { label: "Max", value: player => player.kill_context?.killer_speed_on_death?.maximum ?? -1, direction: "asc" }
    ] },
    deathSpeedPercents: { id: "deathSpeedPercents", modes: [
      { label: "Avg", value: player => player.kill_context?.killer_speed_on_death?.average_percent_of_max ?? -1, direction: "asc" },
      { label: "Peak", value: player => player.kill_context?.killer_speed_on_death?.maximum_percent_of_max ?? -1, direction: "asc" }
    ] },
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

  function showDiagnosticsDownload(show) {
    const panel = $("demoDiagnostics");
    panel.hidden = !show || !state.diagnostics;
    if (panel.hidden) panel.open = false;
  }

  function parsedMatchDescription(result) {
    return `Parsed ${result.rounds} rounds and ${result.player_count} players.`;
  }

  function updateUploadAuthenticationDisplay() {
    const authenticated = Boolean(state.uploadToken);
    const button = $("demoAuthButton");
    button.textContent = authenticated ? "Change upload token" : "Enter upload token";
    button.classList.toggle("authenticated", authenticated);
  }

  function openUploadAuthentication(message = "") {
    const dialog = $("demoAuthDialog");
    const error = $("demoAuthError");
    error.textContent = message;
    error.hidden = !message;
    $("demoAuthToken").value = "";
    if (!dialog.open) dialog.showModal();
    $("demoAuthToken").focus();
  }

  async function uploadParsedMatch(result = state.parsedResult, { replace = false } = {}) {
    if (!result || state.uploading) return;
    if (!state.uploadToken) {
      state.uploadPending = true;
      $("demoRetryUploadButton").hidden = false;
      openUploadAuthentication("Enter the upload token before this match can be saved.");
      return;
    }

    state.uploading = true;
    state.uploadPending = false;
    const retryButton = $("demoRetryUploadButton");
    const replaceButton = $("demoReplaceUploadButton");
    retryButton.hidden = true;
    retryButton.disabled = true;
    replaceButton.hidden = true;
    replaceButton.disabled = true;
    setStatus(`${parsedMatchDescription(result)} ${replace ? "Replacing the stored match" : "Uploading compact statistics"}…`);

    try {
      const response = await fetch(replace ? `${MATCH_UPLOAD_ENDPOINT}?replace=true` : MATCH_UPLOAD_ENDPOINT, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${state.uploadToken}`,
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(compactMatchResult(result))
      });
      const responseBody = await response.json().catch(() => null);
      if (!response.ok) {
        const error = new Error(responseBody?.reason || `The API returned HTTP ${response.status}.`);
        error.status = response.status;
        throw error;
      }

      const matchID = responseBody?.id == null ? "" : ` as match #${responseBody.id}`;
      state.duplicateMatchID = responseBody?.created === false && !responseBody?.replaced ? responseBody.id : null;
      replaceButton.hidden = state.duplicateMatchID == null;
      const outcome = responseBody?.replaced
        ? "Replaced the stored match"
        : responseBody?.created === false ? "It was already stored" : "Saved to the database";
      const nextStep = state.duplicateMatchID == null ? "" : " Choose Replace stored match to re-import it with the current parser.";
      setStatus(`${parsedMatchDescription(result)} ${outcome}${matchID}.${nextStep}`);
      showDiagnosticsDownload(false);
      await loadMatches(0);
    } catch (error) {
      state.uploadPending = true;
      if (replace) replaceButton.hidden = false;
      else retryButton.hidden = false;
      const reason = error.message || "The API could not be reached.";
      setStatus(`${parsedMatchDescription(result)} Database upload failed: ${reason}`, true);
      showDiagnosticsDownload(true);
      if (error.status === 401) {
        state.uploadToken = "";
        updateUploadAuthenticationDisplay();
        openUploadAuthentication("That upload token was rejected. Enter the current server token.");
      }
    } finally {
      state.uploading = false;
      retryButton.disabled = false;
      replaceButton.disabled = false;
    }
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
      const worker = new Worker("./js/demo-worker.js?v=20260911-10");
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
          state.diagnostics = message.diagnostics || null;
          state.resolveParse?.(message.result);
          state.resolveParse = null;
          state.rejectParse = null;
        } else if (message.type === "status") {
          setStatus(message.message || "Working locally…");
        } else if (message.type === "error") {
          const error = new Error(message.message || "The demo parser failed.");
          state.diagnostics = message.diagnostics || null;
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
    if (!/\.dem(?:\.(?:gz|zst))?$/i.test(file.name) && !/\.(?:gz|zst|zip)$/i.test(file.name)) {
      setStatus("Choose a .dem, .dem.gz, .dem.zst, .zst, or .zip file.", true);
      return;
    }
    state.file = file;
    state.parsedResult = null;
    state.uploadPending = false;
    state.duplicateMatchID = null;
    state.diagnostics = null;
    showDiagnosticsDownload(false);
    $("demoRetryUploadButton").hidden = true;
    $("demoReplaceUploadButton").hidden = true;
    $("demoFileLabel").textContent = `${file.name} · ${formatBytes(file.size)}`;
    $("demoParseButton").disabled = false;
    $("demoClearButton").disabled = false;
    setStatus("Ready to parse. The demo stays inside this browser.");
  }

  async function readDemo(file) {
    if (/\.zip$/i.test(file.name)) return readZipDemo(file);
    if (/\.zst$/i.test(file.name)) {
      return {
        data: await file.arrayBuffer(),
        name: file.name.replace(/\.zst$/i, ""),
        matchTime: null,
        compression: "zstd"
      };
    }
    if (!/\.gz$/i.test(file.name)) {
      return { data: await file.arrayBuffer(), name: file.name, matchTime: null };
    }
    if (!("DecompressionStream" in window)) {
      throw new Error("This browser cannot unpack .gz files. Extract the .dem first and select that file.");
    }
    setStatus("Decompressing demo locally…");
    const stream = file.stream().pipeThrough(new DecompressionStream("gzip"));
    return {
      data: await new Response(stream).arrayBuffer(),
      name: file.name.replace(/\.gz$/i, ""),
      matchTime: await gzipMatchTime(file)
    };
  }

  async function gzipMatchTime(file) {
    if (!/\.gz$/i.test(file.name) || file.size < 10) return null;
    const header = await file.slice(0, 10).arrayBuffer();
    const bytes = new Uint8Array(header);
    if (bytes[0] !== 0x1f || bytes[1] !== 0x8b || bytes[2] !== 8) return null;
    const timestamp = new DataView(header).getUint32(4, true);
    const earliestReasonable = Date.UTC(2012, 0, 1) / 1000;
    const latestReasonable = Date.now() / 1000 + 24 * 60 * 60;
    return timestamp >= earliestReasonable && timestamp <= latestReasonable
      ? { timestamp, source: "gzip_mtime" }
      : null;
  }

  function zipExtendedTimestamp(extra) {
    const view = new DataView(extra.buffer, extra.byteOffset, extra.byteLength);
    let offset = 0;
    while (offset + 4 <= extra.byteLength) {
      const type = view.getUint16(offset, true);
      const size = view.getUint16(offset + 2, true);
      if (offset + 4 + size > extra.byteLength) break;
      if (type === 0x5455 && size >= 5 && (view.getUint8(offset + 4) & 1)) {
        return view.getUint32(offset + 5, true);
      }
      offset += 4 + size;
    }
    return null;
  }

  function zipDosTimestamp(date, time) {
    const year = 1980 + (date >>> 9);
    const month = (date >>> 5) & 15;
    const day = date & 31;
    const hour = time >>> 11;
    const minute = (time >>> 5) & 63;
    const second = (time & 31) * 2;
    if (!month || !day) return null;
    return Date.UTC(year, month - 1, day, hour, minute, second) / 1000;
  }

  async function findZipDemo(file) {
    const tailLength = Math.min(file.size, 65_557);
    const tailOffset = file.size - tailLength;
    const tail = await file.slice(tailOffset).arrayBuffer();
    const tailView = new DataView(tail);
    let eocd = -1;
    for (let offset = tailLength - 22; offset >= 0; offset -= 1) {
      if (tailView.getUint32(offset, true) === 0x06054b50) {
        eocd = offset;
        break;
      }
    }
    if (eocd < 0) throw new Error("This ZIP archive is missing its directory record.");
    const entryCount = tailView.getUint16(eocd + 10, true);
    const directorySize = tailView.getUint32(eocd + 12, true);
    const directoryOffset = tailView.getUint32(eocd + 16, true);
    if (entryCount === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) {
      throw new Error("ZIP64 archives are not supported by this browser prototype.");
    }
    const directory = await file.slice(directoryOffset, directoryOffset + directorySize).arrayBuffer();
    const view = new DataView(directory);
    const bytes = new Uint8Array(directory);
    let offset = 0;
    const demos = [];
    for (let index = 0; index < entryCount && offset + 46 <= directory.byteLength; index += 1) {
      if (view.getUint32(offset, true) !== 0x02014b50) break;
      const flags = view.getUint16(offset + 8, true);
      const method = view.getUint16(offset + 10, true);
      const dosTime = view.getUint16(offset + 12, true);
      const dosDate = view.getUint16(offset + 14, true);
      const compressedSize = view.getUint32(offset + 20, true);
      const uncompressedSize = view.getUint32(offset + 24, true);
      const nameLength = view.getUint16(offset + 28, true);
      const extraLength = view.getUint16(offset + 30, true);
      const commentLength = view.getUint16(offset + 32, true);
      const localOffset = view.getUint32(offset + 42, true);
      const nameStart = offset + 46;
      const name = new TextDecoder((flags & 0x800) ? "utf-8" : "utf-8")
        .decode(bytes.subarray(nameStart, nameStart + nameLength));
      const extra = bytes.subarray(nameStart + nameLength, nameStart + nameLength + extraLength);
      if (/\.dem$/i.test(name)) {
        const extended = zipExtendedTimestamp(extra);
        demos.push({
          name,
          flags,
          method,
          compressedSize,
          uncompressedSize,
          localOffset,
          matchTime: extended
            ? { timestamp: extended, source: "zip_extended_mtime" }
            : { timestamp: zipDosTimestamp(dosDate, dosTime), source: "zip_dos_time" }
        });
      }
      offset = nameStart + nameLength + extraLength + commentLength;
    }
    if (!demos.length) throw new Error("No .dem file was found inside this ZIP archive.");
    return demos.sort((a, b) => b.uncompressedSize - a.uncompressedSize)[0];
  }

  async function readZipDemo(file) {
    if (!("DecompressionStream" in window)) {
      throw new Error("This browser cannot unpack ZIP files. Extract the .dem first and select that file.");
    }
    setStatus("Opening FACEIT archive locally…");
    const entry = await findZipDemo(file);
    if (entry.flags & 1) throw new Error("Password-protected ZIP archives are not supported.");
    if (![0, 8].includes(entry.method)) throw new Error(`Unsupported ZIP compression method ${entry.method}.`);
    if (entry.uncompressedSize > 450 * 1024 * 1024) {
      throw new Error("The uncompressed demo exceeds the 450 MB browser prototype limit.");
    }
    const localHeader = await file.slice(entry.localOffset, entry.localOffset + 30).arrayBuffer();
    const localView = new DataView(localHeader);
    if (localView.getUint32(0, true) !== 0x04034b50) throw new Error("The ZIP demo entry has an invalid local header.");
    const nameLength = localView.getUint16(26, true);
    const extraLength = localView.getUint16(28, true);
    const dataStart = entry.localOffset + 30 + nameLength + extraLength;
    const compressed = file.slice(dataStart, dataStart + entry.compressedSize);
    const data = entry.method === 0
      ? await compressed.arrayBuffer()
      : await new Response(compressed.stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer();
    return { data, name: entry.name.split(/[\\/]/).pop(), matchTime: entry.matchTime?.timestamp ? entry.matchTime : null };
  }

  function formatMatchTime(timestamp) {
    if (!Number.isFinite(timestamp) || timestamp <= 0) return "Unknown";
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(timestamp * 1000));
  }

  function numberValue(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function sumArray(left, right, length) {
    return Array.from({ length }, (_, index) => numberValue(left?.[index]) + numberValue(right?.[index]));
  }

  function mergeMaximum(left, right) {
    const values = [left, right].filter(value => Number.isFinite(Number(value))).map(Number);
    return values.length ? Math.max(...values) : null;
  }

  function mergeSpeed(left, right) {
    const output = [];
    for (const offset of [0, 6]) {
      output.push(
        numberValue(left?.[offset]) + numberValue(right?.[offset]),
        numberValue(left?.[offset + 1]) + numberValue(right?.[offset + 1]),
        mergeMaximum(left?.[offset + 2], right?.[offset + 2]),
        numberValue(left?.[offset + 3]) + numberValue(right?.[offset + 3]),
        numberValue(left?.[offset + 4]) + numberValue(right?.[offset + 4]),
        mergeMaximum(left?.[offset + 5], right?.[offset + 5])
      );
    }
    return output;
  }

  function mergeCompactRows(left, right) {
    const rows = new Map();
    for (const row of [...(left || []), ...(right || [])]) {
      if (!Array.isArray(row) || row.length < 2) continue;
      const key = String(row[0]);
      if (!rows.has(key)) rows.set(key, [row[0], ...row.slice(1).map(numberValue)]);
      else {
        const current = rows.get(key);
        for (let index = 1; index < row.length; index += 1) {
          current[index] = numberValue(current[index]) + numberValue(row[index]);
        }
      }
    }
    return [...rows.values()];
  }

  function mergeCompactSides(left = {}, right = {}) {
    return {
      rounds: sumArray(left.rounds, right.rounds, 2),
      kda: sumArray(left.kda, right.kda, 5),
      kast_rounds: numberValue(left.kast_rounds) + numberValue(right.kast_rounds),
      opening: sumArray(left.opening, right.opening, 2),
      trade_kills: numberValue(left.trade_kills) + numberValue(right.trade_kills),
      trade_d: sumArray(left.trade_d, right.trade_d, 3),
      utility: sumArray(left.utility, right.utility, 2),
      damage_received: numberValue(left.damage_received) + numberValue(right.damage_received),
      utility_thrown: sumArray(left.utility_thrown, right.utility_thrown, 5),
      objectives: sumArray(left.objectives, right.objectives, 2),
      speed: mergeSpeed(left.speed, right.speed),
      clutches: sumArray(left.clutches, right.clutches, 5),
      clutch_attempts: sumArray(left.clutch_attempts, right.clutch_attempts, 5),
      kill_rounds: sumArray(left.kill_rounds, right.kill_rounds, 5),
      weapons: mergeCompactRows(left.weapons, right.weapons),
      duels: mergeCompactRows(left.duels, right.duels),
      trades: mergeCompactRows(left.trades, right.trades),
      contexts: mergeCompactRows(left.contexts, right.contexts),
      assisted_by: mergeCompactRows(left.assisted_by, right.assisted_by),
      flashes: mergeCompactRows(left.flashes, right.flashes)
    };
  }

  function speedSummaryFromCompact(values, offset) {
    const samples = numberValue(values?.[offset + 1]);
    const percentSamples = numberValue(values?.[offset + 4]);
    return {
      total: numberValue(values?.[offset]),
      average: samples ? numberValue(values?.[offset]) / samples : null,
      maximum: values?.[offset + 2] == null ? null : numberValue(values[offset + 2]),
      samples,
      percent_total: numberValue(values?.[offset + 3]),
      average_percent_of_max: percentSamples ? numberValue(values?.[offset + 3]) / percentSamples : null,
      maximum_percent_of_max: values?.[offset + 5] == null ? null : numberValue(values[offset + 5]),
      percent_samples: percentSamples
    };
  }

  function contextTotals(rows) {
    const totals = Array(13).fill(0);
    for (const row of rows || []) {
      for (let index = 0; index < totals.length; index += 1) totals[index] += numberValue(row[index + 1]);
    }
    return totals;
  }

  function expandStoredMatch(payload, matchID) {
    if (!payload || !Array.isArray(payload.players) || !Array.isArray(payload.teams)) {
      throw new Error("The stored match response is incomplete.");
    }
    const sourcePlayers = payload.players;
    const sides = sourcePlayers.map(player => ({
      T: player.sides?.[0] || {},
      CT: player.sides?.[1] || {}
    }));
    const combined = sides.map(entry => mergeCompactSides(entry.T, entry.CT));
    const teamByPlayer = new Map();
    payload.teams.forEach((team, teamIndex) => (team.players || []).forEach(index => teamByPlayer.set(index, teamIndex)));
    const opposite = side => side === "T" ? "CT" : "T";
    const statsFor = (index, side) => side === "ALL" ? combined[index] : sides[index]?.[side] || {};
    const identity = index => ({
      name: sourcePlayers[index]?.name || "Unknown player",
      steam_id: sourcePlayers[index]?.steam_id || null,
      is_bot: Boolean(sourcePlayers[index]?.bot)
    });

    function incomingRows(playerIndex, side, field) {
      const output = [];
      sourcePlayers.forEach((_, actorIndex) => {
        const sameTeam = teamByPlayer.get(actorIndex) === teamByPlayer.get(playerIndex);
        const actorSide = side === "ALL" ? "ALL" : sameTeam ? side : opposite(side);
        for (const row of statsFor(actorIndex, actorSide)?.[field] || []) {
          if (numberValue(row[0]) === playerIndex) output.push([actorIndex, ...row.slice(1)]);
        }
      });
      return output;
    }

    function expandPlayerSide(playerIndex, side) {
      const stats = statsFor(playerIndex, side);
      const player = identity(playerIndex);
      const rounds = numberValue(stats.rounds?.[0]);
      const wins = numberValue(stats.rounds?.[1]);
      const kills = numberValue(stats.kda?.[0]);
      const deaths = numberValue(stats.kda?.[1]);
      const assists = numberValue(stats.kda?.[2]);
      const headshots = numberValue(stats.kda?.[3]);
      const damage = numberValue(stats.kda?.[4]);
      const kastRounds = numberValue(stats.kast_rounds);
      const attempts = (stats.trades || []).reduce((sum, row) => sum + numberValue(row[2]), 0);
      const opportunities = (stats.trades || []).reduce((sum, row) => sum + numberValue(row[1]), 0);
      const successes = (stats.trades || []).reduce((sum, row) => sum + numberValue(row[3]), 0);
      const tradeKills = numberValue(stats.trade_kills);
      const outgoingContext = contextTotals(stats.contexts);
      const incomingContext = contextTotals(incomingRows(playerIndex, side, "contexts"));
      const assistedRows = stats.assisted_by || [];
      const enemyFlashRows = (stats.flashes || []).filter(row => teamByPlayer.get(numberValue(row[0])) !== teamByPlayer.get(playerIndex));
      const damageAssistedKills = assistedRows.reduce((sum, row) => sum + numberValue(row[1]), 0);
      const flashAssistedKills = assistedRows.reduce((sum, row) => sum + numberValue(row[2]), 0);
      const ownFlashKills = assistedRows.reduce((sum, row) => sum + numberValue(row[3]), 0);
      let flashAssists = 0;
      sourcePlayers.forEach((_, beneficiaryIndex) => {
        if (teamByPlayer.get(beneficiaryIndex) !== teamByPlayer.get(playerIndex)) return;
        const beneficiaryStats = statsFor(beneficiaryIndex, side);
        for (const row of beneficiaryStats.assisted_by || []) {
          if (numberValue(row[0]) === playerIndex) flashAssists += numberValue(row[2]);
        }
      });

      const duelIndexes = new Set((stats.duels || []).map(row => numberValue(row[0])));
      incomingRows(playerIndex, side, "duels").forEach(row => duelIndexes.add(numberValue(row[0])));
      const duelKills = new Map((stats.duels || []).map(row => [numberValue(row[0]), numberValue(row[1])]));
      const duelDeaths = new Map(incomingRows(playerIndex, side, "duels").map(row => [numberValue(row[0]), numberValue(row[1])]));
      const duels = [...duelIndexes].map(opponentIndex => {
        const opponent = identity(opponentIndex);
        const duelKillsValue = duelKills.get(opponentIndex) || 0;
        const duelDeathsValue = duelDeaths.get(opponentIndex) || 0;
        return {
          opponent: opponent.name,
          opponent_steam_id: opponent.steam_id,
          opponent_is_bot: opponent.is_bot,
          kills: duelKillsValue,
          deaths: duelDeathsValue,
          differential: duelKillsValue - duelDeathsValue
        };
      });

      const kpr = rounds ? kills / rounds : 0;
      const dpr = rounds ? deaths / rounds : 0;
      const apr = rounds ? assists / rounds : 0;
      const adr = rounds ? damage / rounds : 0;
      const kast = rounds ? 100 * kastRounds / rounds : 0;
      const impact = 2.13 * kpr + 0.42 * apr - 0.41;
      const rating = rounds ? 0.0073 * kast + 0.3591 * kpr - 0.5329 * dpr +
        0.2372 * impact + 0.0032 * adr + 0.1587 : 0;

      return {
        ...player,
        kills, deaths, assists, headshots, damage,
        damage_received: numberValue(stats.damage_received),
        headshot_percent: kills ? 100 * headshots / kills : 0,
        adr, kast, kast_rounds: kastRounds, rounds_played: rounds, round_wins: wins,
        opening_kills: numberValue(stats.opening?.[0]),
        opening_deaths: numberValue(stats.opening?.[1]),
        trade_kills: tradeKills,
        trade_opportunities: opportunities,
        trade_attempts: attempts,
        trade_successes: successes,
        trade_attempt_percent: opportunities ? 100 * attempts / opportunities : 0,
        trade_success_percent: attempts ? 100 * tradeKills / attempts : 0,
        tradeable_deaths: numberValue(stats.trade_d?.[0]),
        attempted_tradeable_deaths: numberValue(stats.trade_d?.[1]),
        traded_deaths: numberValue(stats.trade_d?.[2]),
        traded_tradeable_deaths: numberValue(stats.trade_d?.[2]),
        traded_death_percent: numberValue(stats.trade_d?.[1]) ? 100 * numberValue(stats.trade_d?.[2]) / numberValue(stats.trade_d?.[1]) : 0,
        assisted_kills: {
          damage: damageAssistedKills,
          flash: flashAssistedKills,
          own_flash: ownFlashKills,
          total: damageAssistedKills + flashAssistedKills
        },
        enemies_flashed: enemyFlashRows.reduce((sum, row) => sum + numberValue(row[1]), 0),
        flash_assists: flashAssists,
        grenade_damage: {
          high_explosive: numberValue(stats.utility?.[0]),
          fire: numberValue(stats.utility?.[1]),
          total: numberValue(stats.utility?.[0]) + numberValue(stats.utility?.[1])
        },
        utility_thrown: {
          high_explosive: numberValue(stats.utility_thrown?.[0]),
          flashbang: numberValue(stats.utility_thrown?.[1]),
          smoke: numberValue(stats.utility_thrown?.[2]),
          fire: numberValue(stats.utility_thrown?.[3]),
          decoy: numberValue(stats.utility_thrown?.[4])
        },
        objectives: {
          plants: numberValue(stats.objectives?.[0]),
          defuses: numberValue(stats.objectives?.[1])
        },
        kill_context: {
          blinded_enemy_kills: outgoingContext[0], deaths_while_blind: incomingContext[0],
          kills_while_blind: outgoingContext[1], deaths_to_blind_killer: incomingContext[1],
          wallbang_kills: outgoingContext[2], wallbang_deaths: incomingContext[2],
          penetrations_on_kills: outgoingContext[3], penetrations_on_deaths: incomingContext[3],
          smoke_kills: outgoingContext[4], smoke_deaths: incomingContext[4],
          airborne_kills: outgoingContext[5], deaths_to_airborne_killer: incomingContext[5],
          moving_kills: outgoingContext[6], deaths_to_moving_killer: incomingContext[6],
          still_kills: outgoingContext[7], deaths_to_still_killer: incomingContext[7],
          running_kills: outgoingContext[8], deaths_to_running_killer: incomingContext[8],
          grenade_out_kills: outgoingContext[9], grenade_out_deaths: incomingContext[9],
          knife_out_kills: outgoingContext[10], knife_out_deaths: incomingContext[10],
          equipment_disadvantage_kills: outgoingContext[11], equipment_disadvantage_deaths: incomingContext[11],
          unfair_kills: outgoingContext[12], unfair_deaths: incomingContext[12],
          speed_on_kill: speedSummaryFromCompact(stats.speed, 0),
          killer_speed_on_death: speedSummaryFromCompact(stats.speed, 6)
        },
        weapon_stats: (stats.weapons || []).map(row => ({
          weapon: row[0], kills: numberValue(row[1]), shots: numberValue(row[2]),
          damage: numberValue(row[3]), rounds_used: numberValue(row[4]), hits: numberValue(row[5])
        })),
        duels,
        trade_matchups: (stats.trades || []).map(row => ({
          teammate: identity(numberValue(row[0])).name,
          teammate_steam_id: identity(numberValue(row[0])).steam_id,
          teammate_is_bot: identity(numberValue(row[0])).is_bot,
          opportunities: numberValue(row[1]), attempts: numberValue(row[2]), successes: numberValue(row[3])
        })),
        kill_context_matchups: (stats.contexts || []).map(row => ({
          victim: identity(numberValue(row[0])).name,
          victim_steam_id: identity(numberValue(row[0])).steam_id,
          victim_is_bot: identity(numberValue(row[0])).is_bot,
          blinded: numberValue(row[1]), attackerBlind: numberValue(row[2]), wallbang: numberValue(row[3]),
          penetrations: numberValue(row[4]), smoke: numberValue(row[5]), airborne: numberValue(row[6]),
          moving: numberValue(row[7]), still: numberValue(row[8]), running: numberValue(row[9]),
          grenadeOut: numberValue(row[10]), knifeOut: numberValue(row[11]),
          equipmentDisadvantage: numberValue(row[12]), unfair: numberValue(row[13])
        })),
        assisted_kill_matchups: assistedRows.map(row => ({
          assister: identity(numberValue(row[0])).name,
          assister_steam_id: identity(numberValue(row[0])).steam_id,
          assister_is_bot: identity(numberValue(row[0])).is_bot,
          damage: numberValue(row[1]), flash: numberValue(row[2]), own_flash: numberValue(row[3])
        })),
        flash_matchups: (stats.flashes || []).map(row => ({
          victim: identity(numberValue(row[0])).name,
          victim_steam_id: identity(numberValue(row[0])).steam_id,
          victim_is_bot: identity(numberValue(row[0])).is_bot,
          flashes: numberValue(row[1]), blind_duration: numberValue(row[2]) / 1000
        })),
        clutch_wins: Object.fromEntries((stats.clutches || []).map((value, index) => [index + 1, numberValue(value)])),
        clutch_attempts: Object.fromEntries((stats.clutch_attempts || []).map((value, index) => [index + 1, numberValue(value)])),
        kill_rounds: Object.fromEntries((stats.kill_rounds || []).map((value, index) => [index + 1, numberValue(value)])),
        rating: Math.max(0, rating)
      };
    }

    const expandedPlayers = sourcePlayers.map((_, index) => {
      const output = expandPlayerSide(index, "ALL");
      output.by_side = { T: expandPlayerSide(index, "T"), CT: expandPlayerSide(index, "CT") };
      return output;
    });
    const teams = payload.teams.map((team, index) => ({
      id: team.id || String(index),
      name: team.name || `Team ${index + 1}`,
      score: team.score,
      side_scores: { T: numberValue(team.side_scores?.[0]), CT: numberValue(team.side_scores?.[1]) },
      players: (team.players || []).map(playerIndex => expandedPlayers[playerIndex]).filter(Boolean)
    }));
    const tradeRules = payload.rules?.trade || [];
    const movementRules = payload.rules?.movement || [];
    return {
      format_version: 1,
      parser: payload.parser?.[0] || "NickStats database",
      parser_version: payload.parser?.[1] || "",
      provider_match_id: payload.id?.faceit || null,
      demo_sha256: payload.id?.sha256 || "",
      source_file: `Stored match #${matchID}`,
      map: payload.map,
      rounds: numberValue(payload.rounds),
      played_at: payload.played_at,
      played_at_source: payload.played_at_source,
      player_count: sourcePlayers.length,
      trade_definition: {
        window_seconds: tradeRules[0], proximity_units: tradeRules[1], engagement_lull_seconds: tradeRules[2],
        bullet_path_tolerance_units: tradeRules[3], he_damage_caps: { unarmored: tradeRules[4], armored: tradeRules[5] }
      },
      kill_context_definition: {
        still_speed_tolerance_units_per_second: movementRules[0],
        running_threshold_percent_of_weapon_max: movementRules[1],
        equipment_disadvantage_lookback_seconds: payload.rules?.equipment_disadvantage_seconds
      },
      teams
    };
  }

  function setMatchBrowserView(view) {
    if (view === "detail" && !state.selectedMatchID) return;
    document.querySelectorAll("[data-match-browser-view]").forEach(button => {
      const active = button.dataset.matchBrowserView === view;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    $("matchListView").hidden = view !== "list";
    $("matchDetailView").hidden = view !== "detail";
  }

  function matchSummaryTimestamp(match) {
    return Number(match.playedAt ?? match.played_at);
  }

  const mapArtworkPositions = {
    mirage: "0% 0%",
    inferno: "100% 0%",
    nuke: "0% 25%",
    dust2: "100% 25%",
    ancient: "0% 50%",
    anubis: "100% 50%",
    overpass: "0% 75%",
    train: "100% 75%",
    vertigo: "0% 100%",
    cache: "100% 100%"
  };

  function mapArtworkKey(name) {
    const normalized = String(name || "")
      .toLowerCase()
      .split(/[\\/]/)
      .pop()
      .replace(/\.(?:bsp|vpk)$/, "")
      .replace(/^de_/, "")
      .replace(/[^a-z0-9]/g, "");
    return normalized === "dustii" ? "dust2" : normalized;
  }

  function matchScore(team) {
    if (team?.score == null || team.score === "") return null;
    const score = Number(team.score);
    return Number.isFinite(score) ? score : null;
  }

  function matchTeamResult(team, otherTeam) {
    const score = matchScore(team);
    const otherScore = matchScore(otherTeam);
    if (score == null || otherScore == null || score === otherScore) return "";
    return score > otherScore ? "winner" : "loser";
  }

  function renderMatchTeam(team, otherTeam) {
    const item = document.createElement("span");
    const result = matchTeamResult(team, otherTeam);
    item.className = `match-list-team${result ? ` ${result}` : ""}`;

    const name = document.createElement("span");
    name.className = "match-list-team-name";
    name.textContent = team?.name || "Unknown team";
    const score = document.createElement("strong");
    score.className = "match-list-score";
    score.textContent = matchScore(team) ?? "—";
    item.append(name, score);
    return item;
  }

  function renderMatchList(matches) {
    const list = $("matchList");
    list.replaceChildren();
    for (const match of matches) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "match-list-item";

      const mapName = match.map || "Unknown map";
      const artwork = document.createElement("span");
      artwork.className = "match-list-map-art";
      const artworkKey = mapArtworkKey(mapName);
      if (mapArtworkPositions[artworkKey]) {
        artwork.style.backgroundPosition = mapArtworkPositions[artworkKey];
      } else {
        artwork.classList.add("unknown");
      }
      const artworkLabel = document.createElement("span");
      artworkLabel.textContent = mapName.replace(/^de_/i, "");
      artwork.append(artworkLabel);

      const identity = document.createElement("span");
      identity.className = "match-list-identity";
      const number = document.createElement("strong");
      number.textContent = `#${match.id}`;
      const meta = document.createElement("span");
      meta.className = "match-list-meta";
      meta.textContent = formatMatchTime(matchSummaryTimestamp(match));
      identity.append(number, meta);

      const result = document.createElement("span");
      result.className = "match-list-result";
      const teamRows = Array.isArray(match.teams) ? match.teams : [];
      if (teamRows.length >= 2) {
        const separator = document.createElement("span");
        separator.className = "match-list-score-separator";
        separator.textContent = "–";
        result.append(renderMatchTeam(teamRows[0], teamRows[1]), separator, renderMatchTeam(teamRows[1], teamRows[0]));
      } else {
        result.textContent = "Score unavailable";
      }

      button.append(artwork, identity, result);
      const scoreDescription = teamRows.length >= 2
        ? `${teamRows[0].name || "Unknown team"} ${matchScore(teamRows[0]) ?? "unknown"} to ${matchScore(teamRows[1]) ?? "unknown"} ${teamRows[1].name || "Unknown team"}`
        : "score unavailable";
      button.setAttribute("aria-label", `Open match ${match.id} on ${mapName}: ${scoreDescription}`);
      button.addEventListener("click", () => loadStoredMatch(match.id));
      list.appendChild(button);
    }
  }

  async function apiJson(response) {
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.reason || `The API returned HTTP ${response.status}.`);
    return body;
  }

  async function loadMatches(offset = state.matchListOffset) {
    state.matchListController?.abort();
    const controller = new AbortController(); state.matchListController = controller;
    state.matchListLoading = true;
    $("matchListRefreshButton").disabled = true;
    $("matchListStatus").textContent = "Loading stored matches…";
    $("matchListStatus").classList.remove("error");
    try {
      const query = new URLSearchParams({ limit: String(MATCH_LIST_LIMIT), offset: String(Math.max(0, offset)) });
      if (matchMapFilter.size) query.set("maps", matchMapFilter.values().join(","));
      const payload = await apiJson(await fetch(`${MATCH_UPLOAD_ENDPOINT}?${query}`, { headers: { "Accept": "application/json" }, signal: controller.signal }));
      const matches = Array.isArray(payload.matches) ? payload.matches : [];
      matchMapFilter.setOptions(Array.isArray(payload.maps) ? payload.maps : matches.map(match => match.map));
      state.matchListOffset = Math.max(0, offset);
      state.matchListCount = matches.length;
      renderMatchList(matches);
      $("matchListStatus").textContent = matches.length
        ? `${matches.length} match${matches.length === 1 ? "" : "es"} shown.`
        : state.matchListOffset ? "No more matches." : matchMapFilter.size ? "No matches use the selected maps." : "No matches have been uploaded yet.";
      $("matchListPagination").hidden = state.matchListOffset === 0 && matches.length < MATCH_LIST_LIMIT;
      $("matchListPreviousButton").disabled = state.matchListOffset === 0;
      $("matchListNextButton").disabled = matches.length < MATCH_LIST_LIMIT;
      $("matchListPageLabel").textContent = `Matches ${state.matchListOffset + 1}–${state.matchListOffset + matches.length}`;
    } catch (error) {
      if (error.name === "AbortError") return;
      $("matchList").replaceChildren();
      $("matchListStatus").textContent = `Could not load matches: ${error.message}`;
      $("matchListStatus").classList.add("error");
      $("matchListPagination").hidden = true;
    } finally {
      if (state.matchListController === controller) {
        state.matchListLoading = false;
        $("matchListRefreshButton").disabled = false;
      }
    }
  }

  async function loadStoredMatch(matchID) {
    if (state.matchDetailLoading) return;
    state.matchDetailLoading = true;
    state.selectedMatchID = matchID;
    $("matchDetailTab").disabled = false;
    $("matchDetailTab").textContent = `Match #${matchID}`;
    setMatchBrowserView("detail");
    $("demoResults").hidden = true;
    $("matchDetailStatus").textContent = `Loading match #${matchID}…`;
    $("matchDetailStatus").classList.remove("error");
    try {
      const payload = await apiJson(await fetch(`${MATCH_UPLOAD_ENDPOINT}/${encodeURIComponent(matchID)}`, {
        headers: { "Accept": "application/json" }
      }));
      state.storedPayload = payload;
      state.result = expandStoredMatch(payload, matchID);
      state.scoreboardSort = null;
      state.expandedWeaponPlayers.clear();
      state.weaponSorts.clear();
      setSideFilter("ALL", false);
      setResultView("scoreboard");
      render(state.result);
      $("matchDetailStatus").textContent = "";
    } catch (error) {
      state.result = null;
      state.storedPayload = null;
      $("matchDetailStatus").textContent = `Could not load match #${matchID}: ${error.message}`;
      $("matchDetailStatus").classList.add("error");
    } finally {
      state.matchDetailLoading = false;
    }
  }

  function parseWithWorker(name, data, compression = null) {
    return new Promise((resolve, reject) => {
      state.resolveParse = resolve;
      state.rejectParse = reject;
      state.worker.postMessage({ type: "parse", name, data, compression }, [data]);
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

  function enemyFlashMatchups(player) {
    const playerKey = duelIdentity(player.steam_id, player.name);
    const ownTeam = (state.result?.teams || []).find(team =>
      (team.players || []).some(member => duelIdentity(member.steam_id, member.name) === playerKey)
    );
    if (!ownTeam) return player.flash_matchups || [];
    const teammates = new Set((ownTeam.players || []).map(member => duelIdentity(member.steam_id, member.name)));
    return (player.flash_matchups || []).filter(matchup =>
      !teammates.has(duelIdentity(matchup.victim_steam_id, matchup.victim))
    );
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
    cell(row, `${player.rounds_played ?? 0}/${player.round_wins ?? 0}`);
    const damageDiff = (player.damage ?? 0) - (player.damage_received ?? 0);
    if (state.expandedGroups.combat) {
      cell(row, player.kills ?? 0, "demo-group-cell combat-cell");
      cell(row, player.deaths ?? 0, "demo-group-cell combat-cell");
      cell(row, player.assists ?? 0, "demo-group-cell combat-cell");
      cell(row, ((player.kills ?? 0) / Math.max(1, player.deaths ?? 0)).toFixed(2), "demo-group-cell combat-cell");
      cell(row, `${player.headshot_percent.toFixed(0)}%`, "demo-group-cell combat-cell");
      cell(row, player.damage ?? 0, "demo-group-cell combat-cell");
      cell(row, player.damage_received ?? 0, "demo-group-cell combat-cell");
      cell(row, `${damageDiff > 0 ? "+" : ""}${damageDiff}`, "demo-group-cell combat-cell");
      cell(row, player.adr.toFixed(1), "demo-group-cell combat-cell");
    } else {
      cell(row, `${player.kills}-${player.deaths}-${player.assists}`, "demo-group-cell combat-cell");
    }
    cell(row, `${player.kast.toFixed(1)}%`);
    const ratingClass = player.rating >= 1.10 ? "rating-good" : player.rating <= 0.90 ? "rating-bad" : "rating-average";
    cell(row, player.rating.toFixed(2), `demo-rating ${ratingClass}`);
    const openingTotal = (player.opening_kills ?? 0) + (player.opening_deaths ?? 0);
    const openingDiff = (player.opening_kills ?? 0) - (player.opening_deaths ?? 0);
    if (state.expandedGroups.opening) {
      cell(row, player.opening_kills ?? 0, "demo-group-cell opening-cell");
      cell(row, player.opening_deaths ?? 0, "demo-group-cell opening-cell");
      cell(row, `${openingDiff > 0 ? "+" : ""}${openingDiff}`, "demo-group-cell opening-cell");
      cell(row, `${(100 * (player.opening_kills ?? 0) / Math.max(1, openingTotal)).toFixed(0)}%`, "demo-group-cell opening-cell");
    } else {
      cell(row, `${player.opening_kills ?? 0}-${player.opening_deaths ?? 0}`, "demo-group-cell opening-cell");
    }
    const context = player.kill_context || {};
    const blind = `${context.blinded_enemy_kills ?? 0}-${context.deaths_while_blind ?? 0}`;
    const blindKiller = `${context.kills_while_blind ?? 0}-${context.deaths_to_blind_killer ?? 0}`;
    const wall = `${context.wallbang_kills ?? 0}-${context.wallbang_deaths ?? 0}`;
    const smoke = `${context.smoke_kills ?? 0}-${context.smoke_deaths ?? 0}`;
    const air = `${context.airborne_kills ?? 0}-${context.deaths_to_airborne_killer ?? 0}`;
    const equipment = `${context.equipment_disadvantage_kills ?? 0}-${context.equipment_disadvantage_deaths ?? 0}`;
    const grenade = `${context.grenade_out_kills ?? 0}-${context.grenade_out_deaths ?? 0}`;
    const knife = `${context.knife_out_kills ?? 0}-${context.knife_out_deaths ?? 0}`;
    const moving = `${context.moving_kills ?? 0}-${context.deaths_to_moving_killer ?? 0}`;
    const still = `${context.still_kills ?? 0}-${context.deaths_to_still_killer ?? 0}`;
    const running = `${context.running_kills ?? 0}-${context.deaths_to_running_killer ?? 0}`;
    const unfair = `${context.unfair_kills ?? 0}-${context.unfair_deaths ?? 0}`;
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
    if (state.expandedGroups.clutches) {
      for (let opponents = 5; opponents >= 1; opponents -= 1) {
        cell(row, `${player.clutch_wins?.[opponents] ?? 0}/${player.clutch_attempts?.[opponents] ?? 0}`, "demo-group-cell clutches-cell");
      }
    } else {
      const wins = [1, 2, 3, 4, 5].reduce((sum, opponents) => sum + (player.clutch_wins?.[opponents] ?? 0), 0);
      const attempts = [1, 2, 3, 4, 5].reduce((sum, opponents) => sum + (player.clutch_attempts?.[opponents] ?? 0), 0);
      cell(row, `${wins}/${attempts}`, "demo-group-cell clutches-cell");
    }
    if (state.expandedGroups.multikills) {
      for (let kills = 5; kills >= 1; kills -= 1) {
        cell(row, player.kill_rounds?.[kills] ?? 0, "demo-group-cell multikills-cell");
      }
    } else {
      cell(row, [1, 2, 3, 4, 5].reduce((sum, kills) => sum + (player.kill_rounds?.[kills] ?? 0), 0), "demo-group-cell multikills-cell");
    }
    if (state.expandedGroups.objectives) {
      cell(row, player.objectives?.plants ?? 0, "demo-group-cell objectives-cell");
      cell(row, player.objectives?.defuses ?? 0, "demo-group-cell objectives-cell");
    } else {
      cell(row, `${player.objectives?.plants ?? 0}/${player.objectives?.defuses ?? 0}`, "demo-group-cell objectives-cell");
    }
    if (state.expandedGroups.killContext) {
      [blind, blindKiller, wall, smoke, air, grenade, knife, equipment, running]
        .forEach(value => cell(row, value, "demo-group-cell killContext-cell"));
    } else {
      cell(row, unfair, "demo-group-cell killContext-cell");
    }
    const speedPair = summary => `${Number.isFinite(summary?.average) ? summary.average.toFixed(1) : "—"}/${Number.isFinite(summary?.maximum) ? summary.maximum.toFixed(1) : "—"}`;
    const speedPercentPair = summary => `${speedValue(summary?.average_percent_of_max)}/${speedValue(summary?.maximum_percent_of_max)}`;
    if (state.expandedGroups.movement) {
      [moving, still, running, air, speedPair(context.speed_on_kill), speedPercentPair(context.speed_on_kill), speedPair(context.killer_speed_on_death), speedPercentPair(context.killer_speed_on_death)]
        .forEach(value => cell(row, value, "demo-group-cell movement-cell"));
    } else {
      cell(row, `${context.moving_kills ?? 0}/${context.running_kills ?? 0}/${context.airborne_kills ?? 0}`, "demo-group-cell movement-cell");
    }
    const utilityThrown = player.utility_thrown || {};
    const totalThrown = ["high_explosive", "flashbang", "smoke", "fire", "decoy"].reduce((sum, key) => sum + (utilityThrown[key] ?? 0), 0);
    const blindSeconds = enemyFlashMatchups(player).reduce((sum, matchup) => sum + (matchup.blind_duration || 0), 0);
    if (state.expandedGroups.utility) {
      [player.grenade_damage?.high_explosive ?? 0, player.grenade_damage?.fire ?? 0,
        utilityThrown.high_explosive ?? 0, utilityThrown.flashbang ?? 0, utilityThrown.smoke ?? 0,
        utilityThrown.fire ?? 0, utilityThrown.decoy ?? 0, player.enemies_flashed ?? 0,
        blindSeconds.toFixed(1), player.flash_assists ?? 0, player.assisted_kills?.damage ?? 0,
        player.assisted_kills?.flash ?? 0, player.assisted_kills?.own_flash ?? 0]
        .forEach(value => cell(row, value, "demo-group-cell utility-cell"));
    } else {
      cell(row, `${player.grenade_damage?.total ?? 0} dmg · ${totalThrown} thrown`, "demo-group-cell utility-cell");
    }
    markGroupBoundaries(row);
    return row;
  }

  function markGroupBoundaries(row) {
    for (const group of ["combat", "opening", "trades", "clutches", "multikills", "objectives", "killContext", "movement", "utility"]) {
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
      "Rounds P/W": sortSpecs.rounds,
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
      if (detail === "Own-flash K") child.title = "Kills on enemies actively blinded by a flash you threw; this does not mean you blinded yourself";
      if (detail === "Enemy blind K-D") child.title = "Kills against blinded enemies – deaths while blinded";
      if (detail === "Killer blind K-D") child.title = "Kills while you were blind – deaths to a blinded enemy";
      if (detail === "Wallbang K-D") child.title = "Wallbang kills – wallbang deaths";
      if (detail === "Smoke K-D") child.title = "Smoke kills – smoke deaths";
      if (detail === "Air K-D") child.title = "Kills while airborne – deaths to airborne killers";
      if (detail === "Paul K-D") child.title = "Kills against enemies caught with a grenade or knife out in the prior 1.4 seconds – deaths caught the same way";
      if (detail === "Grenade out K-D") child.title = "Kills against enemies holding a grenade – deaths while holding a grenade";
      if (detail === "Knife out K-D") child.title = "Kills against enemies holding a knife – deaths while holding a knife";
      if (detail === "Move K-D") child.title = "Kills while moving above 1 unit/second – deaths to a moving killer";
      if (detail === "Still K-D") child.title = "Kills while moving at most 1 unit/second – deaths to a stationary killer";
      if (detail === "Run K-D") child.title = "Kills by a player moving above 34% of the held weapon's maximum speed – deaths to such a killer";
      if (detail === "Spd% K-D") child.title = "Average horizontal killer speed as a percentage of the held weapon maximum: your kills – your deaths";
      if (detail === "Bullshit K-D") child.title = "Unique kills and deaths where the killer was blind, airborne, or running; the kill was a wallbang or smoke kill; or the victim was caught for a Paul; overlaps count once";
      child.className = `demo-group-detail ${group}-cell`;
      if (index === 0) child.classList.add("demo-group-start");
      if (index === details.length - 1) child.classList.add("demo-group-end");
      sortableHeader(child, detail, groupSortSpec(group, detail));
      detailRow.appendChild(child);
    });
  }

  function groupSortSpec(group, detail) {
    const maps = {
      combat: {
        "K-D-A": sortSpecs.kda,
        K: sortSpecs.combatKills,
        D: sortSpecs.combatDeaths,
        A: sortSpecs.combatAssists,
        "K/D": sortSpecs.kd,
        "HS%": sortSpecs.hs,
        Damage: sortSpecs.damage,
        Received: sortSpecs.damageReceived,
        Diff: sortSpecs.damageDiff,
        ADR: sortSpecs.adr
      },
      opening: {
        "K-D": sortSpecs.opening,
        K: sortSpecs.openingKills,
        D: sortSpecs.openingDeaths,
        Diff: sortSpecs.openingDiff,
        Success: sortSpecs.openingSuccess
      },
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
        "Bullshit K-D": sortSpecs.killContextSummary,
        "Enemy blind K-D": sortSpecs.blindContext,
        "Killer blind K-D": sortSpecs.blindKillerContext,
        "Wallbang K-D": sortSpecs.wallContext,
        "Smoke K-D": sortSpecs.smokeContext,
        "Air K-D": sortSpecs.airContext,
        "Grenade out K-D": sortSpecs.grenadeContext,
        "Knife out K-D": sortSpecs.knifeContext,
        "Paul K-D": sortSpecs.equipmentContext,
        "Move K-D": sortSpecs.movingContext,
        "Still K-D": sortSpecs.stillContext,
        "Run K-D": sortSpecs.runningContext
      },
      utility: {
        "Damage · thrown": sortSpecs.utilitySummary,
        EF: sortSpecs.ef,
        FA: sortSpecs.fa,
        "HE Dmg": sortSpecs.heDamage,
        "Fire Dmg": sortSpecs.fireDamage,
        "HE thrown": sortSpecs.heThrown,
        "Flash thrown": sortSpecs.flashThrown,
        "Smoke thrown": sortSpecs.smokeThrown,
        "Fire thrown": sortSpecs.fireThrown,
        "Decoy thrown": sortSpecs.decoyThrown,
        "Blind sec": sortSpecs.blindDuration,
        "Damage assist": sortSpecs.assistedDamage,
        "Teammate flash": sortSpecs.assistedFlash,
        "Own flash": sortSpecs.assistedOwnFlash
      },
      clutches: {
        Total: sortSpecs.clutchTotal,
        "Total W/A": sortSpecs.clutchTotal,
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
      },
      objectives: {
        "Plants/defuses": sortSpecs.bombPlants,
        Plants: sortSpecs.bombPlants,
        Defuses: sortSpecs.bombDefuses
      },
      movement: {
        "Move/run/air": sortSpecs.movementSummary,
        "Move K-D": sortSpecs.movingContext,
        "Still K-D": sortSpecs.stillContext,
        "Run K-D": sortSpecs.runningContext,
        "Air K-D": sortSpecs.airContext,
        "Kill speed avg/max": sortSpecs.killSpeedUnits,
        "Kill speed avg/peak %": sortSpecs.killSpeedPercents,
        "Enemy speed avg/max": sortSpecs.deathSpeedUnits,
        "Enemy speed avg/peak %": sortSpecs.deathSpeedPercents
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
    const scrollLeft = document.querySelector(".demo-team .table-wrap")?.scrollLeft || 0;
    render(state.result);
    document.querySelectorAll(".demo-team .table-wrap").forEach(wrap => {
      wrap.scrollLeft = scrollLeft;
    });
  }

  function synchronizeScoreboardScrolling() {
    const wraps = [...document.querySelectorAll(".demo-team .table-wrap")];
    let synchronizing = false;
    for (const source of wraps) {
      source.addEventListener("scroll", () => {
        if (synchronizing) return;
        synchronizing = true;
        for (const target of wraps) {
          if (target !== source) target.scrollLeft = source.scrollLeft;
        }
        requestAnimationFrame(() => { synchronizing = false; });
      }, { passive: true });
    }
  }

  function toggleColumnGroup(group) {
    state.scoreboardSort = null;
    state.expandedGroups[group] = !state.expandedGroups[group];
    rerenderScoreboard();
  }

  function scoreboardColumnWidths() {
    const widths = [160, 82];
    widths.push(...(state.expandedGroups.combat ? [54, 54, 54, 62, 62, 82, 88, 76, 72] : [90]));
    widths.push(72, 72);
    widths.push(...(state.expandedGroups.opening ? [58, 58, 68, 76] : [82]));
    widths.push(...(state.expandedGroups.trades ? [58, 54, 96, 58, 54, 96] : [88]));
    widths.push(...(state.expandedGroups.clutches ? [55, 55, 55, 55, 55] : [82]));
    widths.push(...(state.expandedGroups.multikills ? [55, 55, 55, 55, 55] : [92]));
    widths.push(...(state.expandedGroups.objectives ? [74, 74] : [92]));
    widths.push(...(state.expandedGroups.killContext ? [104, 104, 98, 88, 88, 112, 104, 88, 88] : [112]));
    widths.push(...(state.expandedGroups.movement ? [88, 88, 88, 88, 116, 132, 126, 142] : [112]));
    widths.push(...(state.expandedGroups.utility ? [82, 82, 86, 94, 94, 94, 94, 58, 86, 58, 100, 112, 90] : [144]));
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
    table.className = `demo-score-table${Object.entries(state.expandedGroups).filter(([, expanded]) => expanded).map(([group]) => ` ${group}-expanded`).join("")}`;
    table.setAttribute("aria-label", `${team.name || `Team ${index + 1}`} player statistics`);
    scoreboardColumns(table);
    const thead = document.createElement("thead");
    const header = document.createElement("tr");
    const detailHeader = document.createElement("tr");
    ["Player", "Rounds P/W"].forEach(label => regularHeader(header, label));
    groupHeader(header, detailHeader, "combat", "Combat", ["K", "D", "A", "K/D", "HS%", "Damage", "Received", "Diff", "ADR"], "K-D-A");
    ["KAST", "Rating"].forEach(label => regularHeader(header, label));
    groupHeader(header, detailHeader, "opening", "Opening", ["K", "D", "Diff", "Success"], "K-D");
    groupHeader(header, detailHeader, "trades", "Trades", ["K Opp", "K Att", "K (Succ%)", "D Opp", "D Att", "D (Succ%)"], "K-D");
    groupHeader(header, detailHeader, "clutches", "Clutches", ["1v5", "1v4", "1v3", "1v2", "1v1"], "Total W/A");
    groupHeader(header, detailHeader, "multikills", "Kill rounds", ["5K", "4K", "3K", "2K", "1K"]);
    groupHeader(header, detailHeader, "objectives", "Objectives", ["Plants", "Defuses"], "Plants/defuses");
    groupHeader(header, detailHeader, "killContext", "Context", ["Enemy blind K-D", "Killer blind K-D", "Wallbang K-D", "Smoke K-D", "Air K-D", "Grenade out K-D", "Knife out K-D", "Paul K-D", "Run K-D"], "Bullshit K-D");
    groupHeader(header, detailHeader, "movement", "Movement", ["Move K-D", "Still K-D", "Run K-D", "Air K-D", "Kill speed avg/max", "Kill speed avg/peak %", "Enemy speed avg/max", "Enemy speed avg/peak %"], "Move/run/air");
    groupHeader(header, detailHeader, "utility", "Utility", ["HE Dmg", "Fire Dmg", "HE thrown", "Flash thrown", "Smoke thrown", "Fire thrown", "Decoy thrown", "EF", "Blind sec", "FA", "Damage assist", "Teammate flash", "Own flash"], "Damage · thrown");
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
    const rounds = player.rounds_played ?? 0;
    const weapons = (Array.isArray(player.weapon_stats) ? player.weapon_stats : []).map(stat => ({
      ...stat,
      kills_per_round: (stat.kills || 0) / Math.max(1, stat.rounds_used || 0),
      damage_per_round: (stat.damage || 0) / Math.max(1, stat.rounds_used || 0),
      hit_rate: 100 * (stat.hits || 0) / Math.max(1, stat.shots || 0),
      usage: 100 * (stat.rounds_used || 0) / Math.max(1, rounds)
    }));
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
      ["K/R", "kills_per_round"],
      ["Damage", "damage"],
      ["Dmg/R", "damage_per_round"],
      ["Shots", "shots"],
      ["Hits", "hits"],
      ["Hit rate", "hit_rate"],
      ["Rounds used", "rounds_used"],
      ["Usage", "usage"]
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
      cell(row, stat.kills_per_round.toFixed(3));
      cell(row, stat.damage || 0);
      cell(row, stat.damage_per_round.toFixed(1));
      cell(row, stat.shots || 0);
      cell(row, stat.hits || 0);
      cell(row, `${stat.hit_rate.toFixed(1)}%`);
      cell(row, stat.rounds_used || 0);
      cell(row, `${stat.usage.toFixed(1)}%`);
      body.appendChild(row);
    });
    if (!weapons.length) {
      const row = document.createElement("tr");
      const empty = document.createElement("td");
      empty.colSpan = 10;
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
    demoSideControl?.set(side, { notify: false });
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
      summaryCard(state.selectedMatchID ? "Stored match" : "File", state.selectedMatchID ? `#${state.selectedMatchID}` : state.file?.name || "Demo"),
      summaryCard("Match ID", result.provider_match_id || `SHA ${String(result.demo_sha256 || "").slice(0, 12)}…`),
      summaryCard("Played", formatMatchTime(result.played_at)),
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
    synchronizeScoreboardScrolling();
    $("demoWeapons").replaceChildren(...teams.map(renderWeaponTeam));
    $("demoTrades").replaceChildren(renderTradeMatrix(teams));
    $("demoDuels").replaceChildren(renderDuelMatrix(teams));
    $("demoResults").hidden = false;
  }

  async function parseDemo() {
    if (!state.file) return;
    if (!state.uploadToken) {
      state.parsePending = true;
      openUploadAuthentication("Enter the upload token to parse and automatically save this match.");
      return;
    }
    state.diagnostics = null;
    showDiagnosticsDownload(false);
    $("demoParseButton").disabled = true;
    setStatus("Loading the browser demo parser…");
    try {
      await ensureWorker();
      const demo = await readDemo(state.file);
      const data = demo.data;
      if (data.byteLength > 450 * 1024 * 1024) {
        throw new Error("The uncompressed demo exceeds the 450 MB browser prototype limit.");
      }
      setStatus("Fingerprinting and parsing the demo locally…");
      const result = await parseWithWorker(demo.name, data, demo.compression);
      if (!result || result.error) throw new Error(result?.error || "The parser returned no match data.");
      result.played_at = demo.matchTime?.timestamp ?? null;
      result.played_at_source = demo.matchTime?.source ?? null;
      state.parsedResult = result;
      await uploadParsedMatch(result);
    } catch (error) {
      setStatus(error.message || "The demo could not be parsed.", true);
      showDiagnosticsDownload(true);
    } finally {
      $("demoParseButton").disabled = !state.file;
    }
  }

  function clear() {
    state.file = null;
    state.parsedResult = null;
    state.uploadPending = false;
    state.parsePending = false;
    state.duplicateMatchID = null;
    state.diagnostics = null;
    showDiagnosticsDownload(false);
    $("demoInput").value = "";
    $("demoFileLabel").textContent = "Choose a demo";
    $("demoParseButton").disabled = true;
    $("demoClearButton").disabled = true;
    $("demoRetryUploadButton").hidden = true;
    $("demoReplaceUploadButton").hidden = true;
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

    const compactStats = (player, ownIndex) => {
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
        trade_kills: number(player.trade_kills),
        trade_d: [number(player.tradeable_deaths), number(player.attempted_tradeable_deaths), number(player.traded_deaths ?? player.traded_tradeable_deaths)],
        utility: [
          number(player.grenade_damage?.high_explosive), number(player.grenade_damage?.fire)
        ],
        damage_received: number(player.damage_received),
        utility_thrown: [
          number(player.utility_thrown?.high_explosive), number(player.utility_thrown?.flashbang),
          number(player.utility_thrown?.smoke), number(player.utility_thrown?.fire),
          number(player.utility_thrown?.decoy)
        ],
        objectives: [number(player.objectives?.plants), number(player.objectives?.defuses)],
        speed: [...speedArray(context.speed_on_kill), ...speedArray(context.killer_speed_on_death)],
        clutches: countArray(player.clutch_wins),
        clutch_attempts: countArray(player.clutch_attempts),
        kill_rounds: countArray(player.kill_rounds),
        weapons: (player.weapon_stats || []).map(stat => [
          stat.weapon, number(stat.kills), number(stat.shots), number(stat.damage), number(stat.rounds_used), number(stat.hits)
        ]),
        duels: (player.duels || []).filter(duel => number(duel.kills) > 0).map(duel => [
          referenceIndex(duel.opponent, duel.opponent_steam_id, duel.opponent_is_bot),
          number(duel.kills)
        ]).filter(duel => duel[0] != null),
        trades: (player.trade_matchups || []).map(trade => [
          referenceIndex(trade.teammate, trade.teammate_steam_id, trade.teammate_is_bot),
          number(trade.opportunities), number(trade.attempts), number(trade.successes)
        ]).filter(trade => trade[0] != null && trade[0] !== ownIndex),
        contexts: (player.kill_context_matchups || []).map(matchup => [
          referenceIndex(matchup.victim, matchup.victim_steam_id, matchup.victim_is_bot),
          number(matchup.blinded), number(matchup.attackerBlind), number(matchup.wallbang),
          number(matchup.penetrations), number(matchup.smoke), number(matchup.airborne),
          number(matchup.moving), number(matchup.still), number(matchup.running),
          number(matchup.grenadeOut), number(matchup.knifeOut), number(matchup.equipmentDisadvantage),
          number(matchup.unfair)
        ]).filter(matchup => matchup[0] != null),
        assisted_by: (player.assisted_kill_matchups || []).map(matchup => [
          referenceIndex(matchup.assister, matchup.assister_steam_id, matchup.assister_is_bot),
          number(matchup.damage), number(matchup.flash), number(matchup.own_flash)
        ]).filter(matchup => matchup[0] != null),
        flashes: (player.flash_matchups || []).map(matchup => [
          referenceIndex(matchup.victim, matchup.victim_steam_id, matchup.victim_is_bot),
          number(matchup.flashes), Math.round(number(matchup.blind_duration) * 1000)
        ]).filter(matchup => matchup[0] != null)
      };
    };

    const trade = result.trade_definition || {};
    const movement = result.kill_context_definition || {};
    return {
      schema: "nickstats.match/9",
      nickstats_build: "2026.09.11.8",
      parser: [result.parser, result.parser_version],
      id: {
        faceit: result.provider_match_id || null,
        sha256: result.demo_sha256
      },
      map: result.map,
      played_at: Number.isFinite(result.played_at) ? Math.trunc(result.played_at) : null,
      played_at_source: result.played_at_source || null,
      rounds: result.rounds,
      rules: {
        trade: [
          trade.window_seconds, trade.proximity_units, trade.engagement_lull_seconds,
          trade.bullet_path_tolerance_units, trade.he_damage_caps?.unarmored, trade.he_damage_caps?.armored
        ],
        movement: [movement.still_speed_tolerance_units_per_second, movement.running_threshold_percent_of_weapon_max],
        equipment_disadvantage_seconds: movement.equipment_disadvantage_lookback_seconds
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
        sides: [
          compactStats(player.by_side?.T, playerIndex.get(player)),
          compactStats(player.by_side?.CT, playerIndex.get(player))
        ]
      }))
    };
  }

  function downloadJson() {
    if (!state.result) return;
    const payload = state.storedPayload || compactMatchResult(state.result);
    const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = state.selectedMatchID
      ? `nickstats-match-${state.selectedMatchID}.json`
      : `${(state.file?.name || "demo").replace(/\.(?:dem(?:\.(?:gz|zst))?|gz|zst|zip)$/i, "")}-nickstats.json`;
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
    const sourceName = state.diagnostics.source_file || state.file?.name || "demo";
    anchor.download = `${String(sourceName).replace(/\.(?:dem(?:\.(?:gz|zst))?|gz|zst|zip)$/i, "")}-diagnostics.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  $("demoInput").addEventListener("change", event => chooseFile(event.target.files[0]));
  $("demoParseButton").addEventListener("click", parseDemo);
  $("demoClearButton").addEventListener("click", clear);
  $("demoDownloadButton").addEventListener("click", downloadJson);
  $("demoDiagnosticsDownloadButton").addEventListener("click", downloadDiagnostics);
  $("demoRetryUploadButton").addEventListener("click", () => uploadParsedMatch());
  $("demoReplaceUploadButton").addEventListener("click", () => {
    if (state.duplicateMatchID == null || !state.parsedResult) return;
    if (!confirm(`Replace match #${state.duplicateMatchID} with these newly parsed statistics?`)) return;
    uploadParsedMatch(state.parsedResult, { replace: true });
  });
  $("demoAuthButton").addEventListener("click", () => openUploadAuthentication());
  $("demoAuthForm").addEventListener("submit", event => {
    event.preventDefault();
    const token = $("demoAuthToken").value.trim();
    if (!token) {
      openUploadAuthentication("Enter the upload token.");
      return;
    }
    state.uploadToken = token;
    updateUploadAuthenticationDisplay();
    $("demoAuthDialog").close();
    if (state.uploadPending && state.parsedResult) {
      uploadParsedMatch();
    } else if (state.parsePending) {
      state.parsePending = false;
      parseDemo();
    } else {
      setStatus("Automatic database uploads are enabled. Choose one demo file.");
    }
  });
  $("demoAuthCancelButton").addEventListener("click", () => {
    state.parsePending = false;
    $("demoAuthDialog").close();
    if (state.file && !state.parsedResult) {
      setStatus("Ready to parse. Automatic upload requires the private token.");
    }
  });
  $("demoAuthDialog").addEventListener("cancel", () => {
    state.parsePending = false;
  });
  demoSideControl = window.NickStatsFilters.bindSideToggle({ selector: "[data-demo-side]", valueFor: button => button.dataset.demoSide, onChange: side => setSideFilter(side) });
  document.querySelectorAll("[data-demo-result-view]").forEach(button => {
    button.addEventListener("click", () => setResultView(button.dataset.demoResultView));
  });
  document.querySelectorAll("[data-match-browser-view]").forEach(button => {
    button.addEventListener("click", () => setMatchBrowserView(button.dataset.matchBrowserView));
  });
  $("matchListRefreshButton").addEventListener("click", () => loadMatches());
  $("matchListPreviousButton").addEventListener("click", () => loadMatches(Math.max(0, state.matchListOffset - MATCH_LIST_LIMIT)));
  $("matchListNextButton").addEventListener("click", () => loadMatches(state.matchListOffset + MATCH_LIST_LIMIT));

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
  updateUploadAuthenticationDisplay();
  loadMatches(0);
})();
