import Fluent
import Foundation
import SQLKit
import Vapor

let faceitDateSyncSchema = "nickstats.faceit-dates/1"

struct FaceitDateMetadata: Content, Sendable {
    var faceitMatchID: String
    var playedAt: Int64
    var displayedAt: String?

    enum CodingKeys: String, CodingKey {
        case faceitMatchID = "faceit_match_id"
        case playedAt = "played_at"
        case displayedAt = "displayed_at"
    }
}

struct FaceitDateSyncPayload: Content, Sendable {
    var schema: String
    var timezone: String?
    var matches: [FaceitDateMetadata]
}

struct FaceitDateSyncResponse: Content, Sendable {
    var received: Int
    var updated: Int
    var unchanged: Int
    var notFound: Int
    var notFoundIDs: [String]

    enum CodingKeys: String, CodingKey {
        case received, updated, unchanged
        case notFound = "not_found"
        case notFoundIDs = "not_found_ids"
    }
}

extension FaceitDateSyncPayload {
    func validate(now: Date = Date()) throws {
        guard schema == faceitDateSyncSchema else {
            try invalid("$.schema", "Only \(faceitDateSyncSchema) is supported.")
        }
        guard !matches.isEmpty, matches.count <= 100 else {
            try invalid("$.matches", "Expected 1 through 100 matches.")
        }
        if let timezone {
            try validateText(timezone, path: "$.timezone", maximum: 64)
        }

        let earliestTimestamp: Int64 = 1_325_376_000 // 2012-01-01 UTC
        let latestTimestamp = Int64(now.timeIntervalSince1970) + 86_400
        var identifiers = Set<String>()
        for (index, match) in matches.enumerated() {
            let path = "$.matches[\(index)]"
            guard match.faceitMatchID.hasPrefix("1-"),
                  UUID(uuidString: String(match.faceitMatchID.dropFirst(2))) != nil else {
                try invalid("\(path).faceit_match_id", "Expected a FACEIT match-room ID in 1-UUID form.")
            }
            guard identifiers.insert(match.faceitMatchID.lowercased()).inserted else {
                try invalid("\(path).faceit_match_id", "Duplicate FACEIT match ID.")
            }
            guard (earliestTimestamp...latestTimestamp).contains(match.playedAt) else {
                try invalid("\(path).played_at", "Expected a plausible Unix timestamp no later than one day in the future.")
            }
            if let displayedAt = match.displayedAt {
                try validateText(displayedAt, path: "\(path).displayed_at", maximum: 64)
            }
        }
    }
}

func syncFaceitDates(
    _ payload: FaceitDateSyncPayload,
    on database: any Database
) async throws -> FaceitDateSyncResponse {
    guard let sql = database as? any SQLDatabase else { throw Abort(.internalServerError) }
    var updated = 0
    var unchanged = 0
    var notFoundIDs: [String] = []
    var affectedPlayerIDs = Set<Int64>()

    for metadata in payload.matches {
        guard let row = try await sql.raw("""
            SELECT id, played_at, played_at_source
            FROM matches
            WHERE provider = 'faceit' AND provider_match_id = \(bind: metadata.faceitMatchID)
            FOR UPDATE
            """).first() else {
            notFoundIDs.append(metadata.faceitMatchID)
            continue
        }

        let matchID = try decodeSignedID(row, column: "id")
        let existingDate = try row.decode(column: "played_at", as: Date?.self)
        let existingSource = try row.decode(column: "played_at_source", as: String?.self)
        let incomingDate = Date(timeIntervalSince1970: TimeInterval(metadata.playedAt))
        let sameSecond = existingDate.map { Int64($0.timeIntervalSince1970) == metadata.playedAt } ?? false

        // A future exact match-page source should remain stronger than a history-page inference.
        if existingSource == "faceit_match_page" || (sameSecond && existingSource == "faceit_history") {
            unchanged += 1
            continue
        }

        try await sql.raw("""
            UPDATE matches
            SET played_at = \(bind: incomingDate), played_at_source = 'faceit_history'
            WHERE id = \(bind: matchID)
            """).run()
        updated += 1

        let playerRows = try await sql.raw("""
            SELECT player_id FROM match_players WHERE match_id = \(bind: matchID) AND player_id IS NOT NULL
            """).all()
        for playerRow in playerRows {
            affectedPlayerIDs.insert(try decodeSignedID(playerRow, column: "player_id"))
        }
    }

    for playerID in affectedPlayerIDs {
        try await sql.raw("""
            UPDATE players SET
              first_seen_at = (
                SELECT MIN(m.played_at)
                FROM match_players mp JOIN matches m ON m.id = mp.match_id
                WHERE mp.player_id = \(bind: playerID)
              ),
              last_seen_at = (
                SELECT MAX(m.played_at)
                FROM match_players mp JOIN matches m ON m.id = mp.match_id
                WHERE mp.player_id = \(bind: playerID)
              )
            WHERE id = \(bind: playerID)
            """).run()
    }

    return FaceitDateSyncResponse(
        received: payload.matches.count,
        updated: updated,
        unchanged: unchanged,
        notFound: notFoundIDs.count,
        notFoundIDs: notFoundIDs
    )
}

private func decodeSignedID(_ row: any SQLRow, column: String) throws -> Int64 {
    if let value = try? row.decode(column: column, as: Int64.self) { return value }
    return Int64(try row.decode(column: column, as: UInt64.self))
}
