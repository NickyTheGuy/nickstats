import Fluent
import SQLKit
import Vapor

struct TradeTeammatesRequest: Content, Sendable {
    var matchIDs: [Int64]
    var side: String
    var buy: String? = nil
    var opponentBuy: String? = nil
    var roundResult: String? = nil
    var roundPhase: String? = nil
    var roundCondition: String? = nil

    var usesRounds: Bool {
        [buy, opponentBuy, roundResult, roundPhase, roundCondition].contains { ($0 ?? "ALL") != "ALL" }
    }

    enum CodingKeys: String, CodingKey {
        case matchIDs = "match_ids", side, buy
        case opponentBuy = "opponent_buy", roundResult = "round_result", roundPhase = "round_phase", roundCondition = "round_condition"
    }

    func validate() throws {
        guard matchIDs.count <= 20_000, matchIDs.allSatisfy({ $0 > 0 }), ["ALL", "T", "CT"].contains(side) else {
            throw Abort(.badRequest, reason: "Choose up to 20,000 valid matches and an All, T or CT side.")
        }
        for (value, allowed) in [
            (buy, ["ALL", "pistol", "eco", "force", "full", "hero"]),
            (opponentBuy, ["ALL", "pistol", "eco", "force", "full"]),
            (roundResult, ["ALL", "win", "loss"]),
            (roundPhase, ["ALL", "REGULATION", "OVERTIME"]),
            (roundCondition, ["ALL", "opening_kill", "opening_death", "opening_attempt", "no_opening"])
        ] {
            guard allowed.contains(value ?? "ALL") else { throw Abort(.badRequest, reason: "Invalid teammate trade filter.") }
        }
    }
}

struct TradeTeammateRow: Content, Sendable {
    var id: Int64?
    var name: String
    var opportunities: Int
    var attempts: Int
    var trades: Int
}

struct TradeTeammatesResponse: Content, Sendable {
    var outgoing: [TradeTeammateRow]
    var incoming: [TradeTeammateRow]
}

