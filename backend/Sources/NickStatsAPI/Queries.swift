import Fluent
import Foundation
import SQLKit
import Vapor

struct MatchQuery: Content {
    var steamID: String?
    var viewerPlayerID: Int64?
    var map: String?
    var maps: String?
    var dateFrom: String?
    var dateTo: String?
    var limit: Int?
    var offset: Int?

    enum CodingKeys: String, CodingKey {
        case map, maps, limit, offset
        case steamID = "steam_id"
        case viewerPlayerID = "viewer_player_id"
        case dateFrom = "from"
        case dateTo = "to"
    }
}

struct PlayerQuery: Content {
    var q: String?
    var limit: Int?
    var offset: Int?
}

struct ComparisonQuery: Content {
    var players: String
}

private func int64(_ row: any SQLRow, _ column: String) throws -> Int64 {
    if let value = try? row.decode(column: column, as: Int64.self) { return value }
    return Int64(try row.decode(column: column, as: UInt64.self))
}

private func integer(_ row: any SQLRow, _ column: String) throws -> Int {
    if let value = try? row.decode(column: column, as: Int.self) { return value }
    if let value = try? row.decode(column: column, as: Int64.self) { return Int(value) }
    return Int(try row.decode(column: column, as: UInt64.self))
}

private func optionalInteger(_ row: any SQLRow, _ column: String) throws -> Int? {
    if (try? row.decodeNil(column: column)) == true { return nil }
    return try integer(row, column)
}

private func optionalString(_ row: any SQLRow, _ column: String) throws -> String? {
    try row.decode(column: column, as: String?.self)
}

private func optionalDate(_ row: any SQLRow, _ column: String) throws -> Date? {
    try row.decode(column: column, as: Date?.self)
}

private func double(_ row: any SQLRow, _ column: String) throws -> Double {
    if let value = try? row.decode(column: column, as: Double.self) { return value }
    let text = try row.decode(column: column, as: String.self)
    guard let value = Double(text) else { throw Abort(.internalServerError, reason: "Invalid database decimal.") }
    return value
}

private func optionalDouble(_ row: any SQLRow, _ column: String) throws -> Double? {
    if (try? row.decodeNil(column: column)) == true { return nil }
    return try double(row, column)
}

private func playerSide(_ row: any SQLRow, _ column: String) throws -> PlayerSide {
    let value = try row.decode(column: column, as: String.self)
    guard let side = PlayerSide(rawValue: value) else {
        throw Abort(.internalServerError, reason: "Invalid player side in the database: \(value)")
    }
    return side
}

private func unix(_ date: Date?) -> Int64? {
    date.map { Int64($0.timeIntervalSince1970) }
}

private func parseDate(_ value: String?, name: String) throws -> Date? {
    guard let value, !value.isEmpty else { return nil }
    let iso = ISO8601DateFormatter()
    if let date = iso.date(from: value) { return date }
    let day = DateFormatter()
    day.locale = Locale(identifier: "en_US_POSIX")
    day.timeZone = TimeZone(secondsFromGMT: 0)
    day.dateFormat = "yyyy-MM-dd"
    guard let date = day.date(from: value) else {
        throw Abort(.badRequest, reason: "\(name) must be an ISO-8601 date or timestamp.")
    }
    return date
}

private func pagination(limit: Int?, offset: Int?) throws -> (Int, Int) {
    let limit = limit ?? 25
    let offset = offset ?? 0
    guard (1...100).contains(limit), offset >= 0 else {
        throw Abort(.badRequest, reason: "limit must be 1-100 and offset must be non-negative.")
    }
    return (limit, offset)
}

func listMatches(_ request: Request) async throws -> MatchListResponse {
    guard let sql = request.db as? any SQLDatabase else { throw Abort(.internalServerError) }
    let filters = try request.query.decode(MatchQuery.self)
    let (limit, offset) = try pagination(limit: filters.limit, offset: filters.offset)
    let steamID = filters.steamID ?? ""
    let viewerPlayerID = filters.viewerPlayerID ?? 0
    let viewerTeamColumn: SQLQueryString = viewerPlayerID <= 0 ? "NULL AS viewer_team_slot" : """
        (SELECT mt.team_slot
         FROM match_players vm
         JOIN match_teams mt ON mt.id = vm.match_team_id
         WHERE vm.match_id = m.id AND vm.player_id = \(bind: viewerPlayerID)
         LIMIT 1) AS viewer_team_slot
        """
    let maps = (filters.maps ?? filters.map ?? "").split(separator: ",")
        .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
        .filter { !$0.isEmpty }
    let mapList = maps.joined(separator: ",")
    let from = try parseDate(filters.dateFrom, name: "from")
    let to = try parseDate(filters.dateTo, name: "to")

    let rows = try await sql.raw("""
        SELECT DISTINCT
          m.id, m.provider, m.provider_match_id, LOWER(HEX(m.demo_sha256)) AS sha256,
          m.map_name, m.played_at, m.rounds, m.nickstats_build,
          team_0.display_name AS team_0_name, team_0.score AS team_0_score,
          team_1.display_name AS team_1_name, team_1.score AS team_1_score,
          \(viewerTeamColumn)
        FROM matches m
        LEFT JOIN match_teams team_0 ON team_0.match_id = m.id AND team_0.team_slot = 0
        LEFT JOIN match_teams team_1 ON team_1.match_id = m.id AND team_1.team_slot = 1
        WHERE (
          \(bind: steamID.isEmpty) OR EXISTS (
            SELECT 1 FROM match_players mp
            JOIN players p ON p.id = mp.player_id
            WHERE mp.match_id = m.id AND CAST(p.steam_id AS CHAR) = \(bind: steamID)
          )
        )
          AND (\(bind: mapList.isEmpty) OR FIND_IN_SET(m.map_name, \(bind: mapList)) > 0)
          AND (\(bind: from == nil) OR m.played_at >= \(bind: from ?? Date(timeIntervalSince1970: 0)))
          AND (\(bind: to == nil) OR m.played_at < \(bind: to ?? Date(timeIntervalSince1970: 0)))
        ORDER BY m.played_at IS NULL, m.played_at DESC, m.id DESC
        LIMIT \(bind: limit) OFFSET \(bind: offset)
        """).all()

    var matches: [MatchSummary] = []
    for row in rows {
        let matchID = try int64(row, "id")
        var teams: [TeamSummary] = []
        if let name = try optionalString(row, "team_0_name") {
            teams.append(TeamSummary(name: name, score: try optionalInteger(row, "team_0_score")))
        }
        if let name = try optionalString(row, "team_1_name") {
            teams.append(TeamSummary(name: name, score: try optionalInteger(row, "team_1_score")))
        }
        matches.append(MatchSummary(
            id: matchID,
            provider: try optionalString(row, "provider"),
            providerMatchID: try optionalString(row, "provider_match_id"),
            sha256: try row.decode(column: "sha256", as: String.self),
            map: try row.decode(column: "map_name", as: String.self),
            playedAt: unix(try optionalDate(row, "played_at")),
            rounds: try integer(row, "rounds"),
            nickstatsBuild: try row.decode(column: "nickstats_build", as: String.self),
            teams: teams,
            viewerTeamSlot: try optionalInteger(row, "viewer_team_slot")
        ))
    }
    let mapRows = try await sql.raw("SELECT DISTINCT map_name FROM matches ORDER BY map_name").all()
    let availableMaps = try mapRows.map { try $0.decode(column: "map_name", as: String.self) }
    return MatchListResponse(matches: matches, maps: availableMaps, limit: limit, offset: offset)
}

func listPlayers(_ request: Request) async throws -> PlayerListResponse {
    guard let sql = request.db as? any SQLDatabase else { throw Abort(.internalServerError) }
    let query = try request.query.decode(PlayerQuery.self)
    let (limit, offset) = try pagination(limit: query.limit, offset: query.offset)
    let search = query.q?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let pattern = "%\(search)%"
    let rows = try await sql.raw("""
        SELECT p.id, CAST(p.steam_id AS CHAR) AS steam_id, p.current_name,
               p.first_seen_at, p.last_seen_at, COUNT(mp.id) AS match_count
        FROM players p
        LEFT JOIN match_players mp ON mp.player_id = p.id
        WHERE (\(bind: search.isEmpty) OR p.current_name LIKE \(bind: pattern)
               OR CAST(p.steam_id AS CHAR) = \(bind: search))
        GROUP BY p.id
        ORDER BY p.current_name, p.id
        LIMIT \(bind: limit) OFFSET \(bind: offset)
        """).all()
    let players = try rows.map { row in
        PlayerSummary(
            id: try int64(row, "id"),
            steamID: try row.decode(column: "steam_id", as: String.self),
            name: try row.decode(column: "current_name", as: String.self),
            firstSeenAt: unix(try optionalDate(row, "first_seen_at")),
            lastSeenAt: unix(try optionalDate(row, "last_seen_at")),
            matchCount: try integer(row, "match_count")
        )
    }
    return PlayerListResponse(players: players, limit: limit, offset: offset)
}

private struct ComparisonSideAccumulator {
    var side: PlayerSide
    var stats: [String: Double] = [:]
    var weapons: [ComparisonWeaponStats] = []
}

private struct ComparisonSliceKey: Hashable {
    var side: String
    var buyType: String
    var opponentBuyType: String
    var roundResult: String
    var roundPhase: String?

    init(side: PlayerSide, buyType: String, opponentBuyType: String, roundResult: String, roundPhase: String? = nil) {
        self.side = side.rawValue
        self.buyType = buyType
        self.opponentBuyType = opponentBuyType
        self.roundResult = roundResult
        self.roundPhase = roundPhase
    }

    init(_ value: ComparisonSideStats) {
        self.init(
            side: value.side, buyType: value.buyType,
            opponentBuyType: value.opponentBuyType, roundResult: value.roundResult, roundPhase: value.roundPhase
        )
    }
}

private struct ComparisonFlashTargets {
    var ownPlayerSlot: Int
    var ownTeamID: Int64
    var teamByPlayerSlot: [Int: Int64]
}

func flattenedBuyStats(_ value: SideStatsPayload) -> [String: Double] {
    flattenedBuyStats(value, flashTargets: nil)
}

private func flattenedBuyStats(_ value: SideStatsPayload, flashTargets: ComparisonFlashTargets?) -> [String: Double] {
    let attempts = value.clutchAttempts ?? value.clutches
    let thrown = value.utilityThrown ?? .zero
    let objectives = value.objectives ?? .zero
    let profile = (value.profile ?? []) + Array(repeating: 0, count: max(0, 16 - (value.profile?.count ?? 0)))
    var output: [String: Double] = [
        "rounds": Double(value.rounds.played), "round_wins": Double(value.rounds.won),
        "timed_rounds": Double(value.rounds.played),
        "kills": Double(value.combat.kills), "deaths": Double(value.combat.deaths),
        "assists": Double(value.combat.assists), "headshots": Double(value.combat.headshots),
        "damage": Double(value.combat.damage), "damage_received": Double(value.damageReceived ?? 0),
        "kast_rounds": Double(value.kastRounds), "opening_kills": Double(value.opening.kills),
        "opening_deaths": Double(value.opening.deaths),
        "opening_assisted_kills": Double(value.opening.assistedKills),
        "opening_damage_assisted_kills": Double(value.opening.damageAssistedKills),
        "opening_flash_assisted_kills": Double(value.opening.flashAssistedKills),
        "opening_traded_deaths": Double(value.opening.tradedDeaths),
        "opening_trade_kills": Double(value.opening.tradeKills),
        "opening_assists": Double(value.opening.assists),
        "opening_damage_assists": Double(value.opening.damageAssists),
        "opening_flash_assists": Double(value.opening.flashAssists),
        "opening_blinded_enemy_kills": Double(value.opening.blindedEnemyKills),
        "opening_blind_kills": Double(value.opening.blindKills),
        "opening_deaths_while_blind": Double(value.opening.deathsWhileBlind),
        "opening_deaths_to_blind_killer": Double(value.opening.deathsToBlindKiller),
        "opening_enemy_assisted_deaths": Double(value.opening.enemyAssistedDeaths),
        "opening_enemy_damage_assisted_deaths": Double(value.opening.enemyDamageAssistedDeaths),
        "opening_enemy_flash_assisted_deaths": Double(value.opening.enemyFlashAssistedDeaths),
        "opening_own_flash_kills": Double(value.opening.ownFlashKills),
        "opening_victim_side_flash_kills": Double(value.opening.victimSideFlashKills),
        "opening_blind_source_unknown_kills": Double(value.opening.blindSourceUnknownKills),
        "opening_deaths_to_killer_flash": Double(value.opening.deathsToKillerFlash),
        "opening_deaths_to_own_side_flash": Double(value.opening.deathsToOwnSideFlash),
        "opening_deaths_blind_source_unknown": Double(value.opening.deathsBlindSourceUnknown),
        "trade_kills": Double(value.tradeKills),
        "tradeable_deaths": Double(value.tradeDeaths.tradeable),
        "attempted_tradeable_deaths": Double(value.tradeDeaths.attempted), "traded_deaths": Double(value.tradeDeaths.traded),
        "he_damage": Double(value.utility.highExplosive), "fire_damage": Double(value.utility.fire),
        "he_grenades_thrown": Double(thrown.highExplosive), "flashbangs_thrown": Double(thrown.flashbang),
        "smokes_thrown": Double(thrown.smoke), "fire_grenades_thrown": Double(thrown.fire),
        "decoys_thrown": Double(thrown.decoy), "bomb_plants": Double(objectives.plants), "bomb_defuses": Double(objectives.defuses),
        "kill_speed_total": value.speed.kills.total, "kill_speed_samples": Double(value.speed.kills.samples),
        "kill_speed_max": value.speed.kills.maximum ?? 0, "kill_speed_percent_total": value.speed.kills.percentOfMaximumTotal,
        "kill_speed_percent_samples": Double(value.speed.kills.percentOfMaximumSamples),
        "kill_speed_percent_max": value.speed.kills.percentOfMaximumPeak ?? 0,
        "death_speed_total": value.speed.deaths.total, "death_speed_samples": Double(value.speed.deaths.samples),
        "death_speed_max": value.speed.deaths.maximum ?? 0, "death_speed_percent_total": value.speed.deaths.percentOfMaximumTotal,
        "death_speed_percent_samples": Double(value.speed.deaths.percentOfMaximumSamples),
        "death_speed_percent_max": value.speed.deaths.percentOfMaximumPeak ?? 0,
        "enemies_flashed": Double(profile[13]), "blind_duration_ms": Double(profile[14]), "flash_assists": Double(profile[15])
    ]
    for (index, count) in value.clutches.values.enumerated() {
        output["clutch_1v\(index + 1)"] = Double(count)
    }
    for (index, count) in attempts.values.enumerated() {
        output["clutch_attempt_1v\(index + 1)"] = Double(count)
    }
    for (index, count) in value.killRounds.values.enumerated() {
        output["kill_rounds_\(index + 1)k"] = Double(count)
    }
    for (index, count) in (value.trueKillRounds ?? .zero).values.enumerated() {
        output["true_kill_rounds_\(index + 1)k"] = Double(count)
    }
    output["true_multikill_rounds"] = Double(value.trueMultikillRounds ?? 0)
    for trade in value.trades {
        output["trade_opportunities", default: 0] += Double(trade.opportunities)
        output["trade_attempts", default: 0] += Double(trade.attempts)
        output["trade_successes", default: 0] += Double(trade.successes)
    }
    let contextNames = ["blinded_kills", "blind_kills", "wallbang_kills", "penetration_total", "smoke_kills", "airborne_kills", "moving_kills", "still_kills", "running_kills", "grenade_out_kills", "knife_out_kills", "equipment_disadvantage_kills", "unfair_kills"]
    for row in value.contexts {
        let counts = [row.victimBlindedKills, row.attackerBlindKills, row.wallbangKills, row.penetrationTotal, row.smokeKills, row.airborneKills, row.movingKills, row.stillKills, row.runningKills, row.victimGrenadeOutKills, row.victimKnifeOutKills, row.equipmentDisadvantageKills, row.unfairKills]
        for index in counts.indices { output[contextNames[index], default: 0] += Double(counts[index]) }
    }
    let incomingNames = ["deaths_while_blind", "deaths_to_blind_killer", "wallbang_deaths", "death_penetration_total", "smoke_deaths", "airborne_deaths", "moving_killer_deaths", "still_killer_deaths", "running_killer_deaths", "grenade_out_deaths", "knife_out_deaths", "equipment_disadvantage_deaths", "unfair_deaths"]
    for index in incomingNames.indices { output[incomingNames[index]] = Double(profile[index]) }
    for row in value.assistedBy {
        output["damage_assisted_kills", default: 0] += Double(row.damageAssistedKills)
        output["teammate_flash_assisted_kills", default: 0] += Double(row.teammateFlashAssistedKills)
        output["own_flash_kills", default: 0] += Double(row.ownFlashKills)
    }
    if let targets = flashTargets {
        output["enemies_flashed"] = 0
        output["blind_duration_ms"] = 0
        output["teammates_flashed"] = 0
        output["teammate_blind_duration_ms"] = 0
        output["self_flashes"] = 0
        output["self_blind_duration_ms"] = 0
        for flash in value.flashes {
            if flash.victimPlayerIndex == targets.ownPlayerSlot {
                output["self_flashes", default: 0] += Double(flash.effects)
                output["self_blind_duration_ms", default: 0] += Double(flash.blindDurationMilliseconds)
            } else if targets.teamByPlayerSlot[flash.victimPlayerIndex] == targets.ownTeamID {
                output["teammates_flashed", default: 0] += Double(flash.effects)
                output["teammate_blind_duration_ms", default: 0] += Double(flash.blindDurationMilliseconds)
            } else {
                output["enemies_flashed", default: 0] += Double(flash.effects)
                output["blind_duration_ms", default: 0] += Double(flash.blindDurationMilliseconds)
            }
        }
    }
    return output
}

