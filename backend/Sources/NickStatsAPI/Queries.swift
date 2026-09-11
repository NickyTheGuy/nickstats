import Fluent
import Foundation
import SQLKit
import Vapor

struct MatchQuery: Content {
    var steamID: String?
    var map: String?
    var maps: String?
    var dateFrom: String?
    var dateTo: String?
    var limit: Int?
    var offset: Int?

    enum CodingKeys: String, CodingKey {
        case map, maps, limit, offset
        case steamID = "steam_id"
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
    let maps = (filters.maps ?? filters.map ?? "").split(separator: ",")
        .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
        .filter { !$0.isEmpty }
    let mapList = maps.joined(separator: ",")
    let from = try parseDate(filters.dateFrom, name: "from")
    let to = try parseDate(filters.dateTo, name: "to")

    let rows = try await sql.raw("""
        SELECT DISTINCT
          m.id, m.provider, m.provider_match_id, LOWER(HEX(m.demo_sha256)) AS sha256,
          m.map_name, m.played_at, m.rounds, m.nickstats_build
        FROM matches m
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
        let teamRows = try await sql.raw("""
            SELECT display_name, score FROM match_teams
            WHERE match_id = \(bind: matchID) ORDER BY team_slot
            """).all()
        matches.append(MatchSummary(
            id: matchID,
            provider: try optionalString(row, "provider"),
            providerMatchID: try optionalString(row, "provider_match_id"),
            sha256: try row.decode(column: "sha256", as: String.self),
            map: try row.decode(column: "map_name", as: String.self),
            playedAt: unix(try optionalDate(row, "played_at")),
            rounds: try integer(row, "rounds"),
            nickstatsBuild: try row.decode(column: "nickstats_build", as: String.self),
            teams: try teamRows.map { TeamSummary(
                name: try $0.decode(column: "display_name", as: String.self),
                score: try optionalInteger($0, "score")
            ) }
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

private func comparisonSideData(
    playerID: Int64, sql: any SQLDatabase
) async throws -> [Int64: [ComparisonSideStats]] {
    let rows = try await sql.raw("""
        SELECT mp.match_id, s.*
        FROM match_players mp
        JOIN player_side_stats s ON s.match_player_id = mp.id
        WHERE mp.player_id = \(bind: playerID)
        """).all()
    var values: [String: ComparisonSideAccumulator] = [:]
    func storageKey(_ matchID: Int64, _ side: PlayerSide) -> String { "\(matchID):\(side.rawValue)" }
    func add(_ matchID: Int64, _ side: PlayerSide, _ name: String, _ amount: Double) {
        let key = storageKey(matchID, side)
        guard var value = values[key] else { return }
        value.stats[name, default: 0] += amount
        values[key] = value
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
            ("kill_rounds_5k", "kill_rounds_5k")
        ]
        for (column, name) in integerColumns { add(matchID, side, name, Double(try integer(row, column))) }
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

    let trades = try await sql.raw("""
        SELECT t.match_id, t.trader_side AS side,
               CAST(SUM(t.opportunities) AS SIGNED) AS opportunities,
               CAST(SUM(t.attempts) AS SIGNED) AS attempts,
               CAST(SUM(t.successes) AS SIGNED) AS successes
        FROM trade_side_stats t JOIN match_players mp ON mp.id = t.trader_match_player_id
        WHERE mp.player_id = \(bind: playerID) GROUP BY t.match_id, t.trader_side
        """).all()
    for row in trades {
        let id = try int64(row, "match_id"), side = try playerSide(row, "side")
        add(id, side, "trade_opportunities", Double(try integer(row, "opportunities")))
        add(id, side, "trade_attempts", Double(try integer(row, "attempts")))
        add(id, side, "trade_successes", Double(try integer(row, "successes")))
    }

    let flashes = try await sql.raw("""
        SELECT f.match_id, f.thrower_side AS side,
               CAST(SUM(f.flash_effects) AS SIGNED) AS effects,
               CAST(SUM(f.blind_duration_ms) AS SIGNED) AS duration
        FROM flash_side_stats f
        JOIN match_players mp ON mp.id = f.thrower_match_player_id
        JOIN match_players victim ON victim.id = f.victim_match_player_id
        WHERE mp.player_id = \(bind: playerID) AND victim.match_team_id <> mp.match_team_id
        GROUP BY f.match_id, f.thrower_side
        """).all()
    for row in flashes {
        let id = try int64(row, "match_id"), side = try playerSide(row, "side")
        add(id, side, "enemies_flashed", Double(try integer(row, "effects")))
        add(id, side, "blind_duration_ms", Double(try integer(row, "duration")))
    }

    let beneficiaries = try await sql.raw("""
        SELECT a.match_id, a.beneficiary_side AS side,
               CAST(SUM(a.damage_assisted_kills) AS SIGNED) AS damage_assists,
               CAST(SUM(a.teammate_flash_assisted_kills) AS SIGNED) AS teammate_flash_assists,
               CAST(SUM(a.own_flash_kills) AS SIGNED) AS own_flash
        FROM assisted_kill_side_stats a
        JOIN match_players mp ON mp.id = a.beneficiary_match_player_id
        WHERE mp.player_id = \(bind: playerID) GROUP BY a.match_id, a.beneficiary_side
        """).all()
    for row in beneficiaries {
        let id = try int64(row, "match_id"), side = try playerSide(row, "side")
        add(id, side, "damage_assisted_kills", Double(try integer(row, "damage_assists")))
        add(id, side, "teammate_flash_assisted_kills", Double(try integer(row, "teammate_flash_assists")))
        add(id, side, "own_flash_kills", Double(try integer(row, "own_flash")))
    }

    let assisters = try await sql.raw("""
        SELECT a.match_id, a.beneficiary_side AS side,
               CAST(SUM(a.teammate_flash_assisted_kills) AS SIGNED) AS flash_assists
        FROM assisted_kill_side_stats a
        JOIN match_players mp ON mp.id = a.assister_match_player_id
        WHERE mp.player_id = \(bind: playerID) GROUP BY a.match_id, a.beneficiary_side
        """).all()
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
    let contexts = try await sql.raw("""
        SELECT c.* FROM kill_context_side_stats c
        JOIN match_players mp ON mp.id = c.killer_match_player_id
        WHERE mp.player_id = \(bind: playerID)
        """).all()
    for row in contexts {
        let id = try int64(row, "match_id"), side = try playerSide(row, "killer_side")
        for (column, outgoing, _) in contextColumns { add(id, side, outgoing, Double(try integer(row, column))) }
    }
    let incomingContexts = try await sql.raw("""
        SELECT c.*, CASE WHEN killer.match_team_id = victim.match_team_id THEN c.killer_side
                         WHEN c.killer_side = 'T' THEN 'CT' ELSE 'T' END AS victim_side
        FROM kill_context_side_stats c
        JOIN match_players victim ON victim.id = c.victim_match_player_id
        JOIN match_players killer ON killer.id = c.killer_match_player_id
        WHERE victim.player_id = \(bind: playerID)
        """).all()
    for row in incomingContexts {
        let id = try int64(row, "match_id"), side = try playerSide(row, "victim_side")
        for (column, _, incoming) in contextColumns { add(id, side, incoming, Double(try integer(row, column))) }
    }

    let weapons = try await sql.raw("""
        SELECT mp.match_id, w.side, w.weapon,
               CAST(SUM(w.kills) AS SIGNED) AS kills, CAST(SUM(w.shots) AS SIGNED) AS shots,
               CAST(SUM(w.hits) AS SIGNED) AS hits, CAST(SUM(w.damage) AS SIGNED) AS damage,
               CAST(SUM(w.rounds_used) AS SIGNED) AS rounds_used
        FROM weapon_side_stats w JOIN match_players mp ON mp.id = w.match_player_id
        WHERE mp.player_id = \(bind: playerID)
        GROUP BY mp.match_id, w.side, w.weapon
        """).all()
    for row in weapons {
        let id = try int64(row, "match_id"), side = try playerSide(row, "side")
        let key = storageKey(id, side)
        guard var value = values[key] else { continue }
        value.weapons.append(ComparisonWeaponStats(
            weapon: try row.decode(column: "weapon", as: String.self),
            kills: try integer(row, "kills"), shots: try integer(row, "shots"), hits: try integer(row, "hits"),
            damage: try integer(row, "damage"), roundsUsed: try integer(row, "rounds_used")
        ))
        values[key] = value
    }

    var result: [Int64: [ComparisonSideStats]] = [:]
    for row in rows {
        let matchID = try int64(row, "match_id"), side = try playerSide(row, "side")
        guard let value = values[storageKey(matchID, side)] else { continue }
        result[matchID, default: []].append(ComparisonSideStats(side: side, stats: value.stats, weapons: value.weapons))
    }
    for matchID in Array(result.keys) { result[matchID]?.sort { $0.side.rawValue < $1.side.rawValue } }
    return result
}

private func comparisonMatches(playerID: Int64, sql: any SQLDatabase) async throws -> [ComparisonMatch] {
    let sideData = try await comparisonSideData(playerID: playerID, sql: sql)
    let rows = try await sql.raw("""
            SELECT m.id, m.played_at, m.map_name,
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
            WHERE mp.player_id = \(bind: playerID)
            GROUP BY m.id, m.played_at, m.map_name, mp.id, mp.match_team_id,
                     own_team.score, other_team.score
            ORDER BY m.played_at IS NULL, m.played_at DESC, m.id DESC
            """).all()
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
                id: matchID, playedAt: unix(try optionalDate(row, "played_at")),
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
        SELECT CAST(COALESCE(SUM(f.flash_effects), 0) AS SIGNED) AS enemies_flashed,
               CAST(COALESCE(SUM(f.blind_duration_ms), 0) AS SIGNED) AS blind_duration_ms
        FROM match_players mp
        JOIN flash_side_stats f ON f.thrower_match_player_id = mp.id
        JOIN match_players victim ON victim.id = f.victim_match_player_id
        WHERE mp.player_id = \(bind: playerID) AND victim.match_team_id <> mp.match_team_id
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
        openings: PlayerOpeningProfileStats(kills: totals.openingKills, deaths: totals.openingDeaths),
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
        rounds: try integer(match, "rounds"), rules: rules, teams: teams, players: players
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
            kills: try integer(row, "opening_kills"), deaths: try integer(row, "opening_deaths")
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
            successes: try integer(row, "successes")
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
            ownFlashKills: try integer(row, "own_flash_kills")
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
