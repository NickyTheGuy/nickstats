"use strict";

const PARSER_URL = "https://cdn.jsdelivr.net/npm/@deademx/cs2@4.0.0/dist/deadem-cs2.min.js";
let libraryError = null;

try {
  self.window = self;
  importScripts(PARSER_URL);
  if (!self.deademCs2) throw new Error("The parser library loaded without its browser API.");
} catch (error) {
  libraryError = error;
}

self.postMessage(libraryError
  ? { type: "error", message: `Could not load the demo parser: ${libraryError.message || libraryError}` }
  : { type: "ready" });

self.addEventListener("message", async event => {
  if (event.data?.type !== "parse") return;
  if (libraryError) {
    self.postMessage({ type: "error", message: libraryError.message || String(libraryError) });
    return;
  }

  try {
    const result = await parseDemo(event.data.name, event.data.data);
    self.postMessage({ type: "result", result });
  } catch (error) {
    self.postMessage({
      type: "error",
      message: friendlyError(error),
      diagnostics: error?.diagnostics || null
    });
  }
});

async function parseDemo(fileName, buffer) {
  const {
    InterceptorStage,
    MessagePacketType,
    Parser,
    ParserConfiguration,
    StringTableType
  } = self.deademCs2;

  const parser = new Parser(new ParserConfiguration({
    entityClasses: ["CCSTeam", "CCSPlayerController"],
    messagePacketTypes: [
      MessagePacketType.SVC_SERVER_INFO,
      MessagePacketType.SVC_PACKET_ENTITIES,
      MessagePacketType.GE_SOURCE1_LEGACY_GAME_EVENT_LIST,
      MessagePacketType.GE_SOURCE1_LEGACY_GAME_EVENT,
      MessagePacketType.CS_UM_END_OF_MATCH_ALL_PLAYERS_DATA
    ]
  }));

  const descriptors = new Map();
  const stats = new Map();
  const identityRows = new Map();
  const teamNow = new Map();
  const originalTeam = new Map();
  const teamScores = new Map();
  const eventCounts = new Map();
  const packetCounts = {
    demo_packets: 0,
    server_info: 0,
    event_lists: 0,
    game_events: 0,
    match_end: 0
  };
  let matchEnd = null;
  let endState = null;
  let mapName = "";
  let tickInterval = 1 / 64;
  let completedRounds = 0;
  let round = freshRound();
  let resetSeen = false;

  function ensurePlayer(userId, values = {}) {
    if (!Number.isInteger(userId)) return null;
    let row = stats.get(userId);
    if (!row) {
      const steamId = steamIdOf(values);
      const name = values.name || `Player ${userId}`;
      row = (steamId && identityRows.get(`steam:${steamId}`)) ||
        identityRows.get(`name:${normalizeName(name)}`);
      if (!row) {
        row = {
          userId,
          userIds: new Set(),
          name,
          steamId,
          kills: 0,
          deaths: 0,
          assists: 0,
          headshots: 0,
          damage: 0,
          kastRounds: 0,
          killRounds: 0,
          assistRounds: 0,
          survivalRounds: 0,
          tradeRounds: 0,
          rounds: 0,
          openingKills: 0,
          openingDeaths: 0,
          multikillRounds: 0
        };
      }
      row.userIds.add(userId);
      stats.set(userId, row);
      if (steamId) identityRows.set(`steam:${steamId}`, row);
      identityRows.set(`name:${normalizeName(name)}`, row);
    } else {
      if (values.name) row.name = values.name;
      const steamId = steamIdOf(values);
      if (steamId) {
        row.steamId = steamId;
        identityRows.set(`steam:${steamId}`, row);
      }
      identityRows.set(`name:${normalizeName(row.name)}`, row);
    }
    return row;
  }

  function refreshUserInfo() {
    let table;
    try {
      table = parser.getDemo().stringTableContainer.getByName(StringTableType.USER_INFO.name);
    } catch {
      return;
    }
    if (!table) return;
    for (const entry of table.getEntries()) {
      const value = entry?.value || {};
      if (!Number.isInteger(value.userid)) continue;
      ensurePlayer(value.userid, value);
    }
  }

  function resetMatchCounters() {
    completedRounds = 0;
    round = freshRound();
    teamScores.clear();
    for (const row of stats.values()) {
      row.kills = 0;
      row.deaths = 0;
      row.assists = 0;
      row.headshots = 0;
      row.damage = 0;
      row.kastRounds = 0;
      row.killRounds = 0;
      row.assistRounds = 0;
      row.survivalRounds = 0;
      row.tradeRounds = 0;
      row.rounds = 0;
      row.openingKills = 0;
      row.openingDeaths = 0;
      row.multikillRounds = 0;
    }
  }

  function finishRound(winningSide) {
    if (round.finished) return;
    const participants = new Set();
    for (const [userId, row] of stats) {
      const team = teamNow.get(userId);
      if (team === 2 || team === 3) participants.add(row);
    }

    for (const row of participants) {
      const userIds = row.userIds || new Set([row.userId]);
      const has = set => [...userIds].some(userId => set.has(userId));
      const kills = [...userIds].reduce((total, userId) => total + (round.killCounts.get(userId) || 0), 0);
      const hadKill = has(round.kills);
      const hadAssist = has(round.assists);
      const wasTraded = has(round.traded);
      const survived = !has(round.deaths);
      row.rounds += 1;
      if (hadKill) row.killRounds += 1;
      if (hadAssist) row.assistRounds += 1;
      if (survived) row.survivalRounds += 1;
      if (wasTraded) row.tradeRounds += 1;
      if (survived || hadKill || hadAssist || wasTraded) {
        row.kastRounds += 1;
      }
      if (kills >= 2) row.multikillRounds += 1;
    }

    const stableWinner = dominantOriginalTeam(winningSide);
    if (stableWinner !== null) {
      teamScores.set(stableWinner, (teamScores.get(stableWinner) || 0) + 1);
    }
    completedRounds += 1;
    round.finished = true;
  }

  function inferWinnerSide() {
    if (round.winnerSide === 2 || round.winnerSide === 3) return round.winnerSide;
    const alive = { 2: 0, 3: 0 };
    for (const [userId, team] of teamNow) {
      if ((team === 2 || team === 3) && !round.deaths.has(userId)) alive[team] += 1;
    }
    if (alive[2] === 0 && alive[3] > 0) return 3;
    if (alive[3] === 0 && alive[2] > 0) return 2;
    if (!round.bombPlanted) return 3;
    return null;
  }

  function dominantOriginalTeam(side) {
    if (side !== 2 && side !== 3) return null;
    const counts = new Map();
    for (const [userId, current] of teamNow) {
      if (current !== side) continue;
      const stable = originalTeam.get(userId);
      if (stable !== 2 && stable !== 3) continue;
      counts.set(stable, (counts.get(stable) || 0) + 1);
    }
    let best = null, bestCount = 0;
    for (const [stable, count] of counts) {
      if (count > bestCount) {
        best = stable;
        bestCount = count;
      }
    }
    return best;
  }

  function handleDeath(event, tick) {
    const attackerId = integer(event.attacker);
    const victimId = integer(event.userid);
    const assisterId = integer(event.assister);
    const attacker = stats.get(attackerId);
    const victim = stats.get(victimId);
    const attackerTeam = teamNow.get(attackerId);
    const victimTeam = teamNow.get(victimId);
    const enemyKill = attacker && victim && attackerId !== victimId &&
      (!attackerTeam || !victimTeam || attackerTeam !== victimTeam);

    if (victim) {
      victim.deaths += 1;
      round.deaths.add(victimId);
    }

    if (enemyKill) {
      attacker.kills += 1;
      round.kills.add(attackerId);
      round.killCounts.set(attackerId, (round.killCounts.get(attackerId) || 0) + 1);
      if (event.headshot) attacker.headshots += 1;

      if (!round.openingRecorded) {
        attacker.openingKills += 1;
        victim.openingDeaths += 1;
        round.openingRecorded = true;
      }

      const tradeWindow = Math.max(1, Math.round(5 / tickInterval));
      for (const prior of round.pendingDeaths) {
        if (prior.killer === victimId && prior.victimTeam === attackerTeam && tick - prior.tick <= tradeWindow) {
          round.traded.add(prior.victim);
        }
      }
      round.pendingDeaths.push({
        victim: victimId,
        killer: attackerId,
        victimTeam,
        tick
      });
      round.pendingDeaths = round.pendingDeaths.filter(item => tick - item.tick <= tradeWindow);
    }

    if (assisterId !== null && assisterId !== victimId) {
      const assister = stats.get(assisterId);
      if (assister && assisterId !== attackerId) {
        assister.assists += 1;
        round.assists.add(assisterId);
      }
    }
  }

  function handleDamage(event) {
    const attackerId = integer(event.attacker);
    const victimId = integer(event.userid);
    if (attackerId === null || victimId === null || attackerId === victimId) return;
    const row = stats.get(attackerId);
    if (!row) return;
    const attackerTeam = teamNow.get(attackerId);
    const victimTeam = teamNow.get(victimId);
    if (attackerTeam && victimTeam && attackerTeam === victimTeam) return;
    row.damage += Math.max(0, number(event.dmg_health));
  }

  parser.registerPostInterceptor(InterceptorStage.DEMO_PACKET, async demoPacket => {
    packetCounts.demo_packets += 1;
    if (!demoPacket.getIsInitial()) refreshUserInfo();
  });

  parser.registerPostInterceptor(InterceptorStage.MESSAGE_PACKET, async (demoPacket, messagePacket) => {
    if (messagePacket.type === MessagePacketType.SVC_SERVER_INFO) {
      packetCounts.server_info += 1;
      mapName = messagePacket.data.mapName || mapName;
      tickInterval = number(messagePacket.data.tickInterval) || tickInterval;
      return;
    }

    if (messagePacket.type === MessagePacketType.GE_SOURCE1_LEGACY_GAME_EVENT_LIST) {
      packetCounts.event_lists += 1;
      for (const descriptor of messagePacket.data.descriptors || []) {
        descriptors.set(descriptor.eventid, descriptor);
      }
      return;
    }

    if (messagePacket.type === MessagePacketType.CS_UM_END_OF_MATCH_ALL_PLAYERS_DATA) {
      packetCounts.match_end += 1;
      matchEnd = messagePacket.data;
      return;
    }

    if (messagePacket.type !== MessagePacketType.GE_SOURCE1_LEGACY_GAME_EVENT) return;
    packetCounts.game_events += 1;
    const descriptor = descriptors.get(messagePacket.data.eventid);
    if (!descriptor) return;
    eventCounts.set(descriptor.name, (eventCounts.get(descriptor.name) || 0) + 1);
    const gameEvent = zip(descriptor, messagePacket.data.keys || []);

    switch (descriptor.name) {
      case "begin_new_match":
        if (!resetSeen) {
          refreshUserInfo();
          resetMatchCounters();
          resetSeen = true;
        }
        break;
      case "round_start":
      case "round_prestart":
        round = freshRound();
        break;
      case "round_end":
        finishRound(integer(gameEvent.winner));
        break;
      case "round_officially_ended":
        finishRound(inferWinnerSide());
        break;
      case "cs_win_panel_match":
        finishRound(inferWinnerSide());
        break;
      case "bomb_planted":
        round.bombPlanted = true;
        break;
      case "bomb_defused":
        round.winnerSide = 3;
        break;
      case "bomb_exploded":
        round.winnerSide = 2;
        break;
      case "player_team": {
        const userId = integer(gameEvent.userid);
        const team = integer(gameEvent.team);
        if (userId !== null && (team === 2 || team === 3)) {
          teamNow.set(userId, team);
          if (!originalTeam.has(userId)) originalTeam.set(userId, team);
        }
        break;
      }
      case "player_spawn": {
        const userId = integer(gameEvent.userid);
        const team = integer(gameEvent.teamnum ?? gameEvent.team);
        if (userId !== null && (team === 2 || team === 3)) {
          teamNow.set(userId, team);
          if (!originalTeam.has(userId)) originalTeam.set(userId, team);
        }
        break;
      }
      case "player_death":
        handleDeath(gameEvent, demoPacket.tick);
        break;
      case "player_hurt":
        handleDamage(gameEvent);
        break;
    }
  });

  try {
    const bytes = new Uint8Array(buffer);
    const readable = new ReadableStream({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      }
    });
    await parser.parse(readable);
    refreshUserInfo();
    endState = readEndState(parser.getDemo());
  } finally {
    await parser.dispose();
  }

  if (completedRounds === 0) {
    const error = new Error("No completed rounds were found. This may not be a supported CS2 match demo.");
    error.diagnostics = {
      format_version: 1,
      parser: "@deademx/cs2",
      parser_version: "4.0.0",
      source_file: fileName,
      source_bytes: buffer.byteLength,
      map: mapName || null,
      tick_interval: tickInterval,
      completed_rounds: completedRounds,
      user_info_players: stats.size,
      descriptor_count: descriptors.size,
      packet_counts: packetCounts,
      event_counts: Object.fromEntries([...eventCounts].sort(([a], [b]) => a.localeCompare(b)))
    };
    throw error;
  }

  const finalTeams = applyMatchEndData(matchEnd, stats);
  applyControllerStats(endState, stats, finalTeams);

  const officialRounds = endState?.teams.reduce((total, team) => total + (team.score || 0), 0) || 0;
  if (officialRounds > 0) completedRounds = officialRounds;
  if (completedRounds > 0) {
    for (const row of stats.values()) row.rounds = completedRounds;
  }

  const activePlayers = [...new Set(stats.values())].filter(row =>
    row.kills || row.deaths || row.assists || row.damage
  );

  if (activePlayers.length === 0) {
    throw new Error("The demo parsed, but no player statistics were found.");
  }

  const assignments = finalTeams.size ? finalTeams : originalTeam;
  const officialTeamData = new Map((endState?.teams || []).map(team => [team.id, team]));
  const groups = groupPlayers(activePlayers, assignments);
  const teams = [...groups.entries()]
    .sort(([a], [b]) => String(a).localeCompare(String(b)))
    .map(([teamId, players], index) => {
      const official = officialTeamData.get(teamId);
      return {
        id: String(teamId),
        name: official?.name || `Team ${index + 1}`,
        score: official?.score ?? (assignments === originalTeam && teamScores.has(teamId) ? teamScores.get(teamId) : null),
        players: players
          .map(row => finishPlayer(row))
          .sort((a, b) => b.rating - a.rating || b.kills - a.kills)
      };
    });

  return {
    format_version: 1,
    parser: "@deademx/cs2",
    parser_version: "4.0.0",
    source_file: fileName,
    map: mapName,
    rounds: completedRounds,
    player_count: activePlayers.length,
    teams
  };
}

