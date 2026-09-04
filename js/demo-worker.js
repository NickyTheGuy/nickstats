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
    messagePacketTypes: [
      MessagePacketType.SVC_SERVER_INFO,
      MessagePacketType.GE_SOURCE1_LEGACY_GAME_EVENT_LIST,
      MessagePacketType.GE_SOURCE1_LEGACY_GAME_EVENT,
      MessagePacketType.CS_UM_END_OF_MATCH_ALL_PLAYERS_DATA
    ]
  }));

  const descriptors = new Map();
  const stats = new Map();
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
  let mapName = "";
  let tickInterval = 1 / 64;
  let completedRounds = 0;
  let round = freshRound();
  let resetSeen = false;

  function ensurePlayer(userId, values = {}) {
    if (!Number.isInteger(userId)) return null;
    let row = stats.get(userId);
    if (!row) {
      row = {
        userId,
        name: values.name || `Player ${userId}`,
        steamId: steamIdOf(values),
        kills: 0,
        deaths: 0,
        assists: 0,
        headshots: 0,
        damage: 0,
        kastRounds: 0,
        rounds: 0,
        openingKills: 0,
        openingDeaths: 0,
        multikillRounds: 0
      };
      stats.set(userId, row);
    } else {
      if (values.name) row.name = values.name;
      const steamId = steamIdOf(values);
      if (steamId) row.steamId = steamId;
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
      row.rounds = 0;
      row.openingKills = 0;
      row.openingDeaths = 0;
      row.multikillRounds = 0;
    }
  }

  function finishRound(winningSide) {
    if (round.finished) return;
    const participants = [...stats.keys()].filter(userId => {
      const team = teamNow.get(userId);
      return team === 2 || team === 3;
    });

    for (const userId of participants) {
      const row = stats.get(userId);
      row.rounds += 1;
      const survived = !round.deaths.has(userId);
      if (survived || round.kills.has(userId) || round.assists.has(userId) || round.traded.has(userId)) {
        row.kastRounds += 1;
      }
      if ((round.killCounts.get(userId) || 0) >= 2) row.multikillRounds += 1;
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

  applyMatchEndData(matchEnd, stats, originalTeam);
  const activePlayers = [...stats.values()].filter(row =>
    row.kills || row.deaths || row.assists || row.damage
  );

  if (activePlayers.length === 0) {
    throw new Error("The demo parsed, but no player statistics were found.");
  }

  const groups = groupPlayers(activePlayers, originalTeam);
  const teams = [...groups.entries()]
    .sort(([a], [b]) => String(a).localeCompare(String(b)))
    .map(([teamId, players], index) => ({
      id: String(teamId),
      name: `Team ${index + 1}`,
      score: teamScores.has(teamId) ? teamScores.get(teamId) : null,
      players: players
        .map(row => finishPlayer(row))
        .sort((a, b) => b.rating - a.rating || b.kills - a.kills)
    }));

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
    opening_kills: row.openingKills,
    opening_deaths: row.openingDeaths,
    multikill_rounds: row.multikillRounds,
    rating: Math.max(0, rating)
  };
}

function applyMatchEndData(matchEnd, stats, originalTeam) {
  if (!Array.isArray(matchEnd?.allplayerdata)) return;
  const bySteam = new Map();
  for (const row of stats.values()) {
    if (row.steamId) bySteam.set(row.steamId, row);
  }
  for (const player of matchEnd.allplayerdata) {
    const steamId = steamIdOf(player);
    const row = steamId ? bySteam.get(steamId) : null;
    if (!row) continue;
    if (player.name) row.name = player.name;
    if (!originalTeam.has(row.userId) && (player.teamnumber === 2 || player.teamnumber === 3)) {
      originalTeam.set(row.userId, player.teamnumber);
    }
  }
}

function groupPlayers(players, originalTeam) {
  const groups = new Map();
  for (const row of players) {
    const id = originalTeam.get(row.userId) || "unknown";
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

function friendlyError(error) {
  const message = error?.message || String(error);
  if (/memory|allocation|out of bounds/i.test(message)) {
    return "The browser ran out of memory while parsing this demo. Close other tabs or try an extracted .dem in a desktop browser.";
  }
  return message;
}