private func matchIDFilter(_ matchIDs: [Int64]?, column: String) -> SQLQueryString {
    guard let matchIDs, !matchIDs.isEmpty else { return "" }
    return " AND \(unsafeRaw: column) IN (\(binds: matchIDs))"
}

private func comparisonSideData(
    playerID: Int64, matchIDs: [Int64]? = nil,
    sql: any SQLDatabase, timing: ProfileTimingRecorder? = nil
) async throws -> [Int64: [ComparisonSideStats]] {
    let sideDataStart = timing?.start()
    defer { timing?.record("side_data", since: sideDataStart) }
    let flashTargetsStart = timing?.start()
    let flashTargetRows = try await sql.raw("""
        SELECT owner.match_id, owner.player_slot AS own_player_slot,
               owner.match_team_id AS own_team_id, target.player_slot AS target_player_slot,
               target.match_team_id AS target_team_id
        FROM match_players owner
        JOIN match_players target ON target.match_id = owner.match_id
        WHERE owner.player_id = \(bind: playerID) \(matchIDFilter(matchIDs, column: "owner.match_id"))
        """).all()
    timing?.record("flash_targets", since: flashTargetsStart)
    var flashTargetsByMatch: [Int64: ComparisonFlashTargets] = [:]
    for row in flashTargetRows {
        let matchID = try int64(row, "match_id")
        let targetSlot = try integer(row, "target_player_slot")
        if flashTargetsByMatch[matchID] == nil {
            flashTargetsByMatch[matchID] = ComparisonFlashTargets(
                ownPlayerSlot: try integer(row, "own_player_slot"),
                ownTeamID: try int64(row, "own_team_id"),
                teamByPlayerSlot: [:]
            )
        }
        flashTargetsByMatch[matchID]?.teamByPlayerSlot[targetSlot] = try int64(row, "target_team_id")
    }
    let sideStatsStart = timing?.start()
    let rows = try await sql.raw("""
        SELECT mp.match_id, m.payload_schema, m.rounds AS match_round_count,
               (SELECT COUNT(*) FROM match_rounds rt WHERE rt.match_id = mp.match_id) AS timed_round_count,
               s.*
        FROM match_players mp
        JOIN player_side_stats s ON s.match_player_id = mp.id
        JOIN matches m ON m.id = mp.match_id
        WHERE mp.player_id = \(bind: playerID) \(matchIDFilter(matchIDs, column: "mp.match_id"))
        """).all()
    timing?.record("side_stats", since: sideStatsStart)
    var values: [String: ComparisonSideAccumulator] = [:]
    func storageKey(_ matchID: Int64, _ side: PlayerSide) -> String { "\(matchID):\(side.rawValue)" }
    func add(_ matchID: Int64, _ side: PlayerSide, _ name: String, _ amount: Double) {
        values[storageKey(matchID, side)]?.stats[name, default: 0] += amount
    }
    for row in rows {
        let matchID = try int64(row, "match_id")
        let side = try playerSide(row, "side")
        let key = storageKey(matchID, side)
        values[key] = ComparisonSideAccumulator(side: side)
        let integerColumns = [
            ("rounds_played", "rounds"), ("rounds_won", "round_wins"),
            ("kills", "kills"), ("deaths", "deaths"), ("assists", "assists"),
            ("headshots", "headshots"), ("damage", "damage"), ("kast_rounds", "kast_rounds"),
            ("damage_received", "damage_received"),
            ("opening_kills", "opening_kills"), ("opening_deaths", "opening_deaths"),
            ("opening_assisted_kills", "opening_assisted_kills"),
            ("opening_damage_assisted_kills", "opening_damage_assisted_kills"),
            ("opening_flash_assisted_kills", "opening_flash_assisted_kills"),
            ("opening_traded_deaths", "opening_traded_deaths"),
            ("opening_trade_kills", "opening_trade_kills"),
            ("opening_assists", "opening_assists"),
            ("opening_damage_assists", "opening_damage_assists"),
            ("opening_flash_assists", "opening_flash_assists"),
            ("opening_blinded_enemy_kills", "opening_blinded_enemy_kills"),
            ("opening_blind_kills", "opening_blind_kills"),
            ("opening_deaths_while_blind", "opening_deaths_while_blind"),
            ("opening_deaths_to_blind_killer", "opening_deaths_to_blind_killer"),
            ("opening_enemy_assisted_deaths", "opening_enemy_assisted_deaths"),
            ("opening_enemy_damage_assisted_deaths", "opening_enemy_damage_assisted_deaths"),
            ("opening_enemy_flash_assisted_deaths", "opening_enemy_flash_assisted_deaths"),
            ("opening_own_flash_kills", "opening_own_flash_kills"),
            ("opening_victim_side_flash_kills", "opening_victim_side_flash_kills"),
            ("opening_blind_source_unknown_kills", "opening_blind_source_unknown_kills"),
            ("opening_deaths_to_killer_flash", "opening_deaths_to_killer_flash"),
            ("opening_deaths_to_own_side_flash", "opening_deaths_to_own_side_flash"),
            ("opening_deaths_blind_source_unknown", "opening_deaths_blind_source_unknown"),
            ("trade_kills", "trade_kills"), ("tradeable_deaths", "tradeable_deaths"),
            ("attempted_tradeable_deaths", "attempted_tradeable_deaths"), ("traded_deaths", "traded_deaths"),
            ("he_damage", "he_damage"), ("fire_damage", "fire_damage"),
            ("he_grenades_thrown", "he_grenades_thrown"), ("flashbangs_thrown", "flashbangs_thrown"),
            ("smokes_thrown", "smokes_thrown"), ("fire_grenades_thrown", "fire_grenades_thrown"),
            ("decoys_thrown", "decoys_thrown"), ("bomb_plants", "bomb_plants"),
            ("bomb_defuses", "bomb_defuses"),
            ("kill_speed_samples", "kill_speed_samples"), ("kill_speed_percent_samples", "kill_speed_percent_samples"),
            ("death_speed_samples", "death_speed_samples"), ("death_speed_percent_samples", "death_speed_percent_samples"),
            ("clutch_1v1", "clutch_1v1"), ("clutch_1v2", "clutch_1v2"),
            ("clutch_1v3", "clutch_1v3"), ("clutch_1v4", "clutch_1v4"), ("clutch_1v5", "clutch_1v5"),
            ("clutch_attempt_1v1", "clutch_attempt_1v1"), ("clutch_attempt_1v2", "clutch_attempt_1v2"),
            ("clutch_attempt_1v3", "clutch_attempt_1v3"), ("clutch_attempt_1v4", "clutch_attempt_1v4"),
            ("clutch_attempt_1v5", "clutch_attempt_1v5"),
            ("kill_rounds_1k", "kill_rounds_1k"), ("kill_rounds_2k", "kill_rounds_2k"),
            ("kill_rounds_3k", "kill_rounds_3k"), ("kill_rounds_4k", "kill_rounds_4k"),
            ("kill_rounds_5k", "kill_rounds_5k"),
            ("true_kill_rounds_1k", "true_kill_rounds_1k"), ("true_kill_rounds_2k", "true_kill_rounds_2k"),
            ("true_kill_rounds_3k", "true_kill_rounds_3k"), ("true_kill_rounds_4k", "true_kill_rounds_4k"),
            ("true_kill_rounds_5k", "true_kill_rounds_5k"),
            ("true_multikill_rounds", "true_multikill_rounds")
        ]
        for (column, name) in integerColumns { add(matchID, side, name, Double(try integer(row, column))) }
        if timingCompactSchemas.contains(try row.decode(column: "payload_schema", as: String.self)),
           try integer(row, "timed_round_count") == integer(row, "match_round_count") {
            add(matchID, side, "timed_rounds", Double(try integer(row, "rounds_played")))
        }
        let decimalColumns = [
            ("kill_speed_total", "kill_speed_total"), ("kill_speed_percent_total", "kill_speed_percent_total"),
            ("death_speed_total", "death_speed_total"), ("death_speed_percent_total", "death_speed_percent_total")
        ]
        for (column, name) in decimalColumns { add(matchID, side, name, try double(row, column)) }
        let maximumColumns = [
            ("kill_speed_max", "kill_speed_max"), ("kill_speed_percent_max", "kill_speed_percent_max"),
            ("death_speed_max", "death_speed_max"), ("death_speed_percent_max", "death_speed_percent_max")
        ]
        for (column, name) in maximumColumns {
            if let maximum = try optionalDouble(row, column) { add(matchID, side, name, maximum) }
        }
    }

    let economyStart = timing?.start()
    let economyRows = try await sql.raw("""
        SELECT r.match_id,
               CASE WHEN r.t_match_team_id = mp.match_team_id THEN 'T' ELSE 'CT' END AS side,
               r.winner_side,
               r.pistol_round,
               CASE WHEN r.t_match_team_id = mp.match_team_id
                    THEN r.t_equipment_value ELSE r.ct_equipment_value END AS equipment_value,
               CASE WHEN r.t_match_team_id = mp.match_team_id
                    THEN r.t_player_count ELSE r.ct_player_count END AS player_count
        FROM match_players mp
        JOIN match_rounds r ON r.match_id = mp.match_id
          AND mp.match_team_id IN (r.t_match_team_id, r.ct_match_team_id)
        WHERE mp.player_id = \(bind: playerID) \(matchIDFilter(matchIDs, column: "mp.match_id"))
          AND r.pistol_round IS NOT NULL
        """).all()
    timing?.record("economy", since: economyStart)
    for row in economyRows {
        let id = try int64(row, "match_id"), side = try playerSide(row, "side")
        let equipmentValue = try integer(row, "equipment_value")
        let playerCount = max(1, try integer(row, "player_count"))
        let isPistol = try row.decode(column: "pistol_round", as: Bool.self)
        let buy = isPistol ? "pistol" : equipmentValue <= playerCount * 1_000 ? "eco" :
            equipmentValue >= playerCount * 3_500 ? "full" : "force"
        add(id, side, "economy_\(buy)_rounds", 1)
        add(id, side, "economy_\(buy)_equipment_value", Double(equipmentValue))
        if try optionalString(row, "winner_side") == side.rawValue {
            add(id, side, "economy_\(buy)_wins", 1)
        }
    }

    let tradesStart = timing?.start()
    let trades = try await sql.raw("""
        SELECT t.match_id, t.trader_side AS side,
               CAST(SUM(t.opportunities) AS SIGNED) AS opportunities,
               CAST(SUM(t.attempts) AS SIGNED) AS attempts,
               CAST(SUM(t.successes) AS SIGNED) AS successes
        FROM trade_side_stats t JOIN match_players mp ON mp.id = t.trader_match_player_id
        WHERE mp.player_id = \(bind: playerID) \(matchIDFilter(matchIDs, column: "t.match_id"))
        GROUP BY t.match_id, t.trader_side
        """).all()
    timing?.record("trades", since: tradesStart)
    for row in trades {
        let id = try int64(row, "match_id"), side = try playerSide(row, "side")
        add(id, side, "trade_opportunities", Double(try integer(row, "opportunities")))
        add(id, side, "trade_attempts", Double(try integer(row, "attempts")))
        add(id, side, "trade_successes", Double(try integer(row, "successes")))
    }

    let flashesStart = timing?.start()
    let flashes = try await sql.raw("""
        SELECT f.match_id, f.thrower_side AS side,
               CAST(SUM(CASE WHEN victim.match_team_id <> mp.match_team_id THEN f.flash_effects ELSE 0 END) AS SIGNED) AS enemy_effects,
               CAST(SUM(CASE WHEN victim.match_team_id <> mp.match_team_id THEN f.blind_duration_ms ELSE 0 END) AS SIGNED) AS enemy_duration,
               CAST(SUM(CASE WHEN victim.match_team_id = mp.match_team_id AND victim.id <> mp.id THEN f.flash_effects ELSE 0 END) AS SIGNED) AS teammate_effects,
               CAST(SUM(CASE WHEN victim.match_team_id = mp.match_team_id AND victim.id <> mp.id THEN f.blind_duration_ms ELSE 0 END) AS SIGNED) AS teammate_duration,
               CAST(SUM(CASE WHEN victim.id = mp.id THEN f.flash_effects ELSE 0 END) AS SIGNED) AS self_effects,
               CAST(SUM(CASE WHEN victim.id = mp.id THEN f.blind_duration_ms ELSE 0 END) AS SIGNED) AS self_duration
        FROM flash_side_stats f
        JOIN match_players mp ON mp.id = f.thrower_match_player_id
        JOIN match_players victim ON victim.id = f.victim_match_player_id
        WHERE mp.player_id = \(bind: playerID) \(matchIDFilter(matchIDs, column: "f.match_id"))
        GROUP BY f.match_id, f.thrower_side
        """).all()
    timing?.record("flashes", since: flashesStart)
    for row in flashes {
        let id = try int64(row, "match_id"), side = try playerSide(row, "side")
        add(id, side, "enemies_flashed", Double(try integer(row, "enemy_effects")))
        add(id, side, "blind_duration_ms", Double(try integer(row, "enemy_duration")))
        add(id, side, "teammates_flashed", Double(try integer(row, "teammate_effects")))
        add(id, side, "teammate_blind_duration_ms", Double(try integer(row, "teammate_duration")))
        add(id, side, "self_flashes", Double(try integer(row, "self_effects")))
        add(id, side, "self_blind_duration_ms", Double(try integer(row, "self_duration")))
    }

    let assistedKillsStart = timing?.start()
    let beneficiaries = try await sql.raw("""
        SELECT a.match_id, a.beneficiary_side AS side,
               CAST(SUM(a.damage_assisted_kills) AS SIGNED) AS damage_assists,
               CAST(SUM(a.teammate_flash_assisted_kills) AS SIGNED) AS teammate_flash_assists,
               CAST(SUM(a.own_flash_kills) AS SIGNED) AS own_flash
        FROM assisted_kill_side_stats a
        JOIN match_players mp ON mp.id = a.beneficiary_match_player_id
        WHERE mp.player_id = \(bind: playerID) \(matchIDFilter(matchIDs, column: "a.match_id"))
        GROUP BY a.match_id, a.beneficiary_side
        """).all()
    timing?.record("assisted_kills", since: assistedKillsStart)
    for row in beneficiaries {
        let id = try int64(row, "match_id"), side = try playerSide(row, "side")
        add(id, side, "damage_assisted_kills", Double(try integer(row, "damage_assists")))
        add(id, side, "teammate_flash_assisted_kills", Double(try integer(row, "teammate_flash_assists")))
        add(id, side, "own_flash_kills", Double(try integer(row, "own_flash")))
    }

    let flashAssistsStart = timing?.start()
    let assisters = try await sql.raw("""
        SELECT a.match_id, a.beneficiary_side AS side,
               CAST(SUM(a.teammate_flash_assisted_kills) AS SIGNED) AS flash_assists
        FROM assisted_kill_side_stats a
        JOIN match_players mp ON mp.id = a.assister_match_player_id
        WHERE mp.player_id = \(bind: playerID) \(matchIDFilter(matchIDs, column: "a.match_id"))
        GROUP BY a.match_id, a.beneficiary_side
        """).all()
    timing?.record("flash_assists", since: flashAssistsStart)
    for row in assisters {
        let id = try int64(row, "match_id"), side = try playerSide(row, "side")
        add(id, side, "flash_assists", Double(try integer(row, "flash_assists")))
    }

    let contextColumns = [
        ("victim_blinded_kills", "blinded_kills", "deaths_while_blind"),
        ("attacker_blind_kills", "blind_kills", "deaths_to_blind_killer"),
        ("wallbang_kills", "wallbang_kills", "wallbang_deaths"),
        ("penetration_total", "penetration_total", "death_penetration_total"),
        ("smoke_kills", "smoke_kills", "smoke_deaths"),
        ("airborne_kills", "airborne_kills", "airborne_deaths"),
        ("moving_kills", "moving_kills", "moving_killer_deaths"),
        ("still_kills", "still_kills", "still_killer_deaths"),
        ("running_kills", "running_kills", "running_killer_deaths"),
        ("victim_grenade_out_kills", "grenade_out_kills", "grenade_out_deaths"),
        ("victim_knife_out_kills", "knife_out_kills", "knife_out_deaths"),
        ("equipment_disadvantage_kills", "equipment_disadvantage_kills", "equipment_disadvantage_deaths"),
        ("unfair_kills", "unfair_kills", "unfair_deaths")
    ]
    let outgoingContextsStart = timing?.start()
    let contexts = try await sql.raw("""
        SELECT c.* FROM kill_context_side_stats c
        JOIN match_players mp ON mp.id = c.killer_match_player_id
        WHERE mp.player_id = \(bind: playerID) \(matchIDFilter(matchIDs, column: "c.match_id"))
        """).all()
    timing?.record("contexts_out", since: outgoingContextsStart)
    for row in contexts {
        let id = try int64(row, "match_id"), side = try playerSide(row, "killer_side")
        for (column, outgoing, _) in contextColumns { add(id, side, outgoing, Double(try integer(row, column))) }
    }
    let incomingContextsStart = timing?.start()
    let incomingContexts = try await sql.raw("""
        SELECT c.*, CASE WHEN killer.match_team_id = victim.match_team_id THEN c.killer_side
                         WHEN c.killer_side = 'T' THEN 'CT' ELSE 'T' END AS victim_side
        FROM kill_context_side_stats c
        JOIN match_players victim ON victim.id = c.victim_match_player_id
        JOIN match_players killer ON killer.id = c.killer_match_player_id
        WHERE victim.player_id = \(bind: playerID) \(matchIDFilter(matchIDs, column: "c.match_id"))
        """).all()
    timing?.record("contexts_in", since: incomingContextsStart)
    for row in incomingContexts {
        let id = try int64(row, "match_id"), side = try playerSide(row, "victim_side")
        for (column, _, incoming) in contextColumns { add(id, side, incoming, Double(try integer(row, column))) }
    }

    let killTimingStart = timing?.start()
    let killTiming = try await sql.raw("""
        SELECT e.match_id, e.killer_side AS side,
               CAST(COUNT(*) AS SIGNED) AS samples,
               CAST(SUM(e.elapsed_ms) AS SIGNED) AS elapsed_total,
               CAST(SUM(e.since_plant_ms IS NULL AND e.elapsed_ms < 25000) AS SIGNED) AS early_count,
               CAST(SUM(e.since_plant_ms IS NULL AND e.elapsed_ms >= 25000 AND e.elapsed_ms < 75000) AS SIGNED) AS mid_count,
               CAST(SUM(e.since_plant_ms IS NULL AND e.elapsed_ms >= 75000) AS SIGNED) AS late_count,
               CAST(SUM(e.since_plant_ms IS NOT NULL) AS SIGNED) AS postplant_count,
               CAST(COALESCE(SUM(e.since_plant_ms), 0) AS SIGNED) AS postplant_elapsed_total,
               CAST(SUM((e.killer_side = 'T' AND e.t_alive_before < e.ct_alive_before) OR
                        (e.killer_side = 'CT' AND e.ct_alive_before < e.t_alive_before)) AS SIGNED) AS clawback_count,
               CAST(SUM(e.t_alive_before = e.ct_alive_before) AS SIGNED) AS even_count,
               CAST(SUM((e.killer_side = 'T' AND e.t_alive_before > e.ct_alive_before) OR
                        (e.killer_side = 'CT' AND e.ct_alive_before > e.t_alive_before)) AS SIGNED) AS advantage_count,
               CAST(SUM((e.killer_side = 'T' AND e.ct_alive_before = 1 AND e.t_alive_before >= 3) OR
                        (e.killer_side = 'CT' AND e.t_alive_before = 1 AND e.ct_alive_before >= 3)) AS SIGNED) AS cleanup_count,
               CAST(SUM((CASE WHEN e.killer_side = 'T' THEN e.ct_alive_before ELSE e.t_alive_before END) = 5) AS SIGNED) AS enemy_alive_5,
               CAST(SUM((CASE WHEN e.killer_side = 'T' THEN e.ct_alive_before ELSE e.t_alive_before END) = 4) AS SIGNED) AS enemy_alive_4,
               CAST(SUM((CASE WHEN e.killer_side = 'T' THEN e.ct_alive_before ELSE e.t_alive_before END) = 3) AS SIGNED) AS enemy_alive_3,
               CAST(SUM((CASE WHEN e.killer_side = 'T' THEN e.ct_alive_before ELSE e.t_alive_before END) = 2) AS SIGNED) AS enemy_alive_2,
               CAST(SUM((CASE WHEN e.killer_side = 'T' THEN e.ct_alive_before ELSE e.t_alive_before END) = 1) AS SIGNED) AS enemy_alive_1
        FROM death_events e
        JOIN match_players mp ON mp.id = e.killer_match_player_id
        JOIN matches m ON m.id = e.match_id AND m.payload_schema IN ('nickstats.match/10', 'nickstats.match/11', 'nickstats.match/12', 'nickstats.match/13', 'nickstats.match/14', 'nickstats.match/15', 'nickstats.match/16', 'nickstats.match/17', 'nickstats.match/18', 'nickstats.match/19', 'nickstats.match/20', 'nickstats.match/21', 'nickstats.match/22')
        WHERE mp.player_id = \(bind: playerID) \(matchIDFilter(matchIDs, column: "e.match_id"))
          AND e.enemy_kill = TRUE
          AND (SELECT COUNT(*) FROM match_rounds rt WHERE rt.match_id = m.id) = m.rounds
        GROUP BY e.match_id, e.killer_side
        """).all()
    timing?.record("kill_timing", since: killTimingStart)
    for row in killTiming {
        let id = try int64(row, "match_id"), side = try playerSide(row, "side")
        for (column, name) in [
            ("samples", "kill_time_samples"), ("elapsed_total", "kill_time_total_ms"),
            ("early_count", "early_kills"), ("mid_count", "mid_kills"),
            ("late_count", "late_kills"), ("postplant_count", "postplant_kills"),
            ("postplant_elapsed_total", "postplant_kill_time_total_ms"),
            ("clawback_count", "clawback_kills"), ("even_count", "even_kills"),
            ("advantage_count", "advantage_kills"), ("cleanup_count", "cleanup_kills"),
            ("enemy_alive_5", "enemy_alive_5_kills"), ("enemy_alive_4", "enemy_alive_4_kills"),
            ("enemy_alive_3", "enemy_alive_3_kills"), ("enemy_alive_2", "enemy_alive_2_kills"),
            ("enemy_alive_1", "enemy_alive_1_kills")
        ] { add(id, side, name, Double(try integer(row, column))) }
    }

    let deathTimingStart = timing?.start()
    let deathTiming = try await sql.raw("""
        SELECT e.match_id, e.victim_side AS side,
               CAST(COUNT(*) AS SIGNED) AS samples,
               CAST(SUM(e.elapsed_ms) AS SIGNED) AS elapsed_total,
               CAST(SUM(e.since_plant_ms IS NULL AND e.elapsed_ms < 25000) AS SIGNED) AS early_count,
               CAST(SUM(e.since_plant_ms IS NULL AND e.elapsed_ms >= 25000 AND e.elapsed_ms < 75000) AS SIGNED) AS mid_count,
               CAST(SUM(e.since_plant_ms IS NULL AND e.elapsed_ms >= 75000) AS SIGNED) AS late_count,
               CAST(SUM(e.since_plant_ms IS NOT NULL) AS SIGNED) AS postplant_count,
               CAST(COALESCE(SUM(e.since_plant_ms), 0) AS SIGNED) AS postplant_elapsed_total,
               CAST(SUM(e.enemy_kill = TRUE AND
                        ((e.victim_side = 'T' AND e.t_alive_before > e.ct_alive_before) OR
                         (e.victim_side = 'CT' AND e.ct_alive_before > e.t_alive_before))) AS SIGNED) AS bozo_count,
               CAST(SUM(e.enemy_kill = TRUE AND e.t_alive_before = e.ct_alive_before) AS SIGNED) AS even_count,
               CAST(SUM(e.enemy_kill = TRUE AND
                        ((e.victim_side = 'T' AND e.t_alive_before < e.ct_alive_before) OR
                         (e.victim_side = 'CT' AND e.ct_alive_before < e.t_alive_before))) AS SIGNED) AS disadvantage_count,
               CAST(SUM(e.enemy_kill = TRUE AND
                        ((e.victim_side = 'T' AND e.t_alive_before = 1 AND e.ct_alive_before >= 3) OR
                         (e.victim_side = 'CT' AND e.ct_alive_before = 1 AND e.t_alive_before >= 3))) AS SIGNED) AS cleanup_count,
               CAST(SUM(e.enemy_kill = TRUE AND (CASE WHEN e.victim_side = 'T' THEN e.ct_alive_before ELSE e.t_alive_before END) = 5) AS SIGNED) AS enemy_alive_5,
               CAST(SUM(e.enemy_kill = TRUE AND (CASE WHEN e.victim_side = 'T' THEN e.ct_alive_before ELSE e.t_alive_before END) = 4) AS SIGNED) AS enemy_alive_4,
               CAST(SUM(e.enemy_kill = TRUE AND (CASE WHEN e.victim_side = 'T' THEN e.ct_alive_before ELSE e.t_alive_before END) = 3) AS SIGNED) AS enemy_alive_3,
               CAST(SUM(e.enemy_kill = TRUE AND (CASE WHEN e.victim_side = 'T' THEN e.ct_alive_before ELSE e.t_alive_before END) = 2) AS SIGNED) AS enemy_alive_2,
               CAST(SUM(e.enemy_kill = TRUE AND (CASE WHEN e.victim_side = 'T' THEN e.ct_alive_before ELSE e.t_alive_before END) = 1) AS SIGNED) AS enemy_alive_1
        FROM death_events e
        JOIN match_players mp ON mp.id = e.victim_match_player_id
        JOIN matches m ON m.id = e.match_id AND m.payload_schema IN ('nickstats.match/10', 'nickstats.match/11', 'nickstats.match/12', 'nickstats.match/13', 'nickstats.match/14', 'nickstats.match/15', 'nickstats.match/16', 'nickstats.match/17', 'nickstats.match/18', 'nickstats.match/19', 'nickstats.match/20', 'nickstats.match/21', 'nickstats.match/22')
        WHERE mp.player_id = \(bind: playerID) \(matchIDFilter(matchIDs, column: "e.match_id"))
          AND (SELECT COUNT(*) FROM match_rounds rt WHERE rt.match_id = m.id) = m.rounds
        GROUP BY e.match_id, e.victim_side
        """).all()
    timing?.record("death_timing", since: deathTimingStart)
    for row in deathTiming {
        let id = try int64(row, "match_id"), side = try playerSide(row, "side")
        for (column, name) in [
            ("samples", "death_time_samples"), ("elapsed_total", "death_time_total_ms"),
            ("early_count", "early_deaths"), ("mid_count", "mid_deaths"),
            ("late_count", "late_deaths"), ("postplant_count", "postplant_deaths"),
            ("postplant_elapsed_total", "postplant_death_time_total_ms"),
            ("bozo_count", "bozo_deaths"), ("even_count", "even_deaths"),
            ("disadvantage_count", "disadvantage_deaths"), ("cleanup_count", "cleanup_deaths"),
            ("enemy_alive_5", "enemy_alive_5_deaths"), ("enemy_alive_4", "enemy_alive_4_deaths"),
            ("enemy_alive_3", "enemy_alive_3_deaths"), ("enemy_alive_2", "enemy_alive_2_deaths"),
            ("enemy_alive_1", "enemy_alive_1_deaths")
        ] { add(id, side, name, Double(try integer(row, column))) }
    }

    let weaponsStart = timing?.start()
    let weapons = try await sql.raw("""
        SELECT mp.match_id, w.side, w.weapon,
               CAST(SUM(w.kills) AS SIGNED) AS kills, CAST(SUM(w.shots) AS SIGNED) AS shots,
               CAST(SUM(w.hits) AS SIGNED) AS hits, CAST(SUM(w.damage) AS SIGNED) AS damage,
               CAST(SUM(w.rounds_used) AS SIGNED) AS rounds_used
        FROM weapon_side_stats w JOIN match_players mp ON mp.id = w.match_player_id
        WHERE mp.player_id = \(bind: playerID) \(matchIDFilter(matchIDs, column: "mp.match_id"))
        GROUP BY mp.match_id, w.side, w.weapon
        """).all()
    timing?.record("weapons", since: weaponsStart)
    for row in weapons {
        let id = try int64(row, "match_id"), side = try playerSide(row, "side")
        let key = storageKey(id, side)
        values[key]?.weapons.append(ComparisonWeaponStats(
            weapon: try row.decode(column: "weapon", as: String.self),
            kills: try integer(row, "kills"), shots: try integer(row, "shots"), hits: try integer(row, "hits"),
            damage: try integer(row, "damage"), roundsUsed: try integer(row, "rounds_used")
        ))
    }

    var result: [Int64: [ComparisonSideStats]] = [:]
    var resultIndexes: [Int64: [ComparisonSliceKey: Int]] = [:]
    func appendSlice(_ matchID: Int64, _ value: ComparisonSideStats) {
        let index = result[matchID]?.count ?? 0
        result[matchID, default: []].append(value)
        resultIndexes[matchID, default: [:]][ComparisonSliceKey(value)] = index
    }
    let statsDecoder = JSONDecoder()
    for row in rows {
        let matchID = try int64(row, "match_id"), side = try playerSide(row, "side")
        guard let value = values[storageKey(matchID, side)] else { continue }
        appendSlice(matchID, ComparisonSideStats(side: side, buyType: "ALL", opponentBuyType: "ALL", roundResult: "ALL", stats: value.stats, weapons: value.weapons))
    }
    let buySlicesStart = timing?.start()
    let buyRows = try await sql.raw("""
        SELECT b.match_id, b.side, b.buy_type, CAST(b.stats_json AS CHAR) AS stats_json
        FROM player_side_buy_stats b JOIN match_players mp ON mp.id = b.match_player_id
        WHERE mp.player_id = \(bind: playerID) \(matchIDFilter(matchIDs, column: "b.match_id"))
        """).all()
    timing?.record("buy_slices", since: buySlicesStart)
    let buyProcessingStart = timing?.start()
    for row in buyRows {
        let matchID = try int64(row, "match_id")
        let json = try row.decode(column: "stats_json", as: String.self)
        let stats = try statsDecoder.decode(SideStatsPayload.self, from: Data(json.utf8))
        appendSlice(matchID, ComparisonSideStats(
            side: try playerSide(row, "side"),
            buyType: try row.decode(column: "buy_type", as: String.self),
            opponentBuyType: "ALL",
            roundResult: "ALL",
            stats: flattenedBuyStats(stats, flashTargets: flashTargetsByMatch[matchID]),
            weapons: stats.weapons.map { ComparisonWeaponStats(weapon: $0.weapon, kills: $0.kills, shots: $0.shots, hits: $0.hits, damage: $0.damage, roundsUsed: $0.roundsUsed) }
        ))
    }
    timing?.record("buy_processing", since: buyProcessingStart)
    let resultSlicesStart = timing?.start()
    let roundResultRows = try await sql.raw("""
        SELECT r.match_id, r.side, r.buy_type, r.round_result, CAST(r.stats_json AS CHAR) AS stats_json
        FROM player_round_result_stats r JOIN match_players mp ON mp.id = r.match_player_id
        WHERE mp.player_id = \(bind: playerID) \(matchIDFilter(matchIDs, column: "r.match_id"))
        """).all()
    timing?.record("result_slices", since: resultSlicesStart)
    let resultProcessingStart = timing?.start()
    for row in roundResultRows {
        let matchID = try int64(row, "match_id")
        let json = try row.decode(column: "stats_json", as: String.self)
        let stats = try statsDecoder.decode(SideStatsPayload.self, from: Data(json.utf8))
        appendSlice(matchID, ComparisonSideStats(
            side: try playerSide(row, "side"),
            buyType: try row.decode(column: "buy_type", as: String.self),
            opponentBuyType: "ALL",
            roundResult: try row.decode(column: "round_result", as: String.self),
            stats: flattenedBuyStats(stats, flashTargets: flashTargetsByMatch[matchID]),
            weapons: stats.weapons.map { ComparisonWeaponStats(weapon: $0.weapon, kills: $0.kills, shots: $0.shots, hits: $0.hits, damage: $0.damage, roundsUsed: $0.roundsUsed) }
        ))
    }
    timing?.record("result_processing", since: resultProcessingStart)
    let matchupSlicesStart = timing?.start()
    let matchupRows = try await sql.raw("""
        SELECT e.match_id, e.side, e.buy_type, e.opponent_buy_type, e.round_result,
               CAST(e.stats_json AS CHAR) AS stats_json
        FROM player_economy_matchup_stats e JOIN match_players mp ON mp.id = e.match_player_id
        WHERE mp.player_id = \(bind: playerID) \(matchIDFilter(matchIDs, column: "e.match_id"))
        """).all()
    timing?.record("matchup_slices", since: matchupSlicesStart)
    let matchupProcessingStart = timing?.start()
    for row in matchupRows {
        let matchID = try int64(row, "match_id")
        let json = try row.decode(column: "stats_json", as: String.self)
        let stats = try statsDecoder.decode(SideStatsPayload.self, from: Data(json.utf8))
        appendSlice(matchID, ComparisonSideStats(
            side: try playerSide(row, "side"),
            buyType: try row.decode(column: "buy_type", as: String.self),
            opponentBuyType: try row.decode(column: "opponent_buy_type", as: String.self),
            roundResult: try row.decode(column: "round_result", as: String.self),
            stats: flattenedBuyStats(stats, flashTargets: flashTargetsByMatch[matchID]),
            weapons: stats.weapons.map { ComparisonWeaponStats(weapon: $0.weapon, kills: $0.kills, shots: $0.shots, hits: $0.hits, damage: $0.damage, roundsUsed: $0.roundsUsed) }
        ))
    }
    timing?.record("matchup_processing", since: matchupProcessingStart)
    func addBuyMetric(_ matchID: Int64, _ side: PlayerSide, _ buy: String, _ roundResult: String, _ name: String, _ amount: Double, opponentBuy: String = "ALL") {
        let key = ComparisonSliceKey(side: side, buyType: buy, opponentBuyType: opponentBuy, roundResult: roundResult)
        guard let index = resultIndexes[matchID]?[key] else { return }
        result[matchID]?[index].stats[name, default: 0] += amount
    }
    let playedPhaseRows = try await sql.raw("""
        SELECT r.match_id, r.round_number FROM player_round_phase_stats r
        JOIN match_players mp ON mp.id = r.match_player_id
        WHERE mp.player_id = \(bind: playerID) \(matchIDFilter(matchIDs, column: "r.match_id"))
        """).all()
    var playedPhaseRounds = Set<String>()
    for row in playedPhaseRows {
        playedPhaseRounds.insert("\(try int64(row, "match_id")):\(try integer(row, "round_number"))")
    }
    var phaseMetrics: [Int64: [ComparisonSliceKey: [String: Double]]] = [:]
    func addPhaseMetric(_ matchID: Int64, _ side: PlayerSide, _ buy: String, _ opponentBuy: String,
                        _ resultName: String, _ phase: String, _ name: String, _ amount: Double) {
        let key = ComparisonSliceKey(side: side, buyType: buy, opponentBuyType: opponentBuy,
                                     roundResult: resultName, roundPhase: phase)
        phaseMetrics[matchID, default: [:]][key, default: [:]][name, default: 0] += amount
    }
    let survivorsStart = timing?.start()
    let survivorRows = try await sql.raw("""
        SELECT r.match_id, r.round_number,
               CASE WHEN r.t_match_team_id = mp.match_team_id THEN 'T' ELSE 'CT' END AS side,
               r.winner_side, r.pistol_round,
               CASE WHEN r.t_match_team_id = mp.match_team_id
                    THEN r.t_equipment_value ELSE r.ct_equipment_value END AS equipment_value,
               CASE WHEN r.t_match_team_id = mp.match_team_id
                    THEN r.t_player_count ELSE r.ct_player_count END AS player_count,
               CASE WHEN r.t_match_team_id = mp.match_team_id
                    THEN r.ct_equipment_value ELSE r.t_equipment_value END AS opponent_equipment_value,
               CASE WHEN r.t_match_team_id = mp.match_team_id
                    THEN r.ct_player_count ELSE r.t_player_count END AS opponent_player_count,
               CASE WHEN r.winner_side = 'T' THEN r.t_alive_end ELSE r.ct_alive_end END AS survivors
        FROM match_players mp
        JOIN match_rounds r ON r.match_id = mp.match_id
          AND mp.match_team_id IN (r.t_match_team_id, r.ct_match_team_id)
        WHERE mp.player_id = \(bind: playerID) \(matchIDFilter(matchIDs, column: "r.match_id"))
          AND r.winner_side IS NOT NULL
          AND r.t_alive_end IS NOT NULL AND r.ct_alive_end IS NOT NULL
          AND r.pistol_round IS NOT NULL
          AND r.t_equipment_value IS NOT NULL AND r.ct_equipment_value IS NOT NULL
          AND r.t_player_count IS NOT NULL AND r.ct_player_count IS NOT NULL
        """).all()
    timing?.record("survivors", since: survivorsStart)
    let survivorProcessingStart = timing?.start()
    for row in survivorRows {
        let id = try int64(row, "match_id"), side = try playerSide(row, "side")
        let winner = try row.decode(column: "winner_side", as: String.self)
        let won = winner == side.rawValue
        let resultName = won ? "win" : "loss"
        let prefix = won ? "team_win" : "opponent_win"
        let survivors = Double(try integer(row, "survivors"))
        let equipmentValue = try integer(row, "equipment_value")
        let playerCount = max(1, try integer(row, "player_count"))
        let opponentEquipmentValue = try integer(row, "opponent_equipment_value")
        let opponentPlayerCount = max(1, try integer(row, "opponent_player_count"))
        let isPistol = try row.decode(column: "pistol_round", as: Bool.self)
        let buy = isPistol ? "pistol" : equipmentValue <= playerCount * 1_000 ? "eco" :
            equipmentValue >= playerCount * 3_500 ? "full" : "force"
        let opponentBuy = isPistol ? "pistol" : opponentEquipmentValue <= opponentPlayerCount * 1_000 ? "eco" :
            opponentEquipmentValue >= opponentPlayerCount * 3_500 ? "full" : "force"
        let phase = try integer(row, "round_number") <= 24 ? "REGULATION" : "OVERTIME"
        for (buyScope, resultScope) in [("ALL", "ALL"), (buy, "ALL"), ("ALL", resultName), (buy, resultName)] {
            addBuyMetric(id, side, buyScope, resultScope, "\(prefix)_survivor_rounds", 1)
            addBuyMetric(id, side, buyScope, resultScope, "\(prefix)_survivor_total", survivors)
            if playedPhaseRounds.contains("\(id):\(try integer(row, "round_number"))") {
                addPhaseMetric(id, side, buyScope, "ALL", resultScope, phase, "\(prefix)_survivor_rounds", 1)
                addPhaseMetric(id, side, buyScope, "ALL", resultScope, phase, "\(prefix)_survivor_total", survivors)
            }
        }
        addBuyMetric(id, side, buy, resultName, "\(prefix)_survivor_rounds", 1, opponentBuy: opponentBuy)
        addBuyMetric(id, side, buy, resultName, "\(prefix)_survivor_total", survivors, opponentBuy: opponentBuy)
        if playedPhaseRounds.contains("\(id):\(try integer(row, "round_number"))") {
            addPhaseMetric(id, side, buy, opponentBuy, resultName, phase, "\(prefix)_survivor_rounds", 1)
            addPhaseMetric(id, side, buy, opponentBuy, resultName, phase, "\(prefix)_survivor_total", survivors)
        }
    }
    timing?.record("survivor_processing", since: survivorProcessingStart)
    for kind in ["killer", "victim"] {
        let playerColumn = kind == "killer" ? "killer_match_player_id" : "victim_match_player_id"
        let sideColumn = kind == "killer" ? "killer_side" : "victim_side"
        let manCountCondition = kind == "killer"
            ? "source.enemy_kill = TRUE AND ((source.side = 'T' AND source.t_alive_before < source.ct_alive_before) OR (source.side = 'CT' AND source.ct_alive_before < source.t_alive_before))"
            : "source.enemy_kill = TRUE AND ((source.side = 'T' AND source.t_alive_before > source.ct_alive_before) OR (source.side = 'CT' AND source.ct_alive_before > source.t_alive_before))"
        let ownAlive = "CASE WHEN source.side = 'T' THEN source.t_alive_before ELSE source.ct_alive_before END"
        let enemyAlive = "CASE WHEN source.side = 'T' THEN source.ct_alive_before ELSE source.t_alive_before END"
        let secondaryStateCondition = kind == "killer"
            ? "source.enemy_kill = TRUE AND \(ownAlive) > \(enemyAlive)"
            : "source.enemy_kill = TRUE AND \(ownAlive) < \(enemyAlive)"
        let cleanupCondition = kind == "killer"
            ? "source.enemy_kill = TRUE AND \(enemyAlive) = 1 AND \(ownAlive) >= 3"
            : "source.enemy_kill = TRUE AND \(ownAlive) = 1 AND \(enemyAlive) >= 3"
        let eventTimingStart = timing?.start()
        let rows = try await sql.raw("""
            SELECT source.match_id, source.side, source.buy_type, source.opponent_buy_type, source.round_result, source.round_phase,
                   CAST(COUNT(*) AS SIGNED) AS samples,
                   CAST(SUM(source.elapsed_ms) AS SIGNED) AS elapsed_total,
                   CAST(SUM(source.since_plant_ms IS NULL AND source.elapsed_ms < 25000) AS SIGNED) AS early_count,
                   CAST(SUM(source.since_plant_ms IS NULL AND source.elapsed_ms >= 25000 AND source.elapsed_ms < 75000) AS SIGNED) AS mid_count,
                   CAST(SUM(source.since_plant_ms IS NULL AND source.elapsed_ms >= 75000) AS SIGNED) AS late_count,
                   CAST(SUM(source.since_plant_ms IS NOT NULL) AS SIGNED) AS postplant_count,
                   CAST(COALESCE(SUM(source.since_plant_ms), 0) AS SIGNED) AS postplant_elapsed_total,
                   CAST(SUM(\(unsafeRaw: manCountCondition)) AS SIGNED) AS man_count_context,
                   CAST(SUM(source.enemy_kill = TRUE AND \(unsafeRaw: ownAlive) = \(unsafeRaw: enemyAlive)) AS SIGNED) AS even_context,
                   CAST(SUM(\(unsafeRaw: secondaryStateCondition)) AS SIGNED) AS secondary_state_context,
                   CAST(SUM(\(unsafeRaw: cleanupCondition)) AS SIGNED) AS cleanup_context,
                   CAST(SUM(source.enemy_kill = TRUE AND \(unsafeRaw: enemyAlive) = 5) AS SIGNED) AS enemy_alive_5,
                   CAST(SUM(source.enemy_kill = TRUE AND \(unsafeRaw: enemyAlive) = 4) AS SIGNED) AS enemy_alive_4,
                   CAST(SUM(source.enemy_kill = TRUE AND \(unsafeRaw: enemyAlive) = 3) AS SIGNED) AS enemy_alive_3,
                   CAST(SUM(source.enemy_kill = TRUE AND \(unsafeRaw: enemyAlive) = 2) AS SIGNED) AS enemy_alive_2,
                   CAST(SUM(source.enemy_kill = TRUE AND \(unsafeRaw: enemyAlive) = 1) AS SIGNED) AS enemy_alive_1
            FROM (
              SELECT e.match_id, e.\(unsafeRaw: sideColumn) AS side, e.elapsed_ms, e.since_plant_ms,
                     CASE WHEN r.round_number <= 24 THEN 'REGULATION' ELSE 'OVERTIME' END AS round_phase,
                     e.enemy_kill, e.t_alive_before, e.ct_alive_before,
                     CASE WHEN r.winner_side = e.\(unsafeRaw: sideColumn) THEN 'win' ELSE 'loss' END AS round_result,
                     CASE WHEN r.pistol_round THEN 'pistol'
                          WHEN (CASE WHEN e.\(unsafeRaw: sideColumn) = 'T' THEN r.t_equipment_value ELSE r.ct_equipment_value END)
                               <= (CASE WHEN e.\(unsafeRaw: sideColumn) = 'T' THEN r.t_player_count ELSE r.ct_player_count END) * 1000 THEN 'eco'
                          WHEN (CASE WHEN e.\(unsafeRaw: sideColumn) = 'T' THEN r.t_equipment_value ELSE r.ct_equipment_value END)
                               >= (CASE WHEN e.\(unsafeRaw: sideColumn) = 'T' THEN r.t_player_count ELSE r.ct_player_count END) * 3500 THEN 'full'
                          ELSE 'force' END AS buy_type,
                     CASE WHEN r.pistol_round THEN 'pistol'
                          WHEN (CASE WHEN e.\(unsafeRaw: sideColumn) = 'T' THEN r.ct_equipment_value ELSE r.t_equipment_value END)
                               <= (CASE WHEN e.\(unsafeRaw: sideColumn) = 'T' THEN r.ct_player_count ELSE r.t_player_count END) * 1000 THEN 'eco'
                          WHEN (CASE WHEN e.\(unsafeRaw: sideColumn) = 'T' THEN r.ct_equipment_value ELSE r.t_equipment_value END)
                               >= (CASE WHEN e.\(unsafeRaw: sideColumn) = 'T' THEN r.ct_player_count ELSE r.t_player_count END) * 3500 THEN 'full'
                          ELSE 'force' END AS opponent_buy_type
              FROM death_events e
              JOIN match_rounds r ON r.id = e.match_round_id
              JOIN match_players mp ON mp.id = e.\(unsafeRaw: playerColumn)
              WHERE mp.player_id = \(bind: playerID) \(matchIDFilter(matchIDs, column: "e.match_id"))
                \(unsafeRaw: kind == "killer" ? "AND e.enemy_kill = TRUE" : "")
            ) source
            GROUP BY source.match_id, source.side, source.buy_type, source.opponent_buy_type, source.round_result, source.round_phase
            """).all()
        timing?.record(kind == "killer" ? "event_kills" : "event_deaths", since: eventTimingStart)
        let eventProcessingStart = timing?.start()
        for row in rows {
            let id = try int64(row, "match_id"), side = try playerSide(row, "side")
            let buy = try row.decode(column: "buy_type", as: String.self)
            let opponentBuy = try row.decode(column: "opponent_buy_type", as: String.self)
            let roundResult = try row.decode(column: "round_result", as: String.self)
            let phase = try row.decode(column: "round_phase", as: String.self)
            let prefix = kind == "killer" ? "kill" : "death"
            let manCountName = kind == "killer" ? "clawback_kills" : "bozo_deaths"
            let secondaryStateName = kind == "killer" ? "advantage_kills" : "disadvantage_deaths"
            for (column, name) in [
                ("samples", "\(prefix)_time_samples"), ("elapsed_total", "\(prefix)_time_total_ms"),
                ("early_count", "early_\(prefix)s"), ("mid_count", "mid_\(prefix)s"),
                ("late_count", "late_\(prefix)s"), ("postplant_count", "postplant_\(prefix)s"),
                ("postplant_elapsed_total", "postplant_\(prefix)_time_total_ms"),
                ("man_count_context", manCountName), ("even_context", "even_\(prefix)s"),
                ("secondary_state_context", secondaryStateName), ("cleanup_context", "cleanup_\(prefix)s"),
                ("enemy_alive_5", "enemy_alive_5_\(prefix)s"), ("enemy_alive_4", "enemy_alive_4_\(prefix)s"),
                ("enemy_alive_3", "enemy_alive_3_\(prefix)s"), ("enemy_alive_2", "enemy_alive_2_\(prefix)s"),
                ("enemy_alive_1", "enemy_alive_1_\(prefix)s")
            ] {
                let amount = Double(try integer(row, column))
                addBuyMetric(id, side, buy, "ALL", name, amount)
                addBuyMetric(id, side, buy, roundResult, name, amount)
                addBuyMetric(id, side, "ALL", roundResult, name, amount)
                addBuyMetric(id, side, buy, roundResult, name, amount, opponentBuy: opponentBuy)
                for (ownBuy, enemyBuy, selectedResult) in [("ALL", "ALL", "ALL"), (buy, "ALL", "ALL"), (buy, "ALL", roundResult),
                                                             ("ALL", "ALL", roundResult), (buy, opponentBuy, roundResult)] {
                    addPhaseMetric(id, side, ownBuy, enemyBuy, selectedResult, phase, name, amount)
                }
            }
        }
        timing?.record(kind == "killer" ? "event_kills_processing" : "event_deaths_processing", since: eventProcessingStart)
    }
    // Phase rows are assembled from one played player round each. Build each
    // selection scope once so the profile response stays small for long histories.
    let phaseRows = try await sql.raw("""
        SELECT r.match_id, r.round_number, r.side, r.buy_type, r.opponent_buy_type,
               r.round_result, CAST(r.stats_json AS CHAR) AS stats_json
        FROM player_round_phase_stats r JOIN match_players mp ON mp.id = r.match_player_id
        WHERE mp.player_id = \(bind: playerID) \(matchIDFilter(matchIDs, column: "r.match_id"))
        """).all()
    var phaseValues: [Int64: [ComparisonSliceKey: ComparisonSideStats]] = [:]
    for row in phaseRows {
        let matchID = try int64(row, "match_id")
        let side = try playerSide(row, "side")
        let buy = try optionalString(row, "buy_type")
        let opponentBuy = try optionalString(row, "opponent_buy_type")
        let roundResult = try optionalString(row, "round_result")
        let phase = try integer(row, "round_number") <= 24 ? "REGULATION" : "OVERTIME"
        let json = try row.decode(column: "stats_json", as: String.self)
        let stats = try statsDecoder.decode(SideStatsPayload.self, from: Data(json.utf8))
        let flat = flattenedBuyStats(stats, flashTargets: flashTargetsByMatch[matchID])
        let weapons = stats.weapons.map { ComparisonWeaponStats(weapon: $0.weapon, kills: $0.kills, shots: $0.shots, hits: $0.hits, damage: $0.damage, roundsUsed: $0.roundsUsed) }
        var scopes: [(String, String, String)] = [("ALL", "ALL", "ALL")]
        if let buy {
            scopes.append((buy, "ALL", "ALL"))
            if let roundResult { scopes.append((buy, "ALL", roundResult)) }
        }
        if let roundResult { scopes.append(("ALL", "ALL", roundResult)) }
        if let buy, let opponentBuy, let roundResult {
            scopes.append((buy, opponentBuy, roundResult))
        }
        for (ownBuy, enemyBuy, selectedResult) in scopes {
            let key = ComparisonSliceKey(side: side, buyType: ownBuy, opponentBuyType: enemyBuy,
                                         roundResult: selectedResult, roundPhase: phase)
            var value = phaseValues[matchID]?[key] ?? ComparisonSideStats(
                side: side, buyType: ownBuy, opponentBuyType: enemyBuy, roundResult: selectedResult,
                roundPhase: phase, stats: [:], weapons: []
            )
            for (name, amount) in flat {
                if name.hasSuffix("_max") { value.stats[name] = max(value.stats[name] ?? 0, amount) }
                else { value.stats[name, default: 0] += amount }
            }
            for weapon in weapons {
                if let index = value.weapons.firstIndex(where: { $0.weapon == weapon.weapon }) {
                    value.weapons[index].kills += weapon.kills
                    value.weapons[index].shots += weapon.shots
                    value.weapons[index].hits += weapon.hits
                    value.weapons[index].damage += weapon.damage
                    value.weapons[index].roundsUsed += weapon.roundsUsed
                } else { value.weapons.append(weapon) }
            }
            phaseValues[matchID, default: [:]][key] = value
        }
    }
    for (matchID, slices) in phaseValues {
        result[matchID, default: []].append(contentsOf: slices.values)
    }
    for (matchID, slices) in phaseMetrics {
        for (key, metrics) in slices {
            guard let index = result[matchID]?.firstIndex(where: { ComparisonSliceKey($0) == key }) else { continue }
            for (name, amount) in metrics { result[matchID]?[index].stats[name, default: 0] += amount }
        }
    }
    for matchID in Array(result.keys) { result[matchID]?.sort { $0.side.rawValue < $1.side.rawValue } }
    return result
}

