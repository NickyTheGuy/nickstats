import Fluent
import SQLKit
import Vapor

struct TradeTeammatesRequest: Content, Sendable {
    var matchIDs: [Int64]
    var side: String

    enum CodingKeys: String, CodingKey { case matchIDs = "match_ids", side }

    func validate() throws {
        guard matchIDs.count <= 20_000, matchIDs.allSatisfy({ $0 > 0 }), ["ALL", "T", "CT"].contains(side) else {
            throw Abort(.badRequest, reason: "Choose up to 20,000 valid matches and an All, T or CT side.")
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
    let side: SQLQueryString = selection.side == "ALL" ? "" : " AND t.trader_side = \(bind: selection.side)"
    // Both directions use existing indexes. Aggregate in SQL, never download
    // full matches or the per-match relationship ledger into the browser.
    func rows(incoming: Bool) async throws -> [TradeTeammateRow] {
        let ownColumn = incoming ? "teammate_match_player_id" : "trader_match_player_id"
        let otherColumn = incoming ? "trader_match_player_id" : "teammate_match_player_id"
        let result = try await sql.raw("""
            SELECT CAST(other.player_id AS SIGNED) AS player_id,
                   COALESCE(p.current_name, other.display_name) AS name,
                   CAST(SUM(t.opportunities) AS SIGNED) AS opportunities,
                   CAST(SUM(t.attempts) AS SIGNED) AS attempts,
                   CAST(SUM(t.successes) AS SIGNED) AS trades
            FROM match_players own
            JOIN trade_side_stats t ON t.\(unsafeRaw: ownColumn) = own.id
            JOIN match_players other ON other.id = t.\(unsafeRaw: otherColumn)
            LEFT JOIN players p ON p.id = other.player_id
            WHERE own.player_id = \(bind: playerID) AND t.match_id IN (\(binds: ids)) \(side)
            GROUP BY other.player_id, COALESCE(p.current_name, other.display_name)
            HAVING SUM(t.opportunities) > 0
            ORDER BY trades DESC, opportunities DESC, name ASC
            """).all()
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
