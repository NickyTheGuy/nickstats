import Fluent
import Foundation
import SQLKit
import Vapor

struct MatchQuery: Content {
    var steamID: String?
    var map: String?
    var dateFrom: String?
    var dateTo: String?
    var limit: Int?
    var offset: Int?

    enum CodingKeys: String, CodingKey {
        case map, limit, offset
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
    let map = filters.map ?? ""
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
          AND (\(bind: map.isEmpty) OR m.map_name = \(bind: map))
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
    return MatchListResponse(matches: matches, limit: limit, offset: offset)
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
    var kastRounds = 0
    var openingKills = 0
    var openingDeaths = 0
    var tradeKills = 0
    var tradeableDeaths = 0
    var attemptedTradeableDeaths = 0
    var tradedDeaths = 0
    var highExplosiveDamage = 0
    var fireDamage = 0

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
        kastRounds += other.kastRounds
        openingKills += other.openingKills
        openingDeaths += other.openingDeaths
        tradeKills += other.tradeKills
        tradeableDeaths += other.tradeableDeaths
        attemptedTradeableDeaths += other.attemptedTradeableDeaths
        tradedDeaths += other.tradedDeaths
        highExplosiveDamage += other.highExplosiveDamage
        fireDamage += other.fireDamage
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

    let matchRows = try await sql.raw("""
        SELECT m.id, m.map_name, own_team.score AS own_score, other_team.score AS other_score,
               CAST(SUM(s.rounds_played) AS SIGNED) AS rounds_played,
               CAST(SUM(s.rounds_won) AS SIGNED) AS rounds_won,
               CAST(SUM(s.kills) AS SIGNED) AS kills,
               CAST(SUM(s.deaths) AS SIGNED) AS deaths,
               CAST(SUM(s.assists) AS SIGNED) AS assists,
               CAST(SUM(s.headshots) AS SIGNED) AS headshots,
               CAST(SUM(s.damage) AS SIGNED) AS damage,
               CAST(SUM(s.kast_rounds) AS SIGNED) AS kast_rounds,
               CAST(SUM(s.opening_kills) AS SIGNED) AS opening_kills,
               CAST(SUM(s.opening_deaths) AS SIGNED) AS opening_deaths,
               CAST(SUM(s.trade_kills) AS SIGNED) AS trade_kills,
               CAST(SUM(s.tradeable_deaths) AS SIGNED) AS tradeable_deaths,
               CAST(SUM(s.attempted_tradeable_deaths) AS SIGNED) AS attempted_tradeable_deaths,
               CAST(SUM(s.traded_deaths) AS SIGNED) AS traded_deaths,
               CAST(SUM(s.he_damage) AS SIGNED) AS he_damage,
               CAST(SUM(s.fire_damage) AS SIGNED) AS fire_damage
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
        match.kastRounds = try integer(row, "kast_rounds")
        match.openingKills = try integer(row, "opening_kills")
        match.openingDeaths = try integer(row, "opening_deaths")
        match.tradeKills = try integer(row, "trade_kills")
        match.tradeableDeaths = try integer(row, "tradeable_deaths")
        match.attemptedTradeableDeaths = try integer(row, "attempted_tradeable_deaths")
        match.tradedDeaths = try integer(row, "traded_deaths")
        match.highExplosiveDamage = try integer(row, "he_damage")
        match.fireDamage = try integer(row, "fire_damage")
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
            damage: totals.damage, kastRounds: totals.kastRounds
        ),
        utility: PlayerUtilityStats(
            highExplosiveDamage: totals.highExplosiveDamage,
            fireDamage: totals.fireDamage,
            enemiesFlashed: try integer(flashRow, "enemies_flashed"),
            blindDurationSeconds: Double(try integer(flashRow, "blind_duration_ms")) / 1000,
            flashAssists: try integer(assistRow, "flash_assists")
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
                kills: try integer(row, "kills"), shots: try integer(row, "shots"),
                damage: try integer(row, "damage"), roundsUsed: try integer(row, "rounds_used")
            )
        },
        maps: maps
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
        speed: SpeedStats(kills: emptySpeedSummary(), deaths: emptySpeedSummary()),
        clutches: ClutchWins(oneVersusOne: 0, oneVersusTwo: 0, oneVersusThree: 0, oneVersusFour: 0, oneVersusFive: 0),
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
            kills: try integer(row, "kills"), shots: try integer(row, "shots"),
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