private func comparisonMatches(
    playerID: Int64, matchIDs: [Int64]? = nil,
    sql: any SQLDatabase, timing: ProfileTimingRecorder? = nil
) async throws -> [ComparisonMatch] {
    if let matchIDs, matchIDs.isEmpty { return [] }
    let sideData = try await comparisonSideData(
        playerID: playerID, matchIDs: matchIDs, sql: sql, timing: timing
    )
    let matchListStart = timing?.start()
    let rows = try await sql.raw("""
            SELECT m.id, m.payload_schema, m.played_at, m.map_name,
                   own_team.score AS score_for, other_team.score AS score_against,
                   (
                     SELECT GROUP_CONCAT(CAST(teammate.player_id AS CHAR) ORDER BY teammate.player_id)
                     FROM match_players teammate
                     WHERE teammate.match_team_id = mp.match_team_id
                       AND teammate.player_id IS NOT NULL AND teammate.player_id <> mp.player_id
                   ) AS teammate_ids,
                   CAST(SUM(s.rounds_played) AS SIGNED) AS rounds,
                   CAST(SUM(s.kills) AS SIGNED) AS kills,
                   CAST(SUM(s.deaths) AS SIGNED) AS deaths,
                   CAST(SUM(s.assists) AS SIGNED) AS assists,
                   CAST(SUM(s.headshots) AS SIGNED) AS headshots,
                   CAST(SUM(s.damage) AS SIGNED) AS damage,
                   CAST(SUM(s.kast_rounds) AS SIGNED) AS kast_rounds
            FROM match_players mp
            JOIN matches m ON m.id = mp.match_id
            JOIN match_teams own_team ON own_team.id = mp.match_team_id
            LEFT JOIN match_teams other_team
              ON other_team.match_id = mp.match_id AND other_team.id <> mp.match_team_id
            JOIN player_side_stats s ON s.match_player_id = mp.id
            WHERE mp.player_id = \(bind: playerID) \(matchIDFilter(matchIDs, column: "m.id"))
            GROUP BY m.id, m.payload_schema, m.played_at, m.map_name, mp.id, mp.match_team_id,
                     own_team.score, other_team.score
            ORDER BY m.played_at IS NULL, m.played_at DESC, m.id DESC
            """).all()
    timing?.record("match_list", since: matchListStart)
    return try rows.map { row in
            let scoreFor = try optionalInteger(row, "score_for")
            let scoreAgainst = try optionalInteger(row, "score_against")
            let result: String
            if let scoreFor, let scoreAgainst {
                result = scoreFor > scoreAgainst ? "w" : scoreFor < scoreAgainst ? "l" : "n"
            } else {
                result = "n"
            }
            let teammateIDs = try optionalString(row, "teammate_ids")?
                .split(separator: ",").compactMap { Int64($0) } ?? []
            let matchID = try int64(row, "id")
            return ComparisonMatch(
                id: matchID, schema: try row.decode(column: "payload_schema", as: String.self),
                playedAt: unix(try optionalDate(row, "played_at")),
                map: try row.decode(column: "map_name", as: String.self), result: result,
                scoreFor: scoreFor, scoreAgainst: scoreAgainst, teammateIDs: teammateIDs,
                rounds: try integer(row, "rounds"), kills: try integer(row, "kills"),
                deaths: try integer(row, "deaths"), assists: try integer(row, "assists"),
                headshots: try integer(row, "headshots"), damage: try integer(row, "damage"),
                kastRounds: try integer(row, "kast_rounds"), sides: sideData[matchID] ?? []
            )
        }
}

