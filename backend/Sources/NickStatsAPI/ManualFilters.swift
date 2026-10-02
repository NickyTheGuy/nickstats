import Fluent
import Foundation
import SQLKit
import Vapor

enum ManualMatchState: String, Content, Sendable {
    case trueValue = "true"
    case falseValue = "false"
    case unknown
}

enum ManualTagKind: String, Content, Sendable { case boolean, number }

struct ManualFilter: Content, Sendable {
    var id: String
    var name: String
    var cutoffMatchID: Int64
    var kind: ManualTagKind = .boolean
    var owner: String? = nil
    var sharedWith: [String] = []
    enum CodingKeys: String, CodingKey {
        case id, name, kind, owner
        case sharedWith = "shared_with"
        case cutoffMatchID = "cutoff_match_id"
    }
}

struct ManualFilterAssignment: Content, Sendable {
    var filterID: String
    var matchID: Int64
    var state: ManualMatchState
    var value: Double? = nil
    enum CodingKeys: String, CodingKey {
        case state, value
        case filterID = "filter_id"
        case matchID = "match_id"
    }
}

struct ManualFiltersResponse: Content, Sendable {
    var filters: [ManualFilter]
    var assignments: [ManualFilterAssignment]
    var supports_numeric: Bool = true
    var supports_sharing: Bool = true
}
struct ManualTagShareRequest: Content { var username: String }

struct ManualFilterNameRequest: Content { var name: String; var kind: ManualTagKind? }
struct ManualFilterStateRequest: Content { var state: ManualMatchState; var value: Double? }

func validatedManualFilterName(_ raw: String) throws -> String {
    let name = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !name.isEmpty, name.unicodeScalars.count <= 64,
          !name.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }) else {
        throw Abort(.badRequest, reason: "Use a tag name between 1 and 64 characters without control characters.")
    }
    return name
}

private func manualFilterSQL(_ database: any Database) throws -> any SQLDatabase {
    guard let sql = database as? any SQLDatabase else { throw Abort(.internalServerError) }
    return sql
}

private func requireManualFilterOwner(_ id: String, username: String, sql: any SQLDatabase) async throws {
    guard try await sql.raw("SELECT id FROM account_manual_filters WHERE id = \(bind: id) AND username = \(bind: username) FOR UPDATE").first() != nil else {
        throw Abort(.notFound, reason: "Tag not found.")
    }
}

func getManualFilters(username: String, on database: any Database) async throws -> ManualFiltersResponse {
    return try await database.transaction { database in
        let sql = try manualFilterSQL(database)
        let rows = try await sql.raw("""
            SELECT f.id, f.name, f.cutoff_match_id, f.kind, f.username
            FROM account_manual_filters f
            WHERE f.username = \(bind: username) OR EXISTS
              (SELECT 1 FROM account_manual_filter_shares a WHERE a.filter_id = f.id AND a.username = \(bind: username))
            ORDER BY f.name, f.username, f.id
            """).all()
        let grants = try await sql.raw("""
            SELECT a.filter_id, a.username FROM account_manual_filter_shares a
            JOIN account_manual_filters f ON f.id = a.filter_id
            WHERE f.username = \(bind: username) ORDER BY a.username
            """).all()
        var recipients: [String: [String]] = [:]
        for row in grants {
            recipients[try row.decode(column: "filter_id", as: String.self), default: []].append(try row.decode(column: "username", as: String.self))
        }
        let assignments = try await sql.raw("""
            SELECT s.filter_id, s.match_id, s.state, s.numeric_value
            FROM account_manual_filter_states s
            JOIN account_manual_filters f ON f.id = s.filter_id
            WHERE f.username = \(bind: username) OR EXISTS
              (SELECT 1 FROM account_manual_filter_shares a WHERE a.filter_id = f.id AND a.username = \(bind: username))
            """).all()
        return try ManualFiltersResponse(filters: rows.map { row in
            ManualFilter(id: try row.decode(column: "id", as: String.self),
                         name: try row.decode(column: "name", as: String.self),
                         cutoffMatchID: try row.decode(column: "cutoff_match_id", as: Int64.self),
                         kind: try row.decode(column: "kind", as: ManualTagKind.self),
                         owner: try row.decode(column: "username", as: String.self),
                         sharedWith: recipients[try row.decode(column: "id", as: String.self)] ?? [])
        }, assignments: assignments.map { row in
            guard let state = ManualMatchState(rawValue: try row.decode(column: "state", as: String.self)) else {
                throw Abort(.internalServerError)
            }
            return ManualFilterAssignment(filterID: try row.decode(column: "filter_id", as: String.self),
                                          matchID: try row.decode(column: "match_id", as: Int64.self), state: state,
                                          value: try row.decode(column: "numeric_value", as: Double?.self))
        })
    }
}

