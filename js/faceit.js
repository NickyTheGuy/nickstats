(() => {
  "use strict";

  const API_ROOT = "https://open.faceit.com/data/v4";
  const SESSION_KEY = "nickstats.faceit.clientKey";
  const $ = id => document.getElementById(id);
  let controller = null;

  function setStatus(message, error = false) {
    $("faceitStatus").textContent = message;
    $("faceitStatus").classList.toggle("error", error);
  }

  function setBusy(busy) {
    $("faceitLoad").disabled = busy;
    $("faceitClear").disabled = busy;
    $("faceitLoad").textContent = busy ? "Loading…" : "Load from FACEIT";
  }

  function numeric(value) {
    const parsed = Number(String(value ?? "").replace(/[%+,]/g, "").trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function epochSeconds(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return parsed > 1e12 ? Math.floor(parsed / 1000) : Math.floor(parsed);
  }

  function normalizedKey(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function statsReader(stats) {
    const values = new Map(Object.entries(stats || {}).map(([key, value]) => [normalizedKey(key), value]));
    return {
      has: (...aliases) => aliases.some(alias => values.has(normalizedKey(alias))),
      get: (...aliases) => {
        for (const alias of aliases) {
          const key = normalizedKey(alias);
          if (values.has(key)) return values.get(key);
        }
        return undefined;
      }
    };
  }

  function cleanIdentifier(input) {
    const value = input.trim();
    if (!value) return "";
    try {
      const url = new URL(value);
      const marker = url.pathname.split("/").filter(Boolean);
      const playerIndex = marker.findIndex(part => part.toLowerCase() === "players");
      return playerIndex >= 0 && marker[playerIndex + 1] ? decodeURIComponent(marker[playerIndex + 1]) : value;
    } catch (_) {
      return value;
    }
  }

  function playerInputs() {
    return Array.from(new Set(
      $("faceitPlayers").value
        .split(/[\n,]+/)
        .map(cleanIdentifier)
        .filter(Boolean)
    ));
  }

  function dateRange() {
    const fromText = $("faceitFrom").value;
    const toText = $("faceitTo").value;
    if (!fromText || !toText) throw new Error("Choose both a From and Through date.");
    const fromMs = Date.parse(`${fromText}T00:00:00Z`);
    const toMs = Date.parse(`${toText}T23:59:59.999Z`);
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs > toMs) {
      throw new Error("The FACEIT date range is invalid.");
    }
    return {
      fromMs,
      toMs,
      fromSeconds: Math.floor(fromMs / 1000),
      toSeconds: Math.floor(toMs / 1000)
    };
  }

  async function request(path, key, params = {}) {
    const url = new URL(API_ROOT + path);
    Object.entries(params).forEach(([name, value]) => url.searchParams.set(name, String(value)));
    let response;
    try {
      response = await fetch(url, {
        headers: { Authorization: `Bearer ${key}` },
        signal: controller.signal
      });
    } catch (error) {
      if (error.name === "AbortError") throw error;
      throw new Error("FACEIT could not be reached from this browser. Check the key’s allowed domains and your connection.");
    }
    if (!response.ok) {
      let detail = "";
      try {
        const payload = await response.json();
        detail = payload.message || payload.errors?.[0]?.message || "";
      } catch (_) {}
      const messages = {
        401: "The FACEIT API key was rejected.",
        403: "The FACEIT key is not allowed to run from this site.",
        404: "FACEIT could not find one of those players.",
        429: "FACEIT’s rate limit was reached. Wait a moment and try again."
      };
      throw new Error(messages[response.status] || detail || `FACEIT returned HTTP ${response.status}.`);
    }
    return response.json();
  }

  async function paged(path, key, params, maximumOffset) {
    const all = [];
    const limit = 100;
    for (let offset = 0; offset <= maximumOffset; offset += limit) {
      const payload = await request(path, key, { ...params, offset, limit });
      const items = Array.isArray(payload.items) ? payload.items : [];
      all.push(...items);
      if (items.length < limit) break;
    }
    return all;
  }

  async function resolvePlayer(identifier, key) {
    const query = /^\d{17}$/.test(identifier)
      ? { game: "cs2", game_player_id: identifier }
      : { game: "cs2", nickname: identifier };
    return request("/players", key, query);
  }

  function teamEntries(match) {
    return Object.entries(match.teams || {}).filter(([, team]) => team && Array.isArray(team.players));
  }

  function historyRecord(match, playerId) {
    const teams = teamEntries(match);
    const ownEntry = teams.find(([, team]) => team.players.some(player => player.player_id === playerId));
    if (!ownEntry) return null;
    const [ownKey, ownTeam] = ownEntry;
    const opponentEntry = teams.find(([key]) => key !== ownKey);
    const opponentKey = opponentEntry?.[0];
    const score = match.results?.score || {};
    const ownScore = numeric(score[ownKey] ?? score[ownTeam.team_id]);
    const opponentScore = numeric(score[opponentKey] ?? score[opponentEntry?.[1]?.team_id]);
    const winner = match.results?.winner;
    const won = winner === ownKey || winner === ownTeam.team_id || (!winner && ownScore > opponentScore);
    return {
      id: String(match.match_id || match.id || ""),
      date: epochSeconds(match.finished_at || match.started_at),
      result: won ? "w" : "l",
      score: [ownScore, opponentScore],
      teammateIds: ownTeam.players.map(player => player.player_id).filter(id => id && id !== playerId),
      matchUrl: `https://www.faceit.com/en/cs2/room/${match.match_id}`,
      source: "faceit",
      map: match.voting?.map?.pick?.[0] || match.map || ""
    };
  }

  function normalizedStatRow(item, history) {
    const reader = statsReader(item.stats);
    const ratingAliases = ["Rating 2.0", "Player Rating 2.0", "Player Rating", "Rating", "Rating 1.0"];
    const hasRating = reader.has(...ratingAliases);
    const resultValue = reader.get("Result");
    const result = history?.result || (numeric(resultValue) > 0 || /^w/i.test(String(resultValue || "")) ? "w" : "l");
    const scoreText = String(reader.get("Score") || "");
    const scoreNumbers = scoreText.match(/\d+/g)?.map(Number) || [];
    return {
      id: String(item.match_id || reader.get("Match Id", "Match ID") || history?.id || ""),
      date: history?.date || epochSeconds(item.created_at || item.updated_at),
      result,
      k: numeric(reader.get("Kills")),
      d: numeric(reader.get("Deaths")),
      a: numeric(reader.get("Assists")),
      hs: numeric(reader.get("Headshots %", "Headshot %", "HS %")),
      adr: numeric(reader.get("ADR", "Average Damage per Round")),
      rating: numeric(reader.get(...ratingAliases)),
      map: String(reader.get("Map") || history?.map || "Unknown"),
      score: history?.score || [scoreNumbers[0] || 0, scoreNumbers[1] || 0],
      teammateIds: history?.teammateIds || [],
      matchUrl: history?.matchUrl || `https://www.faceit.com/en/cs2/room/${item.match_id}`,
      source: "faceit",
      ratingMissing: !hasRating
    };
  }

  async function fetchProfile(identifier, key, range, position, total) {
    setStatus(`Resolving ${identifier} (${position}/${total})…`);
    const player = await resolvePlayer(identifier, key);
    if (!player?.player_id) throw new Error(`FACEIT could not resolve “${identifier}”.`);

    setStatus(`Loading ${player.nickname}’s match history (${position}/${total})…`);
    const historyItems = await paged(
      `/players/${encodeURIComponent(player.player_id)}/history`,
      key,
      { game: "cs2", from: range.fromSeconds, to: range.toSeconds },
      1000
    );
    const historyById = new Map();
    historyItems.forEach(match => {
      const record = historyRecord(match, player.player_id);
      if (record?.id) historyById.set(record.id, record);
    });

    setStatus(`Loading ${player.nickname}’s match statistics (${position}/${total})…`);
    const statItems = await paged(
      `/players/${encodeURIComponent(player.player_id)}/games/cs2/stats`,
      key,
      { from: range.fromMs, to: range.toMs },
      200
    );
    const statById = new Map();
    statItems.forEach(item => {
      const id = String(item.match_id || statsReader(item.stats).get("Match Id", "Match ID") || "");
      if (id) statById.set(id, item);
    });

    const rows = [];
    historyById.forEach((history, id) => {
      const statItem = statById.get(id) || { match_id: id, stats: {} };
      rows.push(normalizedStatRow(statItem, history));
    });
    rows.sort((a, b) => b.date - a.date);
    if (!rows.length) throw new Error(`No finished CS2 matches were found for ${player.nickname} in that date range.`);

    const missingRatings = rows.filter(row => row.ratingMissing).length;
    return {
      label: player.nickname,
      alias: player.nickname,
      profileId: player.player_id,
      source: "faceit",
      filters: {
        date: { value: `${$("faceitFrom").value}:${$("faceitTo").value}`, label: `${$("faceitFrom").value} through ${$("faceitTo").value}` },
        mode: { value: "faceit-cs2", label: "FACEIT CS2" }
      },
      rows,
      missingRatings
    };
  }

  async function loadPlayers() {
    const key = $("faceitApiKey").value.trim().replace(/^Bearer\s+/i, "");
    const identifiers = playerInputs();
    if (!key) {
      setStatus("Paste a FACEIT client-side API key first.", true);
      return;
    }
    if (identifiers.length < 2) {
      setStatus("Enter at least two different players.", true);
      return;
    }

    let range;
    try {
      range = dateRange();
    } catch (error) {
      setStatus(error.message, true);
      return;
    }

    sessionStorage.setItem(SESSION_KEY, key);
    controller?.abort();
    controller = new AbortController();
    setBusy(true);
    try {
      const profiles = [];
      for (let index = 0; index < identifiers.length; index++) {
        profiles.push(await fetchProfile(identifiers[index], key, range, index + 1, identifiers.length));
      }
      const analysis = window.CSStatsApp.loadPlayers("faceit", profiles);
      const missing = profiles.reduce((sum, profile) => sum + profile.missingRatings, 0);
      setStatus(
        `Done: ${analysis.players.length} players loaded from FACEIT.${missing ? ` ${missing} match ratings were unavailable; see the warning above.` : ""}`
      );
    } catch (error) {
      if (error.name !== "AbortError") {
        window.CSStatsApp.clearAnalysis("faceit");
        setStatus(error.message || "FACEIT data could not be loaded.", true);
      }
    } finally {
      setBusy(false);
    }
  }

  function clear() {
    controller?.abort();
    controller = null;
    window.CSStatsApp.clearAnalysis("faceit");
    setStatus("FACEIT results cleared. Your player list and session key are still here.");
    setBusy(false);
  }

  function setDefaultDates() {
    const through = new Date();
    const from = new Date(through);
    from.setUTCDate(from.getUTCDate() - 30);
    $("faceitFrom").value = from.toISOString().slice(0, 10);
    $("faceitTo").value = through.toISOString().slice(0, 10);
  }

  try {
    $("faceitApiKey").value = sessionStorage.getItem(SESSION_KEY) || "";
  } catch (_) {}
  setDefaultDates();
  $("faceitLoad").addEventListener("click", loadPlayers);
  $("faceitClear").addEventListener("click", clear);
})();