function freshRound() {
  return {
    kills: new Set(),
    deaths: new Set(),
    assists: new Set(),
    traded: new Set(),
    killCounts: new Map(),
    pendingDeaths: [],
    openingRecorded: false,
    bombPlanted: false,
    winnerSide: null,
    finished: false
  };
}

function finishPlayer(row) {
  const rounds = Math.max(1, row.rounds);
  const kpr = row.kills / rounds;
  const dpr = row.deaths / rounds;
  const apr = row.assists / rounds;
  const adr = row.damage / rounds;
  const kast = 100 * row.kastRounds / rounds;
  const impact = 2.13 * kpr + 0.42 * apr - 0.41;
  const rating = 0.0073 * kast + 0.3591 * kpr - 0.5329 * dpr +
    0.2372 * impact + 0.0032 * adr + 0.1587;

  return {
    name: row.name,
    steam_id: row.steamId,
    kills: row.kills,
    deaths: row.deaths,
    assists: row.assists,
    headshot_percent: row.kills ? 100 * row.headshots / row.kills : 0,
    adr,
    kast,
    kast_rounds: row.kastRounds,
    rounds_played: rounds,
    kast_components: {
      kill_rounds: row.killRounds,
      assist_rounds: row.assistRounds,
      survival_rounds: row.survivalRounds,
      trade_rounds: row.tradeRounds
    },
    opening_kills: row.openingKills,
    opening_deaths: row.openingDeaths,
    multikill_rounds: row.multikillRounds,
    rating: Math.max(0, rating)
  };
}