func comparisonData(_ request: Request) async throws -> ComparisonResponse {
    guard let sql = request.db as? any SQLDatabase else { throw Abort(.internalServerError) }
    let query = try request.query.decode(ComparisonQuery.self)
    let tokens = query.players.split(separator: ",")
    let requestedIDs = tokens.compactMap { Int64($0.trimmingCharacters(in: .whitespacesAndNewlines)) }
    let playerIDs = requestedIDs.reduce(into: [Int64]()) { result, id in
        if id > 0 && !result.contains(id) { result.append(id) }
    }
    guard requestedIDs.count == tokens.count, playerIDs.count == requestedIDs.count,
          (2...20).contains(playerIDs.count) else {
        throw Abort(.badRequest, reason: "players must contain 2-20 unique positive player IDs.")
    }
    var players: [ComparisonPlayer] = []
    for playerID in playerIDs {
        guard let identity = try await sql.raw("""
            SELECT id, CAST(steam_id AS CHAR) AS steam_id, current_name
            FROM players WHERE id = \(bind: playerID)
            """).first() else { throw Abort(.notFound, reason: "Player \(playerID) was not found.") }
        players.append(ComparisonPlayer(
            id: try int64(identity, "id"),
            steamID: try identity.decode(column: "steam_id", as: String.self),
            name: try identity.decode(column: "current_name", as: String.self),
            matches: try await comparisonMatches(playerID: playerID, sql: sql)
        ))
    }
    return ComparisonResponse(players: players)
}