func createManualFilter(username: String, name raw: String, kind: ManualTagKind = .boolean, on database: any Database) async throws -> ManualFilter {
    let name = try validatedManualFilterName(raw)
    return try await database.transaction { database in
        let sql = try manualFilterSQL(database)
        guard try await sql.raw("SELECT username FROM auth_users WHERE username = \(bind: username) FOR UPDATE").first() != nil else {
            throw Abort(.unauthorized)
        }
        let rows = try await sql.raw("SELECT id FROM account_manual_filters WHERE username = \(bind: username)").all()
        guard rows.count < 100 else { throw Abort(.badRequest, reason: "An account can have up to 100 tags.") }
        guard try await sql.raw("SELECT id FROM account_manual_filters WHERE username = \(bind: username) AND name = \(bind: name)").first() == nil else {
            throw Abort(.conflict, reason: "You already have a tag with that name.")
        }
        let id = UUID().uuidString.lowercased()
        // Use database insertion order, never the played date or which profile was loaded.
        try await sql.raw("""
            INSERT INTO account_manual_filters (id, username, name, kind, cutoff_match_id)
            SELECT \(bind: id), \(bind: username), \(bind: name), \(bind: kind.rawValue), COALESCE(MAX(id), 0) FROM matches
            """).run()
        guard let row = try await sql.raw("SELECT cutoff_match_id FROM account_manual_filters WHERE id = \(bind: id)").first() else {
            throw Abort(.internalServerError)
        }
        return ManualFilter(id: id, name: name, cutoffMatchID: try row.decode(column: "cutoff_match_id", as: Int64.self), kind: kind, owner: username)
    }
}

func deleteManualFilter(_ id: String, username: String, on database: any Database) async throws {
    try await database.transaction { database in
        let sql = try manualFilterSQL(database)
        try await requireManualFilterOwner(id, username: username, sql: sql)
        try await sql.raw("DELETE FROM account_manual_filters WHERE id = \(bind: id) AND username = \(bind: username)").run()
    }
}

func setManualFilterState(_ id: String, matchID: Int64, state: ManualMatchState, value: Double? = nil, username: String, on database: any Database) async throws -> ManualFilterAssignment {
    guard matchID > 0 else { throw Abort(.badRequest, reason: "Invalid match ID.") }
    try await database.transaction { database in
        let sql = try manualFilterSQL(database)
        try await requireManualFilterOwner(id, username: username, sql: sql)
        guard let tag = try await sql.raw("SELECT kind FROM account_manual_filters WHERE id = \(bind: id)").first(),
              let kind = ManualTagKind(rawValue: try tag.decode(column: "kind", as: String.self)) else { throw Abort(.notFound) }
        try validatedManualTagValue(kind: kind, state: state, value: value)
        guard try await sql.raw("SELECT id FROM matches WHERE id = \(bind: matchID)").first() != nil else {
            throw Abort(.notFound, reason: "Match not found.")
        }
        try await sql.raw("""
            INSERT INTO account_manual_filter_states (filter_id, match_id, state, numeric_value)
            VALUES (\(bind: id), \(bind: matchID), \(bind: state.rawValue), \(bind: value))
            ON DUPLICATE KEY UPDATE state = VALUES(state), numeric_value = VALUES(numeric_value)
            """).run()
    }
    return ManualFilterAssignment(filterID: id, matchID: matchID, state: state, value: value)
}