function readEndState(demo) {
  const teams = [];
  const players = [];

  for (const entity of demo.getEntitiesByClassNameIterator("CCSTeam")) {
    const id = integer(entity.getField("m_iTeamNum"));
    if (id !== 2 && id !== 3) continue;
    teams.push({
      id,
      score: numberOrNull(entity.getField("m_iScore")),
      name: entity.getField("m_szClanTeamname") || ""
    });
  }

  for (const entity of demo.getEntitiesByClassNameIterator("CCSPlayerController")) {
    const team = integer(entity.getField("m_iTeamNum"));
    const name = entity.getField("m_iszPlayerName") || "";
    if (!name || (team !== 2 && team !== 3)) continue;
    players.push({
      name,
      team,
      kills: numberOrNull(entity.getField("m_pActionTrackingServices.m_iKills")),
      deaths: numberOrNull(entity.getField("m_pActionTrackingServices.m_iDeaths")),
      assists: numberOrNull(entity.getField("m_pActionTrackingServices.m_iAssists")),
      headshots: numberOrNull(entity.getField("m_pActionTrackingServices.m_iHeadShotKills")),
      damage: numberOrNull(entity.getField("m_pActionTrackingServices.m_iDamage"))
    });
  }

  return { teams, players };
}

function applyMatchEndData(matchEnd, stats) {
  const finalTeams = new Map();
  if (!Array.isArray(matchEnd?.allplayerdata)) return finalTeams;
  const bySteam = new Map();
  const byName = new Map();
  for (const row of stats.values()) {
    if (row.steamId) bySteam.set(row.steamId, row);
    if (row.name) byName.set(normalizeName(row.name), row);
  }
  for (const player of matchEnd.allplayerdata) {
    const steamId = steamIdOf(player);
    const row = (steamId ? bySteam.get(steamId) : null) || byName.get(normalizeName(player.name));
    if (!row) continue;
    if (player.name) row.name = player.name;
    if (player.teamnumber === 2 || player.teamnumber === 3) {
      finalTeams.set(row.userId, player.teamnumber);
    }
  }
  return finalTeams;
}