private struct ProfileAccumulator {
    var matches = 0
    var wins = 0
    var losses = 0
    var draws = 0
    var rounds = 0
    var roundWins = 0
    var kills = 0
    var deaths = 0
    var assists = 0
    var headshots = 0
    var damage = 0
    var damageReceived = 0
    var kastRounds = 0
    var bombPlants = 0
    var bombDefuses = 0
    var openingKills = 0
    var openingDeaths = 0
    var openingAssistedKills = 0
    var openingDamageAssistedKills = 0
    var openingFlashAssistedKills = 0
    var openingTradedDeaths = 0
    var openingTradeKills = 0
    var openingAssists = 0
    var openingDamageAssists = 0
    var openingFlashAssists = 0
    var openingBlindedEnemyKills = 0
    var openingBlindKills = 0
    var openingDeathsWhileBlind = 0
    var openingDeathsToBlindKiller = 0
    var openingEnemyAssistedDeaths = 0
    var openingEnemyDamageAssistedDeaths = 0
    var openingEnemyFlashAssistedDeaths = 0
    var openingOwnFlashKills = 0
    var openingVictimSideFlashKills = 0
    var openingBlindSourceUnknownKills = 0
    var openingDeathsToKillerFlash = 0
    var openingDeathsToOwnSideFlash = 0
    var openingDeathsBlindSourceUnknown = 0
    var tradeKills = 0
    var tradeableDeaths = 0
    var attemptedTradeableDeaths = 0
    var tradedDeaths = 0
    var highExplosiveDamage = 0
    var fireDamage = 0
    var highExplosiveThrown = 0
    var flashbangsThrown = 0
    var smokesThrown = 0
    var fireGrenadesThrown = 0
    var decoysThrown = 0

    mutating func merge(_ other: ProfileAccumulator) {
        matches += other.matches
        wins += other.wins
        losses += other.losses
        draws += other.draws
        rounds += other.rounds
        roundWins += other.roundWins
        kills += other.kills
        deaths += other.deaths
        assists += other.assists
        headshots += other.headshots
        damage += other.damage
        damageReceived += other.damageReceived
        kastRounds += other.kastRounds
        bombPlants += other.bombPlants
        bombDefuses += other.bombDefuses
        openingKills += other.openingKills
        openingDeaths += other.openingDeaths
        openingAssistedKills += other.openingAssistedKills
        openingDamageAssistedKills += other.openingDamageAssistedKills
        openingFlashAssistedKills += other.openingFlashAssistedKills
        openingTradedDeaths += other.openingTradedDeaths
        openingTradeKills += other.openingTradeKills
        openingAssists += other.openingAssists
        openingDamageAssists += other.openingDamageAssists
        openingFlashAssists += other.openingFlashAssists
        openingBlindedEnemyKills += other.openingBlindedEnemyKills
        openingBlindKills += other.openingBlindKills
        openingDeathsWhileBlind += other.openingDeathsWhileBlind
        openingDeathsToBlindKiller += other.openingDeathsToBlindKiller
        openingEnemyAssistedDeaths += other.openingEnemyAssistedDeaths
        openingEnemyDamageAssistedDeaths += other.openingEnemyDamageAssistedDeaths
        openingEnemyFlashAssistedDeaths += other.openingEnemyFlashAssistedDeaths
        openingOwnFlashKills += other.openingOwnFlashKills
        openingVictimSideFlashKills += other.openingVictimSideFlashKills
        openingBlindSourceUnknownKills += other.openingBlindSourceUnknownKills
        openingDeathsToKillerFlash += other.openingDeathsToKillerFlash
        openingDeathsToOwnSideFlash += other.openingDeathsToOwnSideFlash
        openingDeathsBlindSourceUnknown += other.openingDeathsBlindSourceUnknown
        tradeKills += other.tradeKills
        tradeableDeaths += other.tradeableDeaths
        attemptedTradeableDeaths += other.attemptedTradeableDeaths
        tradedDeaths += other.tradedDeaths
        highExplosiveDamage += other.highExplosiveDamage
        fireDamage += other.fireDamage
        highExplosiveThrown += other.highExplosiveThrown
        flashbangsThrown += other.flashbangsThrown
        smokesThrown += other.smokesThrown
        fireGrenadesThrown += other.fireGrenadesThrown
        decoysThrown += other.decoysThrown
    }