func getTradeTeammates(_ playerID: Int64, selection: TradeTeammatesRequest, on database: any Database) async throws -> TradeTeammatesResponse {
    try selection.validate()
    guard !selection.matchIDs.isEmpty else { return TradeTeammatesResponse(outgoing: [], incoming: []) }
    guard let sql = database as? any SQLDatabase else { throw Abort(.internalServerError) }
    let ids = Array(Set(selection.matchIDs)).sorted()
    // Eligibility uses the player's complete history, independently of the
    // displayed match/round filters. Opponents never count as shared teammates.
    let recurring: SQLQueryString = """
        WITH recurring AS (
          SELECT other.player_id
          FROM match_players own
          JOIN match_players other ON other.match_id = own.match_id
            AND other.match_team_id = own.match_team_id AND other.player_id <> own.player_id
          WHERE own.player_id = \(bind: playerID)
          GROUP BY other.player_id HAVING COUNT(DISTINCT own.match_id) >= 5
        )
        """
    var filters: SQLQueryString = ""
    if selection.side != "ALL" { filters = "\(filters)  AND r.side = \(bind: selection.side)" }
    if let buy = selection.buy, buy != "ALL" {
        if buy == "hero" { filters = "\(filters)  AND JSON_EXTRACT(r.stats_json, '$.hero') = true" }
        else { filters = "\(filters)  AND r.buy_type = \(bind: buy)" }
    }
    if let buy = selection.opponentBuy, buy != "ALL" { filters = "\(filters)  AND r.opponent_buy_type = \(bind: buy)" }
    if let result = selection.roundResult, result != "ALL" { filters = "\(filters)  AND r.round_result = \(bind: result)" }
    if selection.roundPhase == "REGULATION" { filters = "\(filters)  AND r.round_number <= 24" }
    if selection.roundPhase == "OVERTIME" { filters = "\(filters)  AND r.round_number > 24" }
    if let condition = selection.roundCondition, condition != "ALL" {
        // Missing legacy opening data is unknown, never a no-attempt round.
        filters = """
          \(filters)
          AND JSON_EXTRACT(r.stats_json, '$.rounds[0]') = 1
          AND JSON_EXTRACT(r.stats_json, '$.opening[0]') IN (0,1)
          AND JSON_EXTRACT(r.stats_json, '$.opening[1]') IN (0,1)
          AND (JSON_EXTRACT(r.stats_json, '$.opening[0]') + JSON_EXTRACT(r.stats_json, '$.opening[1]')) <= 1
          """
        switch condition {
        case "opening_kill": filters = "\(filters)  AND JSON_EXTRACT(r.stats_json, '$.opening[0]') = 1"
        case "opening_death": filters = "\(filters)  AND JSON_EXTRACT(r.stats_json, '$.opening[1]') = 1"
        case "opening_attempt": filters = "\(filters)  AND (JSON_EXTRACT(r.stats_json, '$.opening[0]') + JSON_EXTRACT(r.stats_json, '$.opening[1]')) = 1"
        default: filters = "\(filters)  AND JSON_EXTRACT(r.stats_json, '$.opening[0]') = 0 AND JSON_EXTRACT(r.stats_json, '$.opening[1]') = 0"
        }
    }
    func rows(incoming: Bool) async throws -> [TradeTeammateRow] {
        let result: [any SQLRow]
        if selection.usesRounds {
            // Apply every filter to the selected player's round, in both
            // directions. Only extract compact trade counters in MySQL.
            let actorJoin: SQLQueryString = incoming ? """
                JOIN player_round_phase_stats actor ON actor.match_player_id = other.id AND actor.round_number = r.round_number
                """ : ""
            let actor = incoming ? "actor" : "r"
            let target = incoming ? "own" : "other"
            result = try await sql.raw("""
                \(recurring)
                SELECT CAST(other.player_id AS SIGNED) AS player_id,
                  COALESCE(p.current_name, other.display_name) AS name,
                  CAST(SUM(t.opportunities) AS SIGNED) AS opportunities,
                  CAST(SUM(t.attempts) AS SIGNED) AS attempts,
                  CAST(SUM(t.successes) AS SIGNED) AS trades
                FROM match_players own
                JOIN match_players other ON other.match_id = own.match_id AND other.match_team_id = own.match_team_id
                JOIN recurring eligible ON eligible.player_id = other.player_id
                JOIN player_round_phase_stats r ON r.match_player_id = own.id
                \(actorJoin)
                JOIN JSON_TABLE(\(unsafeRaw: actor).stats_json, '$.trades[*]' COLUMNS (
                  teammate_slot INT PATH '$[0]', opportunities INT PATH '$[1]',
                  attempts INT PATH '$[2]', successes INT PATH '$[3]'
                )) t ON t.teammate_slot = \(unsafeRaw: target).player_slot
                LEFT JOIN players p ON p.id = other.player_id
                WHERE own.player_id = \(bind: playerID) AND own.match_id IN (\(binds: ids)) \(filters)
                GROUP BY other.player_id, COALESCE(p.current_name, other.display_name)
                HAVING SUM(t.opportunities) > 0
                ORDER BY trades DESC, opportunities DESC, name ASC
                """).all()
        } else {
            let ownColumn = incoming ? "teammate_match_player_id" : "trader_match_player_id"
            let otherColumn = incoming ? "trader_match_player_id" : "teammate_match_player_id"
            let side: SQLQueryString = selection.side == "ALL" ? "" : " AND t.trader_side = \(bind: selection.side)"
            result = try await sql.raw("""
                \(recurring)
                SELECT CAST(other.player_id AS SIGNED) AS player_id,
                       COALESCE(p.current_name, other.display_name) AS name,
                       CAST(SUM(t.opportunities) AS SIGNED) AS opportunities,
                       CAST(SUM(t.attempts) AS SIGNED) AS attempts,
                       CAST(SUM(t.successes) AS SIGNED) AS trades
                FROM match_players own
                JOIN trade_side_stats t ON t.\(unsafeRaw: ownColumn) = own.id
                JOIN match_players other ON other.id = t.\(unsafeRaw: otherColumn)
                  AND other.match_team_id = own.match_team_id
                JOIN recurring eligible ON eligible.player_id = other.player_id
                LEFT JOIN players p ON p.id = other.player_id
                WHERE own.player_id = \(bind: playerID) AND t.match_id IN (\(binds: ids)) \(side)
                GROUP BY other.player_id, COALESCE(p.current_name, other.display_name)
                HAVING SUM(t.opportunities) > 0
                ORDER BY trades DESC, opportunities DESC, name ASC
                """).all()
        }
        return try result.map { row in
            TradeTeammateRow(
                id: try row.decode(column: "player_id", as: Int64?.self),
                name: try row.decode(column: "name", as: String.self),
                opportunities: try row.decode(column: "opportunities", as: Int.self),
                attempts: try row.decode(column: "attempts", as: Int.self),
                trades: try row.decode(column: "trades", as: Int.self)
            )
        }
    }
    let outgoing = try await rows(incoming: false)
    let incoming = try await rows(incoming: true)
    return TradeTeammatesResponse(outgoing: outgoing, incoming: incoming)
}
