"use strict";

const PARSER_URL = "https://cdn.jsdelivr.net/npm/@deademx/cs2@4.0.0/dist/deadem-cs2.min.js";
const TRADE_WINDOW_SECONDS = 5;
const TRADE_PROXIMITY_UNITS = 250;
const TRADE_ENGAGEMENT_LULL_SECONDS = 2;
const BULLET_PATH_TOLERANCE_UNITS = 96;
const HE_MAX_DAMAGE_UNARMORED = 98;
const HE_MAX_DAMAGE_ARMORED = 57;
const TRADE_AUDIT_RADII = [150, 200, 250, 300, 400, 500];
const NON_WEAPON_SPEED_KILLS = new Set([
  "hegrenade", "inferno", "molotov", "incgrenade", "flashbang",
  "smokegrenade", "decoy", "tagrenade", "c4", "planted_c4", "world"
]);
const WEAPON_MAX_SPEED = Object.freeze({
  ak47: [215, 215], aug: [220, 150], awp: [200, 100], bizon: [240, 240],
  cz75a: [240, 240], deagle: [230, 230], elite: [240, 240], famas: [220, 220],
  fiveseven: [240, 240], g3sg1: [215, 120], galilar: [215, 215], glock: [240, 240],
  hkp2000: [240, 240], m249: [195, 195], m4a1: [225, 225], m4a1_silencer: [225, 225],
  mac10: [240, 240], mag7: [225, 225], mp5sd: [235, 235], mp7: [220, 220],
  mp9: [240, 240], negev: [150, 150], nova: [220, 220], p250: [240, 240],
  p90: [230, 230], revolver: [220, 220], sawedoff: [210, 210], scar20: [215, 120],
  sg556: [210, 150], ssg08: [230, 230], taser: [220, 220], tec9: [240, 240],
  ump45: [230, 230], usp_silencer: [240, 240], xm1014: [215, 215]
});
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
    entityClasses: ["CCSTeam", "CCSPlayerController", "CCSPlayerPawn"],
    messagePacketTypes: [
      MessagePacketType.SVC_SERVER_INFO,
      MessagePacketType.SVC_PACKET_ENTITIES,
      MessagePacketType.GE_SOURCE1_LEGACY_GAME_EVENT_LIST,
      MessagePacketType.GE_SOURCE1_LEGACY_GAME_EVENT,
      MessagePacketType.CS_UM_END_OF_MATCH_ALL_PLAYERS_DATA
    ]
  }));
  const providerMatchId = faceitMatchId(fileName);
  const demoSha256 = await sha256(buffer);

  const descriptors = new Map();
  const stats = new Map();
  const identityRows = new Map();
  const teamNow = new Map();
  const originalTeam = new Map();
  const teamScores = new Map();
  const eventCounts = new Map();
  const blindUntilTick = new Map();
  const positionSamples = new Map();
  const derivedSpeeds = new Map();
  const tradeAudit = [];
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
          isBot: Boolean(values.fakeplayer) || !steamId,
          observedOpponents: new Set(),
          weaponStats: new Map(),
          duelStats: new Map(),
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
          tradeKills: 0,
          tradedDeaths: 0,
          tradeOpportunities: 0,
          tradeAttempts: 0,
          tradeSuccesses: 0,
          tradeableDeaths: 0,
          attemptedTradeableDeaths: 0,
          tradedTradeableDeaths: 0,
          tradedBy: new Map(),
          tradeProximityDistances: [],
          provenTradeOpportunities: { bullet_path: 0, damage: 0, kill: 0 },
          damageAssistedKills: 0,
          flashAssistedKills: 0,
          enemiesFlashed: 0,
          flashAssists: 0,
          heDamage: 0,
          fireDamage: 0,
          blindedEnemyKills: 0,
          deathsWhileBlind: 0,
          killsWhileBlind: 0,
          deathsToBlindKiller: 0,
          wallbangKills: 0,
          wallbangDeaths: 0,
          killPenetrations: 0,
          deathPenetrations: 0,
          smokeKills: 0,
          smokeDeaths: 0,
          airborneKills: 0,
          deathsToAirborneKiller: 0,
          speedOnKillTotal: 0,
          speedOnKillSamples: 0,
          maxSpeedOnKill: 0,
          speedOnKillPercentTotal: 0,
          speedOnKillPercentSamples: 0,
          maxSpeedOnKillPercent: 0,
          killerSpeedTotal: 0,
          killerSpeedSamples: 0,
          maxKillerSpeed: 0,
          killerSpeedPercentTotal: 0,
          killerSpeedPercentSamples: 0,
          maxKillerSpeedPercent: 0,
          rounds: 0,
          openingKills: 0,
          openingDeaths: 0,
          multikillRounds: 0,
          killRoundsByCount: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
          clutchWins: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
        };
      }
      row.userIds.add(userId);
      stats.set(userId, row);
      if (steamId) identityRows.set(`steam:${steamId}`, row);
      identityRows.set(`name:${normalizeName(name)}`, row);
    } else {
      if (values.name) row.name = values.name;
      if (values.fakeplayer) row.isBot = true;
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

  function refreshControllerTeams() {
    let demo;
    try {
      demo = parser.getDemo();
    } catch {
      return;
    }
    const byName = new Map();
    for (const row of new Set(stats.values())) byName.set(normalizeName(row.name), row);
    for (const entity of demo.getEntitiesByClassNameIterator("CCSPlayerController")) {
      const team = integer(entity.getField("m_iTeamNum"));
      const row = byName.get(normalizeName(entity.getField("m_iszPlayerName")));
      if (!row || (team !== 2 && team !== 3)) continue;
      for (const userId of row.userIds) teamNow.set(userId, team);
      if (!originalTeam.has(row.userId)) originalTeam.set(row.userId, team);
    }
  }

  function captureLiveParticipants() {
    refreshControllerTeams();
    let demo;
    try {
      demo = parser.getDemo();
    } catch {
      return;
    }
    const byName = new Map();
    for (const row of new Set(stats.values())) byName.set(normalizeName(row.name), row);
    for (const entity of demo.getEntitiesByClassNameIterator("CCSPlayerController")) {
      const team = integer(entity.getField("m_iTeamNum"));
      const row = byName.get(normalizeName(entity.getField("m_iszPlayerName")));
      if (!row || (team !== 2 && team !== 3)) continue;
      round.participants.add(row.userId);
    }
  }

  function resetMatchCounters() {
    completedRounds = 0;
    round = freshRound();
    teamScores.clear();
    tradeAudit.length = 0;
    blindUntilTick.clear();
    positionSamples.clear();
    derivedSpeeds.clear();
    for (const row of stats.values()) {
      row.kills = 0;
      row.weaponStats = new Map();
      row.duelStats = new Map();
      row.deaths = 0;
      row.assists = 0;
      row.headshots = 0;
      row.damage = 0;
      row.kastRounds = 0;
      row.killRounds = 0;
      row.assistRounds = 0;
      row.survivalRounds = 0;
      row.tradeRounds = 0;
      row.tradeKills = 0;
      row.tradedDeaths = 0;
      row.tradeOpportunities = 0;
      row.tradeAttempts = 0;
      row.tradeSuccesses = 0;
      row.tradeableDeaths = 0;
      row.attemptedTradeableDeaths = 0;
      row.tradedTradeableDeaths = 0;
      row.tradedBy = new Map();
      row.tradeProximityDistances = [];
      row.provenTradeOpportunities = { bullet_path: 0, damage: 0, kill: 0 };
      row.damageAssistedKills = 0;
      row.flashAssistedKills = 0;
      row.enemiesFlashed = 0;
      row.flashAssists = 0;
      row.heDamage = 0;
      row.fireDamage = 0;
      row.blindedEnemyKills = 0;
      row.deathsWhileBlind = 0;
      row.killsWhileBlind = 0;
      row.deathsToBlindKiller = 0;
      row.wallbangKills = 0;
      row.wallbangDeaths = 0;
      row.killPenetrations = 0;
      row.deathPenetrations = 0;
      row.smokeKills = 0;
      row.smokeDeaths = 0;
      row.airborneKills = 0;
      row.deathsToAirborneKiller = 0;
      row.speedOnKillTotal = 0;
      row.speedOnKillSamples = 0;
      row.maxSpeedOnKill = 0;
      row.speedOnKillPercentTotal = 0;
      row.speedOnKillPercentSamples = 0;
      row.maxSpeedOnKillPercent = 0;
      row.killerSpeedTotal = 0;
      row.killerSpeedSamples = 0;
      row.maxKillerSpeed = 0;
      row.killerSpeedPercentTotal = 0;
      row.killerSpeedPercentSamples = 0;
      row.maxKillerSpeedPercent = 0;
      row.rounds = 0;
      row.openingKills = 0;
      row.openingDeaths = 0;
      row.multikillRounds = 0;
      row.killRoundsByCount = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      row.clutchWins = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    }
  }

  function finishRound(winningSide, requireActivity = false) {
    // round_prestart for the next round can precede the delayed
    // round_officially_ended event for the previous one.
    if (round.finished || (requireActivity && !round.hasActivity)) return false;
    refreshControllerTeams();
    const participants = new Set(
      [...round.participants].map(userId => stats.get(userId)).filter(Boolean)
    );
    if (participants.size === 0 && !round.freezeSeen) {
      for (const row of stats.values()) participants.add(row);
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
      if (kills >= 1) row.killRoundsByCount[Math.min(5, kills)] += 1;
    }

    for (const candidate of round.clutchCandidates) {
      if (candidate.side === winningSide && candidate.opponents >= 1 && candidate.opponents <= 5) {
        candidate.row.clutchWins[candidate.opponents] += 1;
      }
    }

    const stableWinner = dominantOriginalTeam(winningSide);
    if (stableWinner !== null) {
      teamScores.set(stableWinner, (teamScores.get(stableWinner) || 0) + 1);
    }
    completedRounds += 1;
    round.finished = true;
    return true;
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

  function livingTeammateDistances(victimId, victimTeam) {
    if (victimTeam !== 2 && victimTeam !== 3) return new Map();
    const positions = currentPlayerPositions();
    const victimRow = stats.get(victimId);
    const victimPosition = victimRow ? positions.get(victimRow.userId) : null;
    if (!victimPosition) return new Map();
    const teammateDistances = new Map();
    for (const row of new Set(stats.values())) {
      const rowTeam = [...row.userIds].map(userId => teamNow.get(userId)).find(team => team === 2 || team === 3);
      if (row === victimRow || rowTeam !== victimTeam) continue;
      const died = [...row.userIds].some(userId => round.deaths.has(userId));
      const position = positions.get(row.userId);
      const separation = position ? distance(position, victimPosition) : null;
      if (!died && separation !== null) {
        teammateDistances.set(row.userId, separation);
      }
    }
    return teammateDistances;
  }

  function currentPlayerPositions() {
    let demo;
    try {
      demo = parser.getDemo();
    } catch {
      return new Map();
    }
    const positions = new Map();
    const byName = new Map();
    for (const row of new Set(stats.values())) byName.set(normalizeName(row.name), row);
    for (const pawn of demo.getEntitiesByClassNameIterator("CCSPlayerPawn")) {
      const controller = demo.getEntityByHandle(pawn.getField("m_hController"));
      if (!controller) continue;
      const row = byName.get(normalizeName(controller.getField("m_iszPlayerName")));
      const position = pawnPosition(pawn);
      if (row && position) positions.set(row.userId, position);
    }
    return positions;
  }

  function currentPlayerMotion(userId, tick, deathEvent) {
    let demo;
    try {
      demo = parser.getDemo();
    } catch {
      return null;
    }
    const row = stats.get(userId);
    if (!row) return null;
    for (const pawn of demo.getEntitiesByClassNameIterator("CCSPlayerPawn")) {
      const controller = demo.getEntityByHandle(pawn.getField("m_hController"));
      if (!controller || normalizeName(controller.getField("m_iszPlayerName")) !== normalizeName(row.name)) continue;
      const entitySpeed = pawnHorizontalSpeed(pawn);
      const fallback = derivedSpeeds.get(row.userId);
      const speed = entitySpeed ?? (
        fallback && tick - fallback.tick <= Math.ceil(0.25 / tickInterval) ? fallback.speed : null
      );
      if (speed === null) return null;
      const scopedField = safePawnField(pawn, "m_bIsScoped");
      const scoped = scopedField === null || scopedField === undefined
        ? inferredScopedKill(deathEvent)
        : Boolean(scopedField);
      const maxSpeed = pawnMovementMaxSpeed(pawn) ?? weaponMovementMaxSpeed(deathEvent.weapon, scoped);
      return { speed, maxSpeed };
    }
    const fallback = derivedSpeeds.get(row.userId);
    if (!fallback || tick - fallback.tick > Math.ceil(0.25 / tickInterval)) return null;
    return { speed: fallback.speed, maxSpeed: weaponMovementMaxSpeed(deathEvent.weapon, inferredScopedKill(deathEvent)) };
  }

  function samplePlayerMotion(tick) {
    if (!Number.isFinite(tick)) return;
    for (const [userId, position] of currentPlayerPositions()) {
      const previous = positionSamples.get(userId);
      if (previous && tick > previous.tick) {
        const seconds = (tick - previous.tick) * tickInterval;
        const speed = seconds > 0 ? Math.hypot(position.x - previous.position.x, position.y - previous.position.y) / seconds : null;
        // Ignore discontinuities such as spawns, reconnects, and observer jumps.
        if (Number.isFinite(speed) && speed <= 2000) derivedSpeeds.set(userId, { speed, tick });
      }
      positionSamples.set(userId, { position, tick });
    }
  }

  function tradeIsOpen(prior, traderId, tick) {
    const tradeWindow = Math.max(1, Math.round(TRADE_WINDOW_SECONDS / tickInterval));
    if (tick - prior.tick <= tradeWindow) return true;
    const lastEngagement = prior.engagementTicks.get(traderId);
    const lull = Math.max(1, Math.round(TRADE_ENGAGEMENT_LULL_SECONDS / tickInterval));
    return Number.isFinite(lastEngagement) && tick - lastEngagement <= lull;
  }

  function refreshTradeEngagement(prior, traderId, tick) {
    prior.engagementTicks.set(traderId, tick);
  }

  function pendingTradeIsAlive(prior, tick) {
    const tradeWindow = Math.max(1, Math.round(TRADE_WINDOW_SECONDS / tickInterval));
    if (tick - prior.tick <= tradeWindow) return true;
    const lull = Math.max(1, Math.round(TRADE_ENGAGEMENT_LULL_SECONDS / tickInterval));
    return [...prior.engagementTicks.values()].some(lastTick => tick - lastTick <= lull);
  }

  function ensureTradeOpportunity(prior, trader, source = "proven") {
    if (!prior || !trader || prior.capableTraders.has(trader.userId)) return;
    const hadOpportunity = prior.capableTraders.size > 0;
    prior.capableTraders.add(trader.userId);
    trader.tradeOpportunities += 1;
    if (Object.hasOwn(trader.provenTradeOpportunities, source)) {
      trader.provenTradeOpportunities[source] += 1;
    }
    prior.audit.candidates.push({
      player: trader.name,
      distance: Number.isFinite(prior.teammateDistances.get(trader.userId))
        ? Math.round(prior.teammateDistances.get(trader.userId))
        : null,
      opportunity_source: source,
      attempted: false,
      attempt_source: null,
      success: false
    });
    if (!hadOpportunity) {
      const victim = stats.get(prior.victim);
      if (victim) victim.tradeableDeaths += 1;
    }
  }

  function recordTradeAttempt(prior, trader, source) {
    ensureTradeOpportunity(prior, trader, source);
    if (!prior || !trader || prior.attemptedTraders.has(trader.userId)) return;
    prior.attemptedTraders.add(trader.userId);
    trader.tradeAttempts += 1;
    const auditCandidate = prior.audit.candidates.find(candidate => candidate.player === trader.name);
    if (auditCandidate) {
      auditCandidate.attempted = true;
      auditCandidate.attempt_source = source;
    }
    if (!prior.deathAttempted) {
      prior.deathAttempted = true;
      const victim = stats.get(prior.victim);
      if (victim) victim.attemptedTradeableDeaths += 1;
    }
  }

  function damageProvesTradeAttempt(event, damage) {
    const weapon = String(event.weapon || "").toLocaleLowerCase();
    if (weapon === "hegrenade") {
      const healthAfter = numberOrNull(event.health);
      if (healthAfter === null) return false;
      const armorAfter = numberOrNull(event.armor) ?? 0;
      const armorDamage = numberOrNull(event.dmg_armor) ?? 0;
      const wasArmored = armorAfter + armorDamage > 0;
      const maximum = wasArmored ? HE_MAX_DAMAGE_ARMORED : HE_MAX_DAMAGE_UNARMORED;
      return healthAfter + damage <= maximum;
    }
    if (["inferno", "molotov", "incgrenade", "flashbang", "decoy", "smokegrenade"].includes(weapon)) {
      return false;
    }
    return true;
  }

  function weaponStat(row, weapon) {
    const id = weaponStatId(weapon);
    if (!row || !id || id === "world") return null;
    let stat = row.weaponStats.get(id);
    if (!stat) {
      stat = { weapon: id, kills: 0, shots: 0, damage: 0, purchases: 0 };
      row.weaponStats.set(id, stat);
    }
    return stat;
  }

  function duelStat(row, opponent) {
    if (!row || !opponent) return null;
    let stat = row.duelStats.get(opponent);
    if (!stat) {
      stat = { kills: 0, deaths: 0 };
      row.duelStats.set(opponent, stat);
    }
    return stat;
  }

  function handleDeath(event, tick) {
    refreshControllerTeams();
    const attackerId = integer(event.attacker);
    const victimId = integer(event.userid);
    const assisterId = integer(event.assister);
    const attacker = stats.get(attackerId);
    const victim = stats.get(victimId);
    const attackerTeam = teamNow.get(attackerId);
    const victimTeam = teamNow.get(victimId);
    const enemyKill = attacker && victim && attackerId !== victimId &&
      (attackerTeam === 2 || attackerTeam === 3) &&
      (victimTeam === 2 || victimTeam === 3) &&
      attackerTeam !== victimTeam;

    if (attackerId !== null) round.participants.add(attackerId);
    if (victimId !== null) round.participants.add(victimId);
    if (assisterId !== null) round.participants.add(assisterId);

    const teammateDistances = enemyKill ? livingTeammateDistances(victimId, victimTeam) : new Map();
    const nearbyCandidates = new Map(
      [...teammateDistances].filter(([, separation]) => separation <= TRADE_PROXIMITY_UNITS)
    );
    const nearbyTraders = new Set(nearbyCandidates.keys());
    if (victim) {
      victim.deaths += 1;
      round.deaths.add(victimId);
      if (nearbyTraders.size) victim.tradeableDeaths += 1;
    }

    if (enemyKill) {
      attacker.observedOpponents.add(victim);
      victim.observedOpponents.add(attacker);
      attacker.kills += 1;
      duelStat(attacker, victim).kills += 1;
      duelStat(victim, attacker).deaths += 1;
      const killWeapon = weaponStat(attacker, event.weapon);
      if (killWeapon) killWeapon.kills += 1;
      const victimWasBlind = (blindUntilTick.get(victim.userId) ?? -1) >= tick;
      const attackerWasBlind = Boolean(event.attackerblind);
      const penetrations = Math.max(0, integer(event.penetrated) ?? 0);
      const throughSmoke = Boolean(event.thrusmoke);
      const attackerInAir = Boolean(event.attackerinair);
      const speedEligible = !isNonWeaponSpeedKill(event.weapon);
      const attackerMotion = speedEligible ? currentPlayerMotion(attackerId, tick, event) : null;
      if (victimWasBlind) {
        attacker.blindedEnemyKills += 1;
        victim.deathsWhileBlind += 1;
      }
      if (attackerWasBlind) {
        attacker.killsWhileBlind += 1;
        victim.deathsToBlindKiller += 1;
      }
      if (penetrations > 0) {
        attacker.wallbangKills += 1;
        victim.wallbangDeaths += 1;
        attacker.killPenetrations += penetrations;
        victim.deathPenetrations += penetrations;
      }
      if (throughSmoke) {
        attacker.smokeKills += 1;
        victim.smokeDeaths += 1;
      }
      if (attackerInAir) {
        attacker.airborneKills += 1;
        victim.deathsToAirborneKiller += 1;
      }
      if (attackerMotion) {
        const attackerSpeed = attackerMotion.speed;
        attacker.speedOnKillTotal += attackerSpeed;
        attacker.speedOnKillSamples += 1;
        attacker.maxSpeedOnKill = Math.max(attacker.maxSpeedOnKill, attackerSpeed);
        victim.killerSpeedTotal += attackerSpeed;
        victim.killerSpeedSamples += 1;
        victim.maxKillerSpeed = Math.max(victim.maxKillerSpeed, attackerSpeed);
        if (attackerMotion.maxSpeed > 0) {
          const percent = 100 * attackerSpeed / attackerMotion.maxSpeed;
          attacker.speedOnKillPercentTotal += percent;
          attacker.speedOnKillPercentSamples += 1;
          attacker.maxSpeedOnKillPercent = Math.max(attacker.maxSpeedOnKillPercent, percent);
          victim.killerSpeedPercentTotal += percent;
          victim.killerSpeedPercentSamples += 1;
          victim.maxKillerSpeedPercent = Math.max(victim.maxKillerSpeedPercent, percent);
        }
      }
      round.kills.add(attackerId);
      round.killCounts.set(attackerId, (round.killCounts.get(attackerId) || 0) + 1);
      if (event.headshot) attacker.headshots += 1;

      if (!round.openingRecorded) {
        attacker.openingKills += 1;
        victim.openingDeaths += 1;
        round.openingRecorded = true;
      }

      let isTradeKill = false;
      for (const prior of round.pendingDeaths) {
        if (prior.killer === victimId && prior.victimTeam === attackerTeam && tradeIsOpen(prior, attacker.userId, tick)) {
          // A kill proves the trader could act even when the initial proximity
          // heuristic did not recognize the opportunity.
          recordTradeAttempt(prior, attacker, "kill");
          refreshTradeEngagement(prior, attacker.userId, tick);
          if (prior.capableTraders.has(attacker.userId)) {
            // KAST uses the same qualified trade success as Trade K-D.
            round.traded.add(prior.victim);
            isTradeKill = true;
            const tradedVictim = stats.get(prior.victim);
            if (tradedVictim && !prior.tradeRecorded) {
              prior.tradeRecorded = true;
              tradedVictim.tradedDeaths += 1;
              tradedVictim.tradedBy.set(attacker.name, (tradedVictim.tradedBy.get(attacker.name) || 0) + 1);
              tradedVictim.tradedTradeableDeaths += 1;
            }
            if (!prior.successfulTraders.has(attacker.userId)) {
              prior.successfulTraders.add(attacker.userId);
              attacker.tradeSuccesses += 1;
              const auditCandidate = prior.audit.candidates.find(candidate => candidate.player === attacker.name);
              if (auditCandidate) auditCandidate.success = true;
            }
          }
        }
      }
      if (isTradeKill) attacker.tradeKills += 1;
      const audit = {
        round: completedRounds + 1,
        victim: victim.name,
        killer: attacker.name,
        candidates: [...nearbyCandidates].map(([traderId, separation]) => {
          const trader = stats.get(traderId);
          if (trader) trader.tradeProximityDistances.push(separation);
          return {
            player: trader?.name || `Player ${traderId}`,
            distance: Math.round(separation),
            opportunity_source: "proximity",
            attempted: false,
            attempt_source: null,
            success: false
          };
        })
      };
      tradeAudit.push(audit);
      round.pendingDeaths.push({
        victim: victimId,
        killer: attackerId,
        victimTeam,
        tick,
        capableTraders: nearbyTraders,
        attemptedTraders: new Set(),
        successfulTraders: new Set(),
        engagementTicks: new Map(),
        teammateDistances,
        audit,
        deathAttempted: false,
        tradeRecorded: false
      });
      for (const traderId of nearbyTraders) {
        const trader = stats.get(traderId);
        if (trader) trader.tradeOpportunities += 1;
      }
      round.pendingDeaths = round.pendingDeaths.filter(item => pendingTradeIsAlive(item, tick));
    }

    if (enemyKill && assisterId !== null && assisterId !== victimId) {
      const assister = stats.get(assisterId);
      if (assister && assisterId !== attackerId) {
        assister.assists += 1;
        round.assists.add(assisterId);
        if (event.assistedflash) {
          assister.flashAssists += 1;
          attacker.flashAssistedKills += 1;
        } else {
          attacker.damageAssistedKills += 1;
        }
      }
    }

    detectClutchCandidates();
  }

  function detectClutchCandidates() {
    const aliveBySide = new Map([[2, []], [3, []]]);
    const participants = new Set(
      [...round.participants].map(userId => stats.get(userId)).filter(Boolean)
    );
    for (const row of participants) {
      const side = teamNow.get(row.userId);
      if (side !== 2 && side !== 3) continue;
      const died = [...row.userIds].some(userId => round.deaths.has(userId));
      if (!died) aliveBySide.get(side).push(row);
    }
    for (const side of [2, 3]) {
      const alive = aliveBySide.get(side);
      const opponents = aliveBySide.get(side === 2 ? 3 : 2).length;
      if (alive.length !== 1 || opponents < 1 || round.clutchSides.has(side)) continue;
      round.clutchSides.add(side);
      round.clutchCandidates.push({ row: alive[0], side, opponents });
    }
  }

  function handleBlind(event, tick) {
    refreshControllerTeams();
    const attackerId = integer(event.attacker);
    const victimId = integer(event.userid);
    const victim = stats.get(victimId);
    const duration = Math.max(0, number(event.blind_duration));
    if (victim && duration > 0) {
      const expiry = tick + Math.ceil(duration / tickInterval);
      blindUntilTick.set(victim.userId, Math.max(blindUntilTick.get(victim.userId) ?? -1, expiry));
    }
    if (attackerId === null || victimId === null || attackerId === victimId) return;
    round.participants.add(attackerId);
    round.participants.add(victimId);
    const attacker = stats.get(attackerId);
    if (!attacker) return;
    const attackerTeam = teamNow.get(attackerId);
    const victimTeam = teamNow.get(victimId);
    if ((attackerTeam === 2 || attackerTeam === 3) &&
        (victimTeam === 2 || victimTeam === 3) && attackerTeam !== victimTeam) {
      attacker.enemiesFlashed += 1;
    }
  }

  function handleDamage(event, tick) {
    const attackerId = integer(event.attacker);
    const victimId = integer(event.userid);
    if (attackerId === null || victimId === null || attackerId === victimId) return;
    round.participants.add(attackerId);
    round.participants.add(victimId);
    const row = stats.get(attackerId);
    if (!row) return;
    const attackerTeam = teamNow.get(attackerId);
    const victimTeam = teamNow.get(victimId);
    if ((attackerTeam !== 2 && attackerTeam !== 3) ||
        (victimTeam !== 2 && victimTeam !== 3) || attackerTeam === victimTeam) return;
    const damage = Math.max(0, number(event.dmg_health));
    row.damage += damage;
    const damageWeapon = weaponStat(row, event.weapon);
    if (damageWeapon) damageWeapon.damage += damage;
    if (damage > 0 && damageProvesTradeAttempt(event, damage)) {
      for (const prior of round.pendingDeaths) {
        if (prior.killer === victimId && tradeIsOpen(prior, row.userId, tick)) {
          // Damage proves a usable sightline/action opportunity, even when the
          // trader was farther than the initial proximity radius.
          recordTradeAttempt(prior, row, "damage");
          refreshTradeEngagement(prior, row.userId, tick);
        } else if (prior.killer === attackerId) {
          const target = stats.get(victimId);
          if (target && prior.attemptedTraders.has(target.userId) && tradeIsOpen(prior, target.userId, tick)) {
            refreshTradeEngagement(prior, target.userId, tick);
          }
        }
      }
    }
    const weapon = String(event.weapon || "").toLocaleLowerCase();
    if (weapon === "hegrenade") row.heDamage += damage;
    if (weapon === "inferno" || weapon === "molotov" || weapon === "incgrenade") row.fireDamage += damage;
  }

  function handleWeaponFire(event) {
    const userId = integer(event.userid);
    const row = stats.get(userId);
    if (!row) return;
    round.participants.add(userId);
    const stat = weaponStat(row, event.weapon);
    if (stat) stat.shots += 1;
  }

  function handlePurchase(event) {
    const userId = integer(event.userid);
    const row = stats.get(userId);
    if (!row || !isPurchasedWeapon(event.weapon)) return;
    const stat = weaponStat(row, event.weapon);
    if (stat) stat.purchases += 1;
  }

  function handleBulletImpact(event, tick) {
    const shooterId = integer(event.userid);
    const shooter = stats.get(shooterId);
    const impact = {
      x: numberOrNull(event.x),
      y: numberOrNull(event.y),
      z: numberOrNull(event.z)
    };
    if (!shooter || Object.values(impact).some(value => value === null)) return;
    const positions = currentPlayerPositions();
    const origin = positions.get(shooter.userId);
    if (!origin) return;
    const shotOrigin = { x: origin.x, y: origin.y, z: origin.z + 64 };
    const shooterTeam = [...shooter.userIds].map(userId => teamNow.get(userId)).find(team => team === 2 || team === 3);
    let best = null;

    for (const prior of round.pendingDeaths) {
      if (prior.killer !== shooterId) {
        if (shooterTeam !== prior.victimTeam || !tradeIsOpen(prior, shooter.userId, tick)) continue;
        const killer = stats.get(prior.killer);
        const target = killer ? positions.get(killer.userId) : null;
        if (!target) continue;
        const miss = pointToSegmentDistance({ ...target, z: target.z + 40 }, shotOrigin, impact);
        if (miss <= BULLET_PATH_TOLERANCE_UNITS && (!best || miss < best.miss)) {
          best = { prior, trader: shooter, miss };
        }
        continue;
      }

      for (const traderId of prior.attemptedTraders) {
        if (!tradeIsOpen(prior, traderId, tick)) continue;
        const trader = stats.get(traderId);
        const target = positions.get(traderId);
        if (!trader || !target) continue;
        const miss = pointToSegmentDistance({ ...target, z: target.z + 40 }, shotOrigin, impact);
        if (miss <= BULLET_PATH_TOLERANCE_UNITS && (!best || miss < best.miss)) {
          best = { prior, trader, miss, reciprocal: true };
        }
      }
    }

    if (!best) return;
    if (!best.reciprocal) recordTradeAttempt(best.prior, best.trader, "bullet_path");
    refreshTradeEngagement(best.prior, best.trader.userId, tick);
  }

  parser.registerPostInterceptor(InterceptorStage.DEMO_PACKET, async demoPacket => {
    packetCounts.demo_packets += 1;
    if (!demoPacket.getIsInitial()) {
      refreshUserInfo();
      samplePlayerMotion(demoPacket.tick);
    }
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
        // Both events can occur for one round, and a delayed official-end event
        // can arrive between them. Do not throw away a round with real activity.
        if (round.finished) round = freshRound();
        break;
      case "round_end":
        finishRound(integer(gameEvent.winner));
        break;
      case "round_freeze_end":
        round.freezeSeen = true;
        round.live = true;
        // Discard transient pre-freeze spawns (for example a bot created while
        // a player reconnects) and snapshot the roster that actually goes live.
        round.participants.clear();
        captureLiveParticipants();
        break;
      case "round_officially_ended":
        finishRound(inferWinnerSide(), true);
        break;
      case "cs_win_panel_match":
        finishRound(inferWinnerSide(), true);
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
        if (userId !== null) round.participants.add(userId);
        if (userId !== null && (team === 2 || team === 3)) {
          teamNow.set(userId, team);
          if (!originalTeam.has(userId)) originalTeam.set(userId, team);
        }
        break;
      }
      case "player_death":
        if (!round.live) break;
        round.hasActivity = true;
        handleDeath(gameEvent, demoPacket.tick);
        break;
      case "weapon_fire":
        if (!round.live) break;
        round.hasActivity = true;
        handleWeaponFire(gameEvent);
        break;
      case "player_hurt":
        if (!round.live) break;
        round.hasActivity = true;
        handleDamage(gameEvent, demoPacket.tick);
        break;
      case "player_blind":
        if (!round.live) break;
        round.hasActivity = true;
        handleBlind(gameEvent, demoPacket.tick);
        break;
      case "item_purchase":
        handlePurchase(gameEvent);
        break;
      case "bullet_impact":
        if (!round.live) break;
        handleBulletImpact(gameEvent, demoPacket.tick);
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

  const activePlayers = [...new Set(stats.values())].filter(row =>
    row.kills || row.deaths || row.assists || row.damage
  );

  if (activePlayers.length === 0) {
    throw new Error("The demo parsed, but no player statistics were found.");
  }

  const assignments = new Map(originalTeam);
  for (const [userId, team] of finalTeams) assignments.set(userId, team);
  const officialTeamIds = [...new Set(finalTeams.values())].filter(team => team === 2 || team === 3);
  if (officialTeamIds.length === 2) {
    for (const row of activePlayers) {
      if (!row.isBot) continue;
      const opposingTeams = new Map();
      for (const opponent of row.observedOpponents) {
        const team = finalTeams.get(opponent.userId);
        if (team === 2 || team === 3) opposingTeams.set(team, (opposingTeams.get(team) || 0) + 1);
      }
      const opponentTeam = [...opposingTeams].sort((a, b) => b[1] - a[1])[0]?.[0];
      if (opponentTeam) {
        assignments.set(row.userId, officialTeamIds.find(team => team !== opponentTeam));
      }
    }
  }
  const officialTeamData = new Map((endState?.teams || []).map(team => [team.id, team]));
  const groups = groupPlayers(activePlayers, assignments);
  const teams = [...groups.entries()]
    .sort(([a], [b]) => String(a).localeCompare(String(b)))
    .map(([teamId, players], index) => {
      const official = officialTeamData.get(teamId);
      return {
        id: String(teamId),
        name: official?.name || `Team ${index + 1}`,
        score: official?.score ?? (teamScores.has(teamId) ? teamScores.get(teamId) : null),
        players: players
          .map(row => finishPlayer(row))
          .sort((a, b) => Number(a.is_bot) - Number(b.is_bot) || b.rating - a.rating || b.kills - a.kills)
      };
    });

  return {
    format_version: 1,
    parser: "@deademx/cs2",
    parser_version: "4.0.0",
    match_uid: providerMatchId ? `faceit:${providerMatchId}` : `sha256:${demoSha256}`,
    provider: providerMatchId ? "faceit" : null,
    provider_match_id: providerMatchId,
    demo_sha256: demoSha256,
    source_file: fileName,
    map: mapName,
    rounds: completedRounds,
    speed_definition: {
      units: "Source 2 game units per second",
      component: "horizontal",
      display: "Percent of the killer's current weapon maximum movement speed",
      method: "Networked pawn velocity when available; otherwise horizontal position change between adjacent demo packets",
      max_speed: "Pawn movement-service maximum when available; otherwise a weapon-data fallback adjusted for scoped state",
      exclusions: "Grenade, lingering-fire, C4, world, and other non-held-weapon kills are excluded"
    },
    trade_definition: {
      window_seconds: TRADE_WINDOW_SECONDS,
      proximity_units: TRADE_PROXIMITY_UNITS,
      engagement_lull_seconds: TRADE_ENGAGEMENT_LULL_SECONDS,
      bullet_path_tolerance_units: BULLET_PATH_TOLERANCE_UNITS,
      opportunity: "Living teammate within the proximity radius when a teammate dies, or a teammate whose shot path, damage, or kill later proves engagement with the killer",
      attempt: "An eligible teammate damages the killer or fires a shot path near the killer during the initial trade window",
      success: "An eligible teammate kills the killer before the active engagement expires",
      he_damage_caps: {
        unarmored: HE_MAX_DAMAGE_UNARMORED,
        armored: HE_MAX_DAMAGE_ARMORED
      },
      grenade_attempt_rule: "Nonlethal HE damage proves an attempt only when the target's pre-hit health did not exceed the applicable maximum; other nonlethal grenade damage does not prove an attempt"
    },
    trade_opportunity_audit: {
      radii: TRADE_AUDIT_RADII,
      deaths: tradeAudit
    },
    player_count: activePlayers.length,
    teams
  };
}

function faceitMatchId(fileName) {
  const match = String(fileName || "").match(/(?:^|[^0-9a-f])(1-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?=-|\.|$)/i);
  return match ? match[1].toLocaleLowerCase() : null;
}

async function sha256(buffer) {
  if (!self.crypto?.subtle) throw new Error("This browser cannot create a secure demo fingerprint.");
  const digest = await self.crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function freshRound() {
  return {
    kills: new Set(),
    deaths: new Set(),
    assists: new Set(),
    traded: new Set(),
    clutchSides: new Set(),
    clutchCandidates: [],
    killCounts: new Map(),
    pendingDeaths: [],
    participants: new Set(),
    openingRecorded: false,
    bombPlanted: false,
    winnerSide: null,
    freezeSeen: false,
    live: false,
    hasActivity: false,
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
    is_bot: row.isBot,
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
    trade_kills: row.tradeKills,
    traded_deaths: row.tradedDeaths,
    trade_opportunities: row.tradeOpportunities,
    trade_attempts: row.tradeAttempts,
    trade_successes: row.tradeSuccesses,
    trade_attempt_percent: row.tradeOpportunities ? 100 * row.tradeAttempts / row.tradeOpportunities : 0,
    trade_success_percent: row.tradeAttempts ? 100 * row.tradeKills / row.tradeAttempts : 0,
    tradeable_deaths: row.tradeableDeaths,
    attempted_tradeable_deaths: row.attemptedTradeableDeaths,
    traded_tradeable_deaths: row.tradedTradeableDeaths,
    traded_death_percent: row.attemptedTradeableDeaths ? 100 * row.tradedDeaths / row.attemptedTradeableDeaths : 0,
    traded_by: Object.fromEntries([...row.tradedBy].sort(([a], [b]) => a.localeCompare(b))),
    trade_opportunity_audit: {
      proximity_counts_by_radius: Object.fromEntries(TRADE_AUDIT_RADII.map(radius => [
        radius,
        row.tradeProximityDistances.filter(distance => distance <= radius).length
      ])),
      proximity_distances: row.tradeProximityDistances.map(Math.round).sort((a, b) => a - b),
      proven_opportunities: { ...row.provenTradeOpportunities }
    },
    assisted_kills: {
      damage: row.damageAssistedKills,
      flash: row.flashAssistedKills,
      total: row.damageAssistedKills + row.flashAssistedKills
    },
    enemies_flashed: row.enemiesFlashed,
    flash_assists: row.flashAssists,
    grenade_damage: {
      high_explosive: row.heDamage,
      fire: row.fireDamage,
      total: row.heDamage + row.fireDamage
    },
    kill_context: {
      blinded_enemy_kills: row.blindedEnemyKills,
      deaths_while_blind: row.deathsWhileBlind,
      kills_while_blind: row.killsWhileBlind,
      deaths_to_blind_killer: row.deathsToBlindKiller,
      wallbang_kills: row.wallbangKills,
      wallbang_deaths: row.wallbangDeaths,
      penetrations_on_kills: row.killPenetrations,
      penetrations_on_deaths: row.deathPenetrations,
      smoke_kills: row.smokeKills,
      smoke_deaths: row.smokeDeaths,
      airborne_kills: row.airborneKills,
      deaths_to_airborne_killer: row.deathsToAirborneKiller,
      speed_on_kill: speedSummary(row.speedOnKillTotal, row.speedOnKillSamples, row.maxSpeedOnKill,
        row.speedOnKillPercentTotal, row.speedOnKillPercentSamples, row.maxSpeedOnKillPercent),
      killer_speed_on_death: speedSummary(row.killerSpeedTotal, row.killerSpeedSamples, row.maxKillerSpeed,
        row.killerSpeedPercentTotal, row.killerSpeedPercentSamples, row.maxKillerSpeedPercent)
    },
    weapon_stats: [...row.weaponStats.values()]
      .filter(stat => stat.kills || stat.shots || stat.damage || stat.purchases)
      .sort((a, b) => b.kills - a.kills || b.damage - a.damage || b.shots - a.shots || b.purchases - a.purchases || a.weapon.localeCompare(b.weapon))
      .map(stat => ({ ...stat })),
    duels: [...row.duelStats.entries()]
      .map(([opponent, stat]) => ({
        opponent: opponent.name,
        opponent_steam_id: opponent.steamId,
        opponent_is_bot: opponent.isBot,
        kills: stat.kills,
        deaths: stat.deaths,
        differential: stat.kills - stat.deaths
      }))
      .sort((a, b) => (b.kills + b.deaths) - (a.kills + a.deaths) || b.differential - a.differential || a.opponent.localeCompare(b.opponent)),
    opening_kills: row.openingKills,
    opening_deaths: row.openingDeaths,
    multikill_rounds: row.multikillRounds,
    kill_rounds: row.killRoundsByCount,
    clutch_wins: row.clutchWins,
    rating: Math.max(0, rating)
  };
}

function speedSummary(total, samples, maximum, percentTotal, percentSamples, percentMaximum) {
  return {
    average: samples ? total / samples : null,
    maximum: samples ? maximum : null,
    samples,
    average_percent_of_max: percentSamples ? percentTotal / percentSamples : null,
    maximum_percent_of_max: percentSamples ? percentMaximum : null,
    percent_samples: percentSamples
  };
}

function safePawnField(pawn, field) {
  try {
    return pawn.getField(field);
  } catch {
    return null;
  }
}

function pawnMovementMaxSpeed(pawn) {
  for (const field of ["m_pMovementServices.m_flMaxspeed", "m_pMovementServices.m_flMaxSpeed", "m_flMaxspeed"]) {
    const value = numberOrNull(safePawnField(pawn, field));
    if (value !== null && value > 0) return value;
  }
  return null;
}

function normalizedWeapon(weapon) {
  return String(weapon || "").toLocaleLowerCase().replace(/^weapon_/, "");
}

function weaponStatId(weapon) {
  const name = normalizedWeapon(weapon);
  if (["inferno", "molotov", "incgrenade"].includes(name)) return "fire";
  if (name.includes("knife") || name === "bayonet") return "knife";
  return name;
}

function isPurchasedWeapon(weapon) {
  const name = normalizedWeapon(weapon);
  return Boolean(name) && !new Set([
    "vest", "vesthelm", "assaultsuit", "kevlar", "defuser", "cutters", "nvgs"
  ]).has(name) && !name.startsWith("item_");
}

function isNonWeaponSpeedKill(weapon) {
  const name = normalizedWeapon(weapon);
  return NON_WEAPON_SPEED_KILLS.has(name) || name.includes("grenade") || name.includes("inferno");
}

function weaponMovementMaxSpeed(weapon, scoped) {
  const name = normalizedWeapon(weapon);
  if (name.includes("knife") || name === "bayonet") return 250;
  const speeds = WEAPON_MAX_SPEED[name];
  return speeds ? speeds[scoped ? 1 : 0] : null;
}

function inferredScopedKill(event) {
  const name = normalizedWeapon(event?.weapon);
  return ["awp", "g3sg1", "scar20", "ssg08"].includes(name) && event?.noscope === false;
}

function pawnHorizontalSpeed(pawn) {
  for (const field of ["m_vecAbsVelocity", "m_vecVelocity"]) {
    let vector;
    try {
      vector = pawn.getField(field);
    } catch {
      vector = null;
    }
    const x = numberOrNull(vector?.[0] ?? vector?.x ?? vector?.xValue);
    const y = numberOrNull(vector?.[1] ?? vector?.y ?? vector?.yValue);
    if (x !== null && y !== null) return Math.hypot(x, y);

    for (const [xField, yField] of [
      [`${field}[0]`, `${field}[1]`],
      [`${field}.x`, `${field}.y`],
      [`${field}.m_Value[0]`, `${field}.m_Value[1]`]
    ]) {
      let componentX, componentY;
      try {
        componentX = numberOrNull(pawn.getField(xField));
        componentY = numberOrNull(pawn.getField(yField));
      } catch {
        continue;
      }
      if (componentX !== null && componentY !== null) return Math.hypot(componentX, componentY);
    }
  }
  return null;
}

function pawnPosition(pawn) {
  const cellX = numberOrNull(pawn.getField("CBodyComponent.m_cellX"));
  const cellY = numberOrNull(pawn.getField("CBodyComponent.m_cellY"));
  const cellZ = numberOrNull(pawn.getField("CBodyComponent.m_cellZ"));
  const vector = pawn.getField("CBodyComponent.m_vecOrigin");
  const vecX = numberOrNull(pawn.getField("CBodyComponent.m_vecX")) ?? numberOrNull(vector?.[0]);
  const vecY = numberOrNull(pawn.getField("CBodyComponent.m_vecY")) ?? numberOrNull(vector?.[1]);
  const vecZ = numberOrNull(pawn.getField("CBodyComponent.m_vecZ")) ?? numberOrNull(vector?.[2]) ?? 0;
  if (cellX === null || cellY === null || vecX === null || vecY === null) return null;
  return {
    x: cellX * 128 + vecX,
    y: cellY * 128 + vecY,
    z: (cellZ ?? 0) * 128 + vecZ
  };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function pointToSegmentDistance(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dy * dy + dz * dz;
  if (!lengthSquared) return distance(point, start);
  const projection = ((point.x - start.x) * dx + (point.y - start.y) * dy +
    (point.z - start.z) * dz) / lengthSquared;
  const t = Math.max(0, Math.min(1, projection));
  return distance(point, {
    x: start.x + t * dx,
    y: start.y + t * dy,
    z: start.z + t * dz
  });
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