    var killDeathRatio: Double { deaths > 0 ? Double(kills) / Double(deaths) : Double(kills) }
    var averageDamagePerRound: Double { rounds > 0 ? Double(damage) / Double(rounds) : 0 }
    var kastPercent: Double { rounds > 0 ? 100 * Double(kastRounds) / Double(rounds) : 0 }
    var winRate: Double { matches > 0 ? 100 * Double(wins) / Double(matches) : 0 }

    var rating: Double {
        guard rounds > 0 else { return 0 }
        let played = Double(rounds)
        let killsPerRound = Double(kills) / played
        let deathsPerRound = Double(deaths) / played
        let assistsPerRound = Double(assists) / played
        let impact = 2.13 * killsPerRound + 0.42 * assistsPerRound - 0.41
        return max(
            0,
            0.0073 * kastPercent + 0.3591 * killsPerRound - 0.5329 * deathsPerRound
                + 0.2372 * impact + 0.0032 * averageDamagePerRound + 0.1587
        )
    }
}

func getPlayerProfile(_ playerID: Int64, on database: any Database) async throws -> PlayerProfileResponse {
    guard let sql = database as? any SQLDatabase else { throw Abort(.internalServerError) }
    guard let player = try await sql.raw("""
        SELECT id, CAST(steam_id AS CHAR) AS steam_id, current_name, first_seen_at, last_seen_at
        FROM players WHERE id = \(bind: playerID)
        """).first() else { throw Abort(.notFound, reason: "Player not found.") }
    let profileMatches = try await comparisonMatches(playerID: playerID, sql: sql)

    let matchRows = try await sql.raw("""
        SELECT m.id, m.map_name, own_team.score AS own_score, other_team.score AS other_score,
               CAST(SUM(s.rounds_played) AS SIGNED) AS rounds_played,
               CAST(SUM(s.rounds_won) AS SIGNED) AS rounds_won,
               CAST(SUM(s.kills) AS SIGNED) AS kills,
               CAST(SUM(s.deaths) AS SIGNED) AS deaths,
               CAST(SUM(s.assists) AS SIGNED) AS assists,
               CAST(SUM(s.headshots) AS SIGNED) AS headshots,
               CAST(SUM(s.damage) AS SIGNED) AS damage,
               CAST(SUM(s.damage_received) AS SIGNED) AS damage_received,
               CAST(SUM(s.kast_rounds) AS SIGNED) AS kast_rounds,
               CAST(SUM(s.opening_kills) AS SIGNED) AS opening_kills,
               CAST(SUM(s.opening_deaths) AS SIGNED) AS opening_deaths,
               CAST(SUM(s.opening_assisted_kills) AS SIGNED) AS opening_assisted_kills,
               CAST(SUM(s.opening_damage_assisted_kills) AS SIGNED) AS opening_damage_assisted_kills,
               CAST(SUM(s.opening_flash_assisted_kills) AS SIGNED) AS opening_flash_assisted_kills,
               CAST(SUM(s.opening_traded_deaths) AS SIGNED) AS opening_traded_deaths,
               CAST(SUM(s.opening_trade_kills) AS SIGNED) AS opening_trade_kills,
               CAST(SUM(s.opening_assists) AS SIGNED) AS opening_assists,
               CAST(SUM(s.opening_damage_assists) AS SIGNED) AS opening_damage_assists,
               CAST(SUM(s.opening_flash_assists) AS SIGNED) AS opening_flash_assists,
               CAST(SUM(s.opening_blinded_enemy_kills) AS SIGNED) AS opening_blinded_enemy_kills,
               CAST(SUM(s.opening_blind_kills) AS SIGNED) AS opening_blind_kills,
               CAST(SUM(s.opening_deaths_while_blind) AS SIGNED) AS opening_deaths_while_blind,
               CAST(SUM(s.opening_deaths_to_blind_killer) AS SIGNED) AS opening_deaths_to_blind_killer,
               CAST(SUM(s.opening_enemy_assisted_deaths) AS SIGNED) AS opening_enemy_assisted_deaths,
               CAST(SUM(s.opening_enemy_damage_assisted_deaths) AS SIGNED) AS opening_enemy_damage_assisted_deaths,
               CAST(SUM(s.opening_enemy_flash_assisted_deaths) AS SIGNED) AS opening_enemy_flash_assisted_deaths,
               CAST(SUM(s.opening_own_flash_kills) AS SIGNED) AS opening_own_flash_kills,
               CAST(SUM(s.opening_victim_side_flash_kills) AS SIGNED) AS opening_victim_side_flash_kills,
               CAST(SUM(s.opening_blind_source_unknown_kills) AS SIGNED) AS opening_blind_source_unknown_kills,
               CAST(SUM(s.opening_deaths_to_killer_flash) AS SIGNED) AS opening_deaths_to_killer_flash,
               CAST(SUM(s.opening_deaths_to_own_side_flash) AS SIGNED) AS opening_deaths_to_own_side_flash,
               CAST(SUM(s.opening_deaths_blind_source_unknown) AS SIGNED) AS opening_deaths_blind_source_unknown,
               CAST(SUM(s.trade_kills) AS SIGNED) AS trade_kills,
               CAST(SUM(s.tradeable_deaths) AS SIGNED) AS tradeable_deaths,
               CAST(SUM(s.attempted_tradeable_deaths) AS SIGNED) AS attempted_tradeable_deaths,
               CAST(SUM(s.traded_deaths) AS SIGNED) AS traded_deaths,
               CAST(SUM(s.he_damage) AS SIGNED) AS he_damage,
               CAST(SUM(s.fire_damage) AS SIGNED) AS fire_damage,
               CAST(SUM(s.he_grenades_thrown) AS SIGNED) AS he_grenades_thrown,
               CAST(SUM(s.flashbangs_thrown) AS SIGNED) AS flashbangs_thrown,
               CAST(SUM(s.smokes_thrown) AS SIGNED) AS smokes_thrown,
               CAST(SUM(s.fire_grenades_thrown) AS SIGNED) AS fire_grenades_thrown,
               CAST(SUM(s.decoys_thrown) AS SIGNED) AS decoys_thrown,
               CAST(SUM(s.bomb_plants) AS SIGNED) AS bomb_plants,
               CAST(SUM(s.bomb_defuses) AS SIGNED) AS bomb_defuses
        FROM match_players mp
        JOIN matches m ON m.id = mp.match_id
        JOIN match_teams own_team ON own_team.id = mp.match_team_id
        LEFT JOIN match_teams other_team
          ON other_team.match_id = mp.match_id AND other_team.id <> mp.match_team_id
        JOIN player_side_stats s ON s.match_player_id = mp.id
        WHERE mp.player_id = \(bind: playerID)
        GROUP BY m.id, m.map_name, own_team.score, other_team.score
        ORDER BY m.id DESC
        """).all()

    var totals = ProfileAccumulator()
    var mapTotals: [String: ProfileAccumulator] = [:]
    for row in matchRows {
        var match = ProfileAccumulator()
        match.matches = 1
        if let ownScore = try optionalInteger(row, "own_score"),
           let otherScore = try optionalInteger(row, "other_score") {
            if ownScore > otherScore { match.wins = 1 }
            else if ownScore < otherScore { match.losses = 1 }
            else { match.draws = 1 }
        }
        match.rounds = try integer(row, "rounds_played")
        match.roundWins = try integer(row, "rounds_won")
        match.kills = try integer(row, "kills")
        match.deaths = try integer(row, "deaths")
        match.assists = try integer(row, "assists")
        match.headshots = try integer(row, "headshots")
        match.damage = try integer(row, "damage")
        match.damageReceived = try integer(row, "damage_received")
        match.kastRounds = try integer(row, "kast_rounds")
        match.bombPlants = try integer(row, "bomb_plants")
        match.bombDefuses = try integer(row, "bomb_defuses")
        match.openingKills = try integer(row, "opening_kills")
        match.openingDeaths = try integer(row, "opening_deaths")
        match.openingAssistedKills = try integer(row, "opening_assisted_kills")
        match.openingDamageAssistedKills = try integer(row, "opening_damage_assisted_kills")
        match.openingFlashAssistedKills = try integer(row, "opening_flash_assisted_kills")
        match.openingTradedDeaths = try integer(row, "opening_traded_deaths")
        match.openingTradeKills = try integer(row, "opening_trade_kills")
        match.openingAssists = try integer(row, "opening_assists")
        match.openingDamageAssists = try integer(row, "opening_damage_assists")
        match.openingFlashAssists = try integer(row, "opening_flash_assists")
        match.openingBlindedEnemyKills = try integer(row, "opening_blinded_enemy_kills")
        match.openingBlindKills = try integer(row, "opening_blind_kills")
        match.openingDeathsWhileBlind = try integer(row, "opening_deaths_while_blind")
        match.openingDeathsToBlindKiller = try integer(row, "opening_deaths_to_blind_killer")
        match.openingEnemyAssistedDeaths = try integer(row, "opening_enemy_assisted_deaths")
        match.openingEnemyDamageAssistedDeaths = try integer(row, "opening_enemy_damage_assisted_deaths")
        match.openingEnemyFlashAssistedDeaths = try integer(row, "opening_enemy_flash_assisted_deaths")
        match.openingOwnFlashKills = try integer(row, "opening_own_flash_kills")
        match.openingVictimSideFlashKills = try integer(row, "opening_victim_side_flash_kills")
        match.openingBlindSourceUnknownKills = try integer(row, "opening_blind_source_unknown_kills")
        match.openingDeathsToKillerFlash = try integer(row, "opening_deaths_to_killer_flash")
        match.openingDeathsToOwnSideFlash = try integer(row, "opening_deaths_to_own_side_flash")
        match.openingDeathsBlindSourceUnknown = try integer(row, "opening_deaths_blind_source_unknown")
        match.tradeKills = try integer(row, "trade_kills")
        match.tradeableDeaths = try integer(row, "tradeable_deaths")
        match.attemptedTradeableDeaths = try integer(row, "attempted_tradeable_deaths")
        match.tradedDeaths = try integer(row, "traded_deaths")
        match.highExplosiveDamage = try integer(row, "he_damage")
        match.fireDamage = try integer(row, "fire_damage")
        match.highExplosiveThrown = try integer(row, "he_grenades_thrown")
        match.flashbangsThrown = try integer(row, "flashbangs_thrown")
        match.smokesThrown = try integer(row, "smokes_thrown")
        match.fireGrenadesThrown = try integer(row, "fire_grenades_thrown")
        match.decoysThrown = try integer(row, "decoys_thrown")
        totals.merge(match)
        let mapName = try row.decode(column: "map_name", as: String.self)
        mapTotals[mapName, default: ProfileAccumulator()].merge(match)
    }

    let tradeRow = try await sql.raw("""
        SELECT CAST(COALESCE(SUM(t.opportunities), 0) AS SIGNED) AS opportunities,
               CAST(COALESCE(SUM(t.attempts), 0) AS SIGNED) AS attempts,
               CAST(COALESCE(SUM(t.successes), 0) AS SIGNED) AS successes
        FROM match_players mp
        JOIN trade_side_stats t ON t.trader_match_player_id = mp.id
        WHERE mp.player_id = \(bind: playerID)
        """).first()!
    let flashRow = try await sql.raw("""
        SELECT CAST(COALESCE(SUM(CASE WHEN victim.match_team_id <> mp.match_team_id THEN f.flash_effects ELSE 0 END), 0) AS SIGNED) AS enemies_flashed,
               CAST(COALESCE(SUM(CASE WHEN victim.match_team_id <> mp.match_team_id THEN f.blind_duration_ms ELSE 0 END), 0) AS SIGNED) AS blind_duration_ms,
               CAST(COALESCE(SUM(CASE WHEN victim.match_team_id = mp.match_team_id AND victim.id <> mp.id THEN f.flash_effects ELSE 0 END), 0) AS SIGNED) AS teammates_flashed,
               CAST(COALESCE(SUM(CASE WHEN victim.match_team_id = mp.match_team_id AND victim.id <> mp.id THEN f.blind_duration_ms ELSE 0 END), 0) AS SIGNED) AS teammate_blind_duration_ms,
               CAST(COALESCE(SUM(CASE WHEN victim.id = mp.id THEN f.flash_effects ELSE 0 END), 0) AS SIGNED) AS self_flashes,
               CAST(COALESCE(SUM(CASE WHEN victim.id = mp.id THEN f.blind_duration_ms ELSE 0 END), 0) AS SIGNED) AS self_blind_duration_ms
        FROM match_players mp
        JOIN flash_side_stats f ON f.thrower_match_player_id = mp.id
        JOIN match_players victim ON victim.id = f.victim_match_player_id
        WHERE mp.player_id = \(bind: playerID)
        """).first()!
    let assistRow = try await sql.raw("""
        SELECT CAST(COALESCE(SUM(a.teammate_flash_assisted_kills), 0) AS SIGNED) AS flash_assists
        FROM match_players mp
        JOIN assisted_kill_side_stats a ON a.assister_match_player_id = mp.id
        WHERE mp.player_id = \(bind: playerID)
        """).first()!
    let weaponRows = try await sql.raw("""
        SELECT w.weapon,
               CAST(SUM(w.kills) AS SIGNED) AS kills,
               CAST(SUM(w.shots) AS SIGNED) AS shots,
               CAST(SUM(w.hits) AS SIGNED) AS hits,
               CAST(SUM(w.damage) AS SIGNED) AS damage,
               CAST(SUM(w.rounds_used) AS SIGNED) AS rounds_used
        FROM match_players mp
        JOIN weapon_side_stats w ON w.match_player_id = mp.id
        WHERE mp.player_id = \(bind: playerID)
        GROUP BY w.weapon
        ORDER BY kills DESC, damage DESC, w.weapon
        """).all()

    var maps: [PlayerMapProfileStats] = []
    for (name, stats) in mapTotals {
        maps.append(PlayerMapProfileStats(
            map: name, matches: stats.matches, wins: stats.wins, losses: stats.losses,
            draws: stats.draws, rounds: stats.rounds, rating: stats.rating,
            killDeathRatio: stats.killDeathRatio, averageDamagePerRound: stats.averageDamagePerRound,
            kastPercent: stats.kastPercent, winRate: stats.winRate
        ))
    }
    maps.sort { left, right in
        left.matches == right.matches ? left.map < right.map : left.matches > right.matches
    }

    return PlayerProfileResponse(
        player: PlayerProfileIdentity(
            id: try int64(player, "id"),
            steamID: try player.decode(column: "steam_id", as: String.self),
            name: try player.decode(column: "current_name", as: String.self),
            firstSeenAt: unix(try optionalDate(player, "first_seen_at")),
            lastSeenAt: unix(try optionalDate(player, "last_seen_at"))
        ),
        headline: PlayerHeadlineStats(
            rating: totals.rating, killDeathRatio: totals.killDeathRatio,
            averageDamagePerRound: totals.averageDamagePerRound,
            kastPercent: totals.kastPercent, winRate: totals.winRate
        ),
        totals: PlayerCareerTotals(
            matches: totals.matches, wins: totals.wins, losses: totals.losses, draws: totals.draws,
            rounds: totals.rounds, roundWins: totals.roundWins, kills: totals.kills,
            deaths: totals.deaths, assists: totals.assists, headshots: totals.headshots,
            damage: totals.damage, damageReceived: totals.damageReceived,
            kastRounds: totals.kastRounds, bombPlants: totals.bombPlants,
            bombDefuses: totals.bombDefuses
        ),
        utility: PlayerUtilityStats(
            highExplosiveDamage: totals.highExplosiveDamage,
            fireDamage: totals.fireDamage,
            enemiesFlashed: try integer(flashRow, "enemies_flashed"),
            blindDurationSeconds: Double(try integer(flashRow, "blind_duration_ms")) / 1000,
            teammatesFlashed: try integer(flashRow, "teammates_flashed"),
            teammateBlindDurationSeconds: Double(try integer(flashRow, "teammate_blind_duration_ms")) / 1000,
            selfFlashes: try integer(flashRow, "self_flashes"),
            selfBlindDurationSeconds: Double(try integer(flashRow, "self_blind_duration_ms")) / 1000,
            flashAssists: try integer(assistRow, "flash_assists"),
            highExplosiveThrown: totals.highExplosiveThrown,
            flashbangsThrown: totals.flashbangsThrown, smokesThrown: totals.smokesThrown,
            fireGrenadesThrown: totals.fireGrenadesThrown, decoysThrown: totals.decoysThrown
        ),
        trades: PlayerTradeProfileStats(
            kills: totals.tradeKills,
            opportunities: try integer(tradeRow, "opportunities"),
            attempts: try integer(tradeRow, "attempts"),
            successes: try integer(tradeRow, "successes"),
            tradeableDeaths: totals.tradeableDeaths,
            attemptedTradeableDeaths: totals.attemptedTradeableDeaths,
            tradedDeaths: totals.tradedDeaths
        ),
        openings: PlayerOpeningProfileStats(
            kills: totals.openingKills, deaths: totals.openingDeaths,
            assistedKills: totals.openingAssistedKills,
            damageAssistedKills: totals.openingDamageAssistedKills,
            flashAssistedKills: totals.openingFlashAssistedKills,
            tradedDeaths: totals.openingTradedDeaths, tradeKills: totals.openingTradeKills,
            assists: totals.openingAssists, damageAssists: totals.openingDamageAssists,
            flashAssists: totals.openingFlashAssists,
            blindedEnemyKills: totals.openingBlindedEnemyKills,
            blindKills: totals.openingBlindKills,
            deathsWhileBlind: totals.openingDeathsWhileBlind,
            deathsToBlindKiller: totals.openingDeathsToBlindKiller,
            enemyAssistedDeaths: totals.openingEnemyAssistedDeaths,
            enemyDamageAssistedDeaths: totals.openingEnemyDamageAssistedDeaths,
            enemyFlashAssistedDeaths: totals.openingEnemyFlashAssistedDeaths,
            ownFlashKills: totals.openingOwnFlashKills,
            victimSideFlashKills: totals.openingVictimSideFlashKills,
            blindSourceUnknownKills: totals.openingBlindSourceUnknownKills,
            deathsToKillerFlash: totals.openingDeathsToKillerFlash,
            deathsToOwnSideFlash: totals.openingDeathsToOwnSideFlash,
            deathsBlindSourceUnknown: totals.openingDeathsBlindSourceUnknown
        ),
        weapons: try weaponRows.map { row in
            PlayerWeaponProfileStats(
                weapon: try row.decode(column: "weapon", as: String.self),
                kills: try integer(row, "kills"), shots: try integer(row, "shots"), hits: try integer(row, "hits"),
                damage: try integer(row, "damage"), roundsUsed: try integer(row, "rounds_used")
            )
        },
        maps: maps,
        matches: profileMatches
    )
}