function applyControllerStats(endState, stats, finalTeams) {
  if (!endState) return;
  const byName = new Map();
  for (const row of stats.values()) {
    const key = normalizeName(row.name);
    if (!byName.has(key)) byName.set(key, row);
  }
  for (const player of endState.players) {
    const row = byName.get(normalizeName(player.name));
    if (!row) continue;
    for (const field of ["kills", "deaths", "assists", "headshots", "damage"]) {
      if (player[field] !== null) row[field] = player[field];
    }
    finalTeams.set(row.userId, player.team);
  }
}

function groupPlayers(players, assignments) {
  const groups = new Map();
  for (const row of players) {
    const id = assignments.get(row.userId) || "unknown";
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(row);
  }
  return groups;
}

function zip(descriptor, keys) {
  const out = {};
  for (let i = 0; i < descriptor.keys.length; i += 1) {
    out[descriptor.keys[i].name] = valueOf(keys[i]);
  }
  return out;
}

function valueOf(key) {
  if (key == null) return null;
  switch (key.type) {
    case 1: return key.valString;
    case 2: return key.valFloat;
    case 3: return key.valLong;
    case 4: return key.valShort;
    case 5: return key.valByte;
    case 6: return key.valBool;
    case 7: return key.valUint64;
    case 8: return key.valLong;
    case 9: return key.valShort;
    default: return null;
  }
}

function steamIdOf(value) {
  const raw = value?.xuid ?? value?.steamid ?? value?.steamId;
  if (raw == null) return "";
  const text = String(raw);
  return text === "0" ? "" : text;
}

function integer(value) {
  if (value == null || value === "") return null;
  const result = Number(value);
  return Number.isInteger(result) ? result : null;
}

function number(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function numberOrNull(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function normalizeName(value) {
  return String(value || "").trim().toLocaleLowerCase();
}

function friendlyError(error) {
  const message = error?.message || String(error);
  if (/memory|allocation|out of bounds/i.test(message)) {
    return "The browser ran out of memory while parsing this demo. Close other tabs or try an extracted .dem in a desktop browser.";
  }
  return message;
}