func shareManualTag(_ id: String, recipient raw: String, owner: String, revoke: Bool = false, on database: any Database) async throws {
    let name = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !name.isEmpty, name.count <= 64 else { throw Abort(.badRequest, reason: "Enter an account username.") }
    try await database.transaction { database in
        let sql = try manualFilterSQL(database)
        try await requireManualFilterOwner(id, username: owner, sql: sql)
        guard let account = try await sql.raw("SELECT username FROM auth_users WHERE username = \(bind: name)").first() else {
            throw Abort(.notFound, reason: "Account not found.")
        }
        let recipient = try account.decode(column: "username", as: String.self)
        guard recipient.caseInsensitiveCompare(owner) != .orderedSame else {
            throw Abort(.badRequest, reason: "You already own this tag.")
        }
        if revoke {
            try await sql.raw("DELETE FROM account_manual_filter_shares WHERE filter_id = \(bind: id) AND username = \(bind: recipient)").run()
        } else {
            let grants = try await sql.raw("SELECT username FROM account_manual_filter_shares WHERE filter_id = \(bind: id)").all()
            guard grants.count < 100 || grants.contains(where: { (try? $0.decode(column: "username", as: String.self)) == recipient }) else {
                throw Abort(.badRequest, reason: "A tag can be shared with up to 100 accounts.")
            }
            try await sql.raw("""
                INSERT INTO account_manual_filter_shares (filter_id, username)
                VALUES (\(bind: id), \(bind: recipient))
                ON DUPLICATE KEY UPDATE username = VALUES(username)
                """).run()
        }
    }
}

private func manualFilterUsername(_ request: Request) throws -> String {
    guard let value = authenticatedUsername(request) else { throw Abort(.unauthorized, reason: "Log in to use tags.") }
    return value
}

func manualFilterRoutes(_ app: Application) {
    // Ownership always comes from the signed session; no caller-supplied account ID.
    app.get("auth", "manual-filters") { request async throws -> Response in
        let account = try manualFilterUsername(request)
        let response = Response(status: .ok)
        response.headers.replaceOrAdd(name: .cacheControl, value: "private, no-store")
        try response.content.encode(try await getManualFilters(username: account, on: request.db))
        return response
    }
    app.post("auth", "manual-filters") { request async throws -> ManualFilter in
        let account = try manualFilterUsername(request)
        let body = try request.content.decode(ManualFilterNameRequest.self)
        return try await createManualFilter(username: account, name: body.name, kind: body.kind ?? .boolean, on: request.db)
    }
    app.put("auth", "manual-filters", ":filter", "shares") { request async throws -> ManualFiltersResponse in
        let owner = try manualFilterUsername(request)
        guard let id = request.parameters.get("filter") else { throw Abort(.badRequest) }
        let body = try request.content.decode(ManualTagShareRequest.self)
        try await shareManualTag(id, recipient: body.username, owner: owner, on: request.db)
        return try await getManualFilters(username: owner, on: request.db)
    }
    app.delete("auth", "manual-filters", ":filter", "shares", ":recipient") { request async throws -> ManualFiltersResponse in
        let owner = try manualFilterUsername(request)
        guard let id = request.parameters.get("filter"), let recipient = request.parameters.get("recipient") else { throw Abort(.badRequest) }
        try await shareManualTag(id, recipient: recipient, owner: owner, revoke: true, on: request.db)
        return try await getManualFilters(username: owner, on: request.db)
    }
    app.delete("auth", "manual-filters", ":filter") { request async throws -> Response in
        let account = try manualFilterUsername(request)
        guard let id = request.parameters.get("filter") else { throw Abort(.badRequest) }
        try await deleteManualFilter(id, username: account, on: request.db)
        return Response(status: .noContent)
    }
    app.put("auth", "manual-filters", ":filter", "matches", ":match") { request async throws -> ManualFilterAssignment in
        let account = try manualFilterUsername(request)
        guard let id = request.parameters.get("filter"), let matchID = request.parameters.get("match", as: Int64.self) else { throw Abort(.badRequest) }
        let body = try request.content.decode(ManualFilterStateRequest.self)
        return try await setManualFilterState(id, matchID: matchID, state: body.state, value: body.value, username: account, on: request.db)
    }
}

func validatedManualTagValue(kind: ManualTagKind, state: ManualMatchState, value: Double?) throws {
    switch kind {
    case .boolean:
        guard value == nil else { throw Abort(.badRequest, reason: "True/False tags cannot have numeric values.") }
    case .number:
        guard (state == .unknown && value == nil) || (state == .trueValue && value?.isFinite == true) else {
            throw Abort(.badRequest, reason: "Enter a finite number or clear the tag to Unknown.")
        }
    }
}