func getPlayerProfileIdentity(
    _ playerID: Int64, on database: any Database, timing: ProfileTimingRecorder? = nil
) async throws -> PlayerProfileIdentity {
    guard let sql = database as? any SQLDatabase else { throw Abort(.internalServerError) }
    let identityStart = timing?.start()
    guard let player = try await sql.raw("""
        SELECT id, CAST(steam_id AS CHAR) AS steam_id, current_name, first_seen_at, last_seen_at
        FROM players WHERE id = \(bind: playerID)
        """).first() else { throw Abort(.notFound, reason: "Player not found.") }
    timing?.record("identity", since: identityStart)
    return PlayerProfileIdentity(
        id: try int64(player, "id"),
        steamID: try player.decode(column: "steam_id", as: String.self),
        name: try player.decode(column: "current_name", as: String.self),
        firstSeenAt: unix(try optionalDate(player, "first_seen_at")),
        lastSeenAt: unix(try optionalDate(player, "last_seen_at"))
    )
}

func getPlayerProfileMatches(
    _ playerID: Int64, matchIDs: [Int64],
    on database: any Database, timing: ProfileTimingRecorder? = nil
) async throws -> [ComparisonMatch] {
    guard let sql = database as? any SQLDatabase else { throw Abort(.internalServerError) }
    return try await comparisonMatches(
        playerID: playerID, matchIDs: matchIDs, sql: sql, timing: timing
    )
}

func getPlayerProfileData(
    _ playerID: Int64, on database: any Database, timing: ProfileTimingRecorder? = nil
) async throws -> PlayerProfileDataResponse {
    guard let sql = database as? any SQLDatabase else { throw Abort(.internalServerError) }
    return PlayerProfileDataResponse(
        player: try await getPlayerProfileIdentity(playerID, on: database, timing: timing),
        matches: try await comparisonMatches(playerID: playerID, sql: sql, timing: timing)
    )
}

func getMatch(_ matchID: Int64, on database: any Database) async throws -> MatchPayload {
    guard let sql = database as? any SQLDatabase else { throw Abort(.internalServerError) }
    guard let match = try await sql.raw("""
        SELECT m.*, LOWER(HEX(m.demo_sha256)) AS sha256,
               CAST(pc.rules_json AS CHAR) AS rules_json
        FROM matches m JOIN parser_configs pc ON pc.id = m.parser_config_id
        WHERE m.id = \(bind: matchID)
        """).first() else { throw Abort(.notFound, reason: "Match not found.") }

    let teamRows = try await sql.raw("""
        SELECT id, team_slot, source_team_id, display_name, score, t_round_wins, ct_round_wins
        FROM match_teams WHERE match_id = \(bind: matchID) ORDER BY team_slot
        """).all()
    let teamSlotByID = Dictionary(uniqueKeysWithValues: try teamRows.map {
        (try int64($0, "id"), try integer($0, "team_slot"))
    })
    let playerRows = try await sql.raw("""
        SELECT mp.id, mp.match_team_id, mp.player_slot, mp.display_name, mp.is_bot,
               CAST(p.steam_id AS CHAR) AS steam_id
        FROM match_players mp LEFT JOIN players p ON p.id = mp.player_id
        WHERE mp.match_id = \(bind: matchID) ORDER BY mp.player_slot
        """).all()

    var internalToSlot: [Int64: Int] = [:]
    var teamMembers: [Int64: [Int]] = [:]
    var players: [PlayerPayload] = []
    for row in playerRows {
        let internalID = try int64(row, "id")
        let slot = try integer(row, "player_slot")
        let teamID = try int64(row, "match_team_id")
        internalToSlot[internalID] = slot
        teamMembers[teamID, default: []].append(slot)
        let isBot = try row.decode(column: "is_bot", as: Bool.self)
        players.append(PlayerPayload(
            name: try row.decode(column: "display_name", as: String.self),
            steamID: try optionalString(row, "steam_id"), bot: isBot ? true : nil,
            sides: PlayerSideStats(terrorist: emptySide(), counterTerrorist: emptySide())
        ))
    }

    let statRows = try await sql.raw("""
        SELECT s.* FROM player_side_stats s
        JOIN match_players mp ON mp.id = s.match_player_id
        WHERE mp.match_id = \(bind: matchID)
        """).all()
    for row in statRows {
        let actorID = try int64(row, "match_player_id")
        let slot = internalToSlot[actorID]!
        players[slot].sides[try playerSide(row, "side")] = try decodeSide(row)
    }

    try await attachWeapons(sql, matchID: matchID, players: &players, slots: internalToSlot)
    try await attachRelations(sql, matchID: matchID, players: &players, slots: internalToSlot)

    let buyRows = try await sql.raw("""
        SELECT b.match_player_id, b.side, b.buy_type, CAST(b.stats_json AS CHAR) AS stats_json
        FROM player_side_buy_stats b WHERE b.match_id = \(bind: matchID)
        """).all()
    let buyOrder = ["pistol", "eco", "force", "full"]
    var buyStats: [Int: [String: SideStatsPayload]] = [:]
    for row in buyRows {
        guard let slot = internalToSlot[try int64(row, "match_player_id")] else { continue }
        let key = "\(try row.decode(column: "buy_type", as: String.self)):\(try row.decode(column: "side", as: String.self))"
        let json = try row.decode(column: "stats_json", as: String.self)
        buyStats[slot, default: [:]][key] = try JSONDecoder().decode(SideStatsPayload.self, from: Data(json.utf8))
    }
    for slot in players.indices where buyStats[slot] != nil {
        players[slot].buys = buyOrder.flatMap { buy in
            [buyStats[slot]?["\(buy):T"] ?? emptySide(), buyStats[slot]?["\(buy):CT"] ?? emptySide()]
        }
    }
    let roundResultRows = try await sql.raw("""
        SELECT r.match_player_id, r.side, r.buy_type, r.round_result,
               CAST(r.stats_json AS CHAR) AS stats_json
        FROM player_round_result_stats r WHERE r.match_id = \(bind: matchID)
        """).all()
    var resultStats: [Int: [String: SideStatsPayload]] = [:]
    for row in roundResultRows {
        guard let slot = internalToSlot[try int64(row, "match_player_id")] else { continue }
        let key = "\(try row.decode(column: "buy_type", as: String.self)):\(try row.decode(column: "round_result", as: String.self)):\(try row.decode(column: "side", as: String.self))"
        let json = try row.decode(column: "stats_json", as: String.self)
        resultStats[slot, default: [:]][key] = try JSONDecoder().decode(SideStatsPayload.self, from: Data(json.utf8))
    }
    for slot in players.indices where resultStats[slot] != nil {
        players[slot].roundResults = ["ALL", "pistol", "eco", "force", "full"].flatMap { buy in
            ["win", "loss"].flatMap { result in
                [resultStats[slot]?["\(buy):\(result):T"] ?? emptySide(), resultStats[slot]?["\(buy):\(result):CT"] ?? emptySide()]
            }
        }
    }
    let matchupRows = try await sql.raw("""
        SELECT e.match_player_id, e.side, e.buy_type, e.opponent_buy_type, e.round_result,
               CAST(e.stats_json AS CHAR) AS stats_json
        FROM player_economy_matchup_stats e WHERE e.match_id = \(bind: matchID)
        """).all()
    let matchupBuyOrder = ["pistol", "eco", "force", "full"]
    let matchupResults = ["win", "loss"]
    var matchupStats: [Int: [EconomyMatchupStats]] = [:]
    for row in matchupRows {
        guard let slot = internalToSlot[try int64(row, "match_player_id")] else { continue }
        let buyType = try row.decode(column: "buy_type", as: String.self)
        let opponentBuyType = try row.decode(column: "opponent_buy_type", as: String.self)
        let result = try row.decode(column: "round_result", as: String.self)
        let side = try row.decode(column: "side", as: String.self)
        guard let buyIndex = matchupBuyOrder.firstIndex(of: buyType),
              let opponentIndex = matchupBuyOrder.firstIndex(of: opponentBuyType),
              let resultIndex = matchupResults.firstIndex(of: result),
              let sideIndex = PlayerSide.allCases.firstIndex(where: { $0.rawValue == side }) else { continue }
        let json = try row.decode(column: "stats_json", as: String.self)
        let stats = try JSONDecoder().decode(SideStatsPayload.self, from: Data(json.utf8))
        matchupStats[slot, default: []].append(EconomyMatchupStats(
            ownBuyIndex: buyIndex, opponentBuyIndex: opponentIndex,
            resultIndex: resultIndex, sideIndex: sideIndex, stats: stats
        ))
    }
    for slot in players.indices where matchupStats[slot] != nil {
        players[slot].economyMatchups = matchupStats[slot]
    }

    let phaseRows = try await sql.raw("""
        SELECT match_player_id, round_number, side, buy_type, opponent_buy_type,
               round_result, CAST(stats_json AS CHAR) AS stats_json
        FROM player_round_phase_stats WHERE match_id = \(bind: matchID)
        ORDER BY round_number
        """).all()
    for row in phaseRows {
        guard let slot = internalToSlot[try int64(row, "match_player_id")] else { continue }
        let json = try row.decode(column: "stats_json", as: String.self)
        players[slot].roundSlices = (players[slot].roundSlices ?? []) + [PlayerRoundSlice(
            round: try integer(row, "round_number"), side: try playerSide(row, "side"),
            buy: try optionalString(row, "buy_type"),
            opponentBuy: try optionalString(row, "opponent_buy_type"),
            result: try optionalString(row, "round_result"),
            stats: try JSONDecoder().decode(SideStatsPayload.self, from: Data(json.utf8))
        )]
    }

    let roundRows = try await sql.raw("""
        SELECT * FROM match_rounds WHERE match_id = \(bind: matchID) ORDER BY round_number
        """).all()
    let roundTiming = try roundRows.map { row in
            RoundTimingPayload(
                round: try integer(row, "round_number"), liveStartTick: try int64(row, "live_start_tick"),
                endTick: try int64(row, "end_tick"), durationMilliseconds: try integer(row, "duration_ms"),
                winnerSide: (try optionalString(row, "winner_side")).flatMap { PlayerSide(rawValue: $0) },
                bombPlantElapsedMilliseconds: try optionalInteger(row, "bomb_plant_elapsed_ms")
            )
        }
    let roundSurvivors = try roundRows.compactMap { row -> RoundSurvivorPayload? in
        guard let terroristAlive = try optionalInteger(row, "t_alive_end"),
              let counterTerroristAlive = try optionalInteger(row, "ct_alive_end") else { return nil }
        return RoundSurvivorPayload(
            round: try integer(row, "round_number"), terroristAlive: terroristAlive,
            counterTerroristAlive: counterTerroristAlive
        )
    }
    let roundEconomy = try roundRows.compactMap { row -> RoundEconomyPayload? in
        guard let terroristValue = try optionalInteger(row, "t_equipment_value"),
              let counterTerroristValue = try optionalInteger(row, "ct_equipment_value"),
              let terroristPlayers = try optionalInteger(row, "t_player_count"),
              let counterTerroristPlayers = try optionalInteger(row, "ct_player_count"),
              let terroristTeamID = try? int64(row, "t_match_team_id"),
              let counterTerroristTeamID = try? int64(row, "ct_match_team_id"),
              let terroristTeamIndex = teamSlotByID[terroristTeamID],
              let counterTerroristTeamIndex = teamSlotByID[counterTerroristTeamID] else { return nil }
        return RoundEconomyPayload(
            round: try integer(row, "round_number"),
            terroristEquipmentValue: terroristValue,
            counterTerroristEquipmentValue: counterTerroristValue,
            terroristPlayers: terroristPlayers,
            counterTerroristPlayers: counterTerroristPlayers,
            pistolRound: try row.decode(column: "pistol_round", as: Bool.self),
            terroristTeamIndex: terroristTeamIndex,
            counterTerroristTeamIndex: counterTerroristTeamIndex
        )
    }
    let deathRows = try await sql.raw("""
        SELECT e.*, r.round_number FROM death_events e
        JOIN match_rounds r ON r.id = e.match_round_id
        WHERE e.match_id = \(bind: matchID) ORDER BY r.round_number, e.event_sequence
        """).all()
    let deathEvents = try deathRows.map { row in
            let killerID: Int64?
            if (try? row.decodeNil(column: "killer_match_player_id")) == true {
                killerID = nil
            } else {
                killerID = try int64(row, "killer_match_player_id")
            }
            return DeathEventPayload(
                round: try integer(row, "round_number"), sequence: try integer(row, "event_sequence"),
                tick: try int64(row, "event_tick"), elapsedMilliseconds: try integer(row, "elapsed_ms"),
                killerPlayerIndex: killerID.flatMap { internalToSlot[$0] },
                victimPlayerIndex: internalToSlot[try int64(row, "victim_match_player_id")]!,
                killerSide: (try optionalString(row, "killer_side")).flatMap { PlayerSide(rawValue: $0) },
                victimSide: try playerSide(row, "victim_side"),
                weapon: try row.decode(column: "weapon", as: String.self),
                enemyKill: try row.decode(column: "enemy_kill", as: Bool.self),
                flags: try integer(row, "context_flags"),
                terroristAliveBefore: try integer(row, "t_alive_before"),
                counterTerroristAliveBefore: try integer(row, "ct_alive_before"),
                sincePlantMilliseconds: try optionalInteger(row, "since_plant_ms")
            )
        }

    let rulesJSON = try match.decode(column: "rules_json", as: String.self)
    let rules = try JSONDecoder().decode(ParserRules.self, from: Data(rulesJSON.utf8))
    let teams = try teamRows.map { row in
        let internalID = try int64(row, "id")
        return TeamPayload(
            id: try row.decode(column: "source_team_id", as: String.self),
            name: try row.decode(column: "display_name", as: String.self),
            score: try optionalInteger(row, "score"),
            sideScores: SideScores(
                terrorist: try integer(row, "t_round_wins"),
                counterTerrorist: try integer(row, "ct_round_wins")
            ),
            players: teamMembers[internalID] ?? []
        )
    }
    let storedProvider = try optionalString(match, "provider")
    let storedProviderID = try optionalString(match, "provider_match_id")
    return MatchPayload(
        schema: try match.decode(column: "payload_schema", as: String.self),
        nickstatsBuild: try match.decode(column: "nickstats_build", as: String.self),
        parser: ParserMetadata(
            name: try match.decode(column: "parser_name", as: String.self),
            version: try match.decode(column: "parser_version", as: String.self)
        ),
        id: MatchIdentity(
            faceit: storedProvider == "faceit" ? storedProviderID : nil,
            sha256: try match.decode(column: "sha256", as: String.self)
        ),
        map: try match.decode(column: "map_name", as: String.self),
        playedAt: unix(try optionalDate(match, "played_at")),
        playedAtSource: try optionalString(match, "played_at_source"),
        rounds: try integer(match, "rounds"), roundTiming: roundTiming,
        roundSurvivors: roundSurvivors.isEmpty ? nil : roundSurvivors,
        roundEconomy: roundEconomy.isEmpty ? nil : roundEconomy, deathEvents: deathEvents,
        rules: rules, teams: teams, players: players
    )
}

private func emptySide() -> SideStatsPayload {
    SideStatsPayload(
        rounds: RoundRecord(played: 0, won: 0),
        combat: CombatStats(kills: 0, deaths: 0, assists: 0, headshots: 0, damage: 0),
        kastRounds: 0, opening: OpeningStats(kills: 0, deaths: 0), tradeKills: 0,
        tradeDeaths: TradeDeathStats(tradeable: 0, attempted: 0, traded: 0),
        utility: UtilityDamage(highExplosive: 0, fire: 0),
        damageReceived: 0,
        utilityThrown: .zero,
        objectives: .zero,
        speed: SpeedStats(kills: emptySpeedSummary(), deaths: emptySpeedSummary()),
        clutches: ClutchWins.zero,
        clutchAttempts: ClutchWins.zero,
        killRounds: KillRoundCounts(oneKill: 0, twoKills: 0, threeKills: 0, fourKills: 0, fiveKills: 0),
        weapons: [],
        duels: [], trades: [], contexts: [], assistedBy: [], flashes: []
    )
}

private func emptySpeedSummary() -> SpeedSummary {
    SpeedSummary(
        total: 0, samples: 0, maximum: nil,
        percentOfMaximumTotal: 0, percentOfMaximumSamples: 0, percentOfMaximumPeak: nil
    )
}

private func decodeSide(_ row: any SQLRow) throws -> SideStatsPayload {
    SideStatsPayload(
        rounds: RoundRecord(
            played: try integer(row, "rounds_played"), won: try integer(row, "rounds_won")
        ),
        combat: CombatStats(
            kills: try integer(row, "kills"), deaths: try integer(row, "deaths"),
            assists: try integer(row, "assists"), headshots: try integer(row, "headshots"),
            damage: try integer(row, "damage")
        ),
        kastRounds: try integer(row, "kast_rounds"),
        opening: OpeningStats(
            kills: try integer(row, "opening_kills"), deaths: try integer(row, "opening_deaths"),
            assistedKills: try integer(row, "opening_assisted_kills"),
            damageAssistedKills: try integer(row, "opening_damage_assisted_kills"),
            flashAssistedKills: try integer(row, "opening_flash_assisted_kills"),
            tradedDeaths: try integer(row, "opening_traded_deaths"),
            tradeKills: try integer(row, "opening_trade_kills"),
            assists: try integer(row, "opening_assists"),
            damageAssists: try integer(row, "opening_damage_assists"),
            flashAssists: try integer(row, "opening_flash_assists"),
            blindedEnemyKills: try integer(row, "opening_blinded_enemy_kills"),
            blindKills: try integer(row, "opening_blind_kills"),
            deathsWhileBlind: try integer(row, "opening_deaths_while_blind"),
            deathsToBlindKiller: try integer(row, "opening_deaths_to_blind_killer"),
            enemyAssistedDeaths: try integer(row, "opening_enemy_assisted_deaths"),
            enemyDamageAssistedDeaths: try integer(row, "opening_enemy_damage_assisted_deaths"),
            enemyFlashAssistedDeaths: try integer(row, "opening_enemy_flash_assisted_deaths"),
            ownFlashKills: try integer(row, "opening_own_flash_kills"),
            victimSideFlashKills: try integer(row, "opening_victim_side_flash_kills"),
            blindSourceUnknownKills: try integer(row, "opening_blind_source_unknown_kills"),
            deathsToKillerFlash: try integer(row, "opening_deaths_to_killer_flash"),
            deathsToOwnSideFlash: try integer(row, "opening_deaths_to_own_side_flash"),
            deathsBlindSourceUnknown: try integer(row, "opening_deaths_blind_source_unknown")
        ),
        tradeKills: try integer(row, "trade_kills"),
        tradeDeaths: TradeDeathStats(
            tradeable: try integer(row, "tradeable_deaths"),
            attempted: try integer(row, "attempted_tradeable_deaths"),
            traded: try integer(row, "traded_deaths")
        ),
        utility: UtilityDamage(
            highExplosive: try integer(row, "he_damage"), fire: try integer(row, "fire_damage")
        ),
        damageReceived: try integer(row, "damage_received"),
        utilityThrown: UtilityThrown(
            highExplosive: try integer(row, "he_grenades_thrown"),
            flashbang: try integer(row, "flashbangs_thrown"),
            smoke: try integer(row, "smokes_thrown"),
            fire: try integer(row, "fire_grenades_thrown"),
            decoy: try integer(row, "decoys_thrown")
        ),
        objectives: ObjectiveStats(
            plants: try integer(row, "bomb_plants"), defuses: try integer(row, "bomb_defuses")
        ),
        speed: SpeedStats(
            kills: SpeedSummary(
                total: try double(row, "kill_speed_total"),
                samples: try integer(row, "kill_speed_samples"),
                maximum: try optionalDouble(row, "kill_speed_max"),
                percentOfMaximumTotal: try double(row, "kill_speed_percent_total"),
                percentOfMaximumSamples: try integer(row, "kill_speed_percent_samples"),
                percentOfMaximumPeak: try optionalDouble(row, "kill_speed_percent_max")
            ),
            deaths: SpeedSummary(
                total: try double(row, "death_speed_total"),
                samples: try integer(row, "death_speed_samples"),
                maximum: try optionalDouble(row, "death_speed_max"),
                percentOfMaximumTotal: try double(row, "death_speed_percent_total"),
                percentOfMaximumSamples: try integer(row, "death_speed_percent_samples"),
                percentOfMaximumPeak: try optionalDouble(row, "death_speed_percent_max")
            )
        ),
        clutches: ClutchWins(
            oneVersusOne: try integer(row, "clutch_1v1"),
            oneVersusTwo: try integer(row, "clutch_1v2"),
            oneVersusThree: try integer(row, "clutch_1v3"),
            oneVersusFour: try integer(row, "clutch_1v4"),
            oneVersusFive: try integer(row, "clutch_1v5")
        ),
        clutchAttempts: ClutchWins(
            oneVersusOne: try integer(row, "clutch_attempt_1v1"),
            oneVersusTwo: try integer(row, "clutch_attempt_1v2"),
            oneVersusThree: try integer(row, "clutch_attempt_1v3"),
            oneVersusFour: try integer(row, "clutch_attempt_1v4"),
            oneVersusFive: try integer(row, "clutch_attempt_1v5")
        ),
        killRounds: KillRoundCounts(
            oneKill: try integer(row, "kill_rounds_1k"),
            twoKills: try integer(row, "kill_rounds_2k"),
            threeKills: try integer(row, "kill_rounds_3k"),
            fourKills: try integer(row, "kill_rounds_4k"),
            fiveKills: try integer(row, "kill_rounds_5k")
        ),
        trueKillRounds: KillRoundCounts(
            oneKill: try integer(row, "true_kill_rounds_1k"),
            twoKills: try integer(row, "true_kill_rounds_2k"),
            threeKills: try integer(row, "true_kill_rounds_3k"),
            fourKills: try integer(row, "true_kill_rounds_4k"),
            fiveKills: try integer(row, "true_kill_rounds_5k")
        ),
        trueMultikillRounds: try integer(row, "true_multikill_rounds"),
        weapons: [], duels: [], trades: [], contexts: [], assistedBy: [], flashes: []
    )
}

private func attachWeapons(
    _ sql: any SQLDatabase, matchID: Int64, players: inout [PlayerPayload], slots: [Int64: Int]
) async throws {
    let rows = try await sql.raw("""
        SELECT w.* FROM weapon_side_stats w JOIN match_players mp ON mp.id = w.match_player_id
        WHERE mp.match_id = \(bind: matchID) ORDER BY mp.player_slot, w.side, w.weapon
        """).all()
    for row in rows {
        let slot = slots[try int64(row, "match_player_id")]!
        let side = try playerSide(row, "side")
        players[slot].sides[side].weapons.append(WeaponPayload(
            weapon: try row.decode(column: "weapon", as: String.self),
            kills: try integer(row, "kills"), shots: try integer(row, "shots"), hits: try integer(row, "hits"),
            damage: try integer(row, "damage"), roundsUsed: try integer(row, "rounds_used")
        ))
    }
}

private func attachRelations(
    _ sql: any SQLDatabase, matchID: Int64, players: inout [PlayerPayload], slots: [Int64: Int]
) async throws {
    let duels = try await sql.raw("SELECT * FROM duel_side_stats WHERE match_id = \(bind: matchID)").all()
    for row in duels {
        let actor = slots[try int64(row, "killer_match_player_id")]!
        let target = slots[try int64(row, "victim_match_player_id")]!
        let side = try playerSide(row, "killer_side")
        players[actor].sides[side].duels.append(DuelStats(
            opponentPlayerIndex: target, kills: try integer(row, "kills")
        ))
    }
    let trades = try await sql.raw("SELECT * FROM trade_side_stats WHERE match_id = \(bind: matchID)").all()
    for row in trades {
        let actor = slots[try int64(row, "trader_match_player_id")]!
        let target = slots[try int64(row, "teammate_match_player_id")]!
        let side = try playerSide(row, "trader_side")
        players[actor].sides[side].trades.append(TradeStats(
            teammatePlayerIndex: target,
            opportunities: try integer(row, "opportunities"),
            attempts: try integer(row, "attempts"),
            successes: try integer(row, "successes"),
            openingSuccesses: try integer(row, "opening_successes")
        ))
    }
    let contexts = try await sql.raw("SELECT * FROM kill_context_side_stats WHERE match_id = \(bind: matchID)").all()
    for row in contexts {
        let actor = slots[try int64(row, "killer_match_player_id")]!
        let target = slots[try int64(row, "victim_match_player_id")]!
        let side = try playerSide(row, "killer_side")
        players[actor].sides[side].contexts.append(KillContextStats(
            victimPlayerIndex: target,
            victimBlindedKills: try integer(row, "victim_blinded_kills"),
            attackerBlindKills: try integer(row, "attacker_blind_kills"),
            wallbangKills: try integer(row, "wallbang_kills"),
            penetrationTotal: try integer(row, "penetration_total"),
            smokeKills: try integer(row, "smoke_kills"),
            airborneKills: try integer(row, "airborne_kills"),
            movingKills: try integer(row, "moving_kills"),
            stillKills: try integer(row, "still_kills"),
            runningKills: try integer(row, "running_kills"),
            victimGrenadeOutKills: try integer(row, "victim_grenade_out_kills"),
            victimKnifeOutKills: try integer(row, "victim_knife_out_kills"),
            equipmentDisadvantageKills: try integer(row, "equipment_disadvantage_kills"),
            unfairKills: try integer(row, "unfair_kills")
        ))
    }
    let assists = try await sql.raw("SELECT * FROM assisted_kill_side_stats WHERE match_id = \(bind: matchID)").all()
    for row in assists {
        let actor = slots[try int64(row, "beneficiary_match_player_id")]!
        let target = slots[try int64(row, "assister_match_player_id")]!
        let side = try playerSide(row, "beneficiary_side")
        players[actor].sides[side].assistedBy.append(AssistedKillStats(
            assisterPlayerIndex: target,
            damageAssistedKills: try integer(row, "damage_assisted_kills"),
            teammateFlashAssistedKills: try integer(row, "teammate_flash_assisted_kills"),
            ownFlashKills: try integer(row, "own_flash_kills"),
            openingAssists: try integer(row, "opening_assists"),
            openingDamageAssists: try integer(row, "opening_damage_assists"),
            openingFlashAssists: try integer(row, "opening_flash_assists")
        ))
    }
    let flashes = try await sql.raw("SELECT * FROM flash_side_stats WHERE match_id = \(bind: matchID)").all()
    for row in flashes {
        let actor = slots[try int64(row, "thrower_match_player_id")]!
        let target = slots[try int64(row, "victim_match_player_id")]!
        let side = try playerSide(row, "thrower_side")
        players[actor].sides[side].flashes.append(FlashStats(
            victimPlayerIndex: target,
            effects: try integer(row, "flash_effects"),
            blindDurationMilliseconds: try integer(row, "blind_duration_ms")
        ))
    }
}
