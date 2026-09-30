import Fluent
import Foundation
import SQLKit
import Vapor

enum ManualMatchState: String, Content, Sendable {
    case trueValue = "true"
    case falseValue = "false"
    case unknown
}

struct ManualFilter: Content, Sendable {
    var id: String
    var name: String
    var cutoffMatchID: Int64
    enum CodingKeys: String, CodingKey {
        case id, name
        case cutoffMatchID = "cutoff_match_id"
    }
}

struct ManualFilterAssignment: Content, Sendable {
    var filterID: String
    var matchID: Int64
    var state: ManualMatchState
    enum CodingKeys: String, CodingKey {
        case state
        case filterID = "filter_id"
        case matchID = "match_id"
    }
}

struct ManualFiltersResponse: Content, Sendable {
    var filters: [ManualFilter]
    var assignments: [ManualFilterAssignment]
}
struct ManualFilterNameRequest: Content { var name: String }
struct ManualFilterStateRequest: Content { var state: ManualMatchState }

func validatedManualFilterName(_ raw: String) throws -> String {
    let name = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !name.isEmpty, name.unicodeScalars.count <= 64,
          !name.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }) else {
        throw Abort(.badRequest, reason: "Use a filter name between 1 and 64 characters without control characters.")
    }
    return name
}

private func manualFilterSQL(_ database: any Database) throws -> any SQLDatabase {
    guard let sql = database as? any SQLDatabase else { throw Abort(.internalServerError) }
    return sql
}

private func requireManualFilterOwner(_ id: String, username: String, sql: any SQLDatabase) async throws {
    guard try await sql.raw("SELECT id FROM account_manual_filters WHERE id = \(bind: id) AND username = \(bind: username) FOR UPDATE").first() != nil else {
        throw Abort(.notFound, reason: "Manual filter not found.")
    }
}

func getManualFilters(username: String, on database: any Database) async throws -> ManualFiltersResponse {
    let sql = try manualFilterSQL(database)
    let rows = try await sql.raw("SELECT id, name, cutoff_match_id FROM account_manual_filters WHERE username = \(bind: username) ORDER BY name, id").all()
    let assignments = try await sql.raw("""
        SELECT s.filter_id, s.match_id, s.state
        FROM account_manual_filter_states s
        JOIN account_manual_filters f ON f.id = s.filter_id
        WHERE f.username = \(bind: username)
        """).all()
    return try ManualFiltersResponse(filters: rows.map { row in
        ManualFilter(id: try row.decode(column: "id", as: String.self),
                     name: try row.decode(column: "name", as: String.self),
                     cutoffMatchID: try row.decode(column: "cutoff_match_id", as: Int64.self))
    }, assignments: assignments.map { row in
        guard let state = ManualMatchState(rawValue: try row.decode(column: "state", as: String.self)) else {
            throw Abort(.internalServerError)
        }
        return ManualFilterAssignment(filterID: try row.decode(column: "filter_id", as: String.self),
                                      matchID: try row.decode(column: "match_id", as: Int64.self), state: state)
    })
}

func createManualFilter(username: String, name raw: String, on database: any Database) async throws -> ManualFilter {
    let name = try validatedManualFilterName(raw)
    return try await database.transaction { database in
        let sql = try manualFilterSQL(database)
        guard try await sql.raw("SELECT username FROM auth_users WHERE username = \(bind: username) FOR UPDATE").first() != nil else {
            throw Abort(.unauthorized)
        }
        let rows = try await sql.raw("SELECT id FROM account_manual_filters WHERE username = \(bind: username)").all()
        guard rows.count < 100 else { throw Abort(.badRequest, reason: "An account can have up to 100 manual filters.") }
        guard try await sql.raw("SELECT id FROM account_manual_filters WHERE username = \(bind: username) AND name = \(bind: name)").first() == nil else {
            throw Abort(.conflict, reason: "You already have a filter with that name.")
        }
        let id = UUID().uuidString.lowercased()
        // Use database insertion order, never the played date or which profile was loaded.
        try await sql.raw("""
            INSERT INTO account_manual_filters (id, username, name, cutoff_match_id)
            SELECT \(bind: id), \(bind: username), \(bind: name), COALESCE(MAX(id), 0) FROM matches
            """).run()
        guard let row = try await sql.raw("SELECT cutoff_match_id FROM account_manual_filters WHERE id = \(bind: id)").first() else {
            throw Abort(.internalServerError)
        }
        return ManualFilter(id: id, name: name, cutoffMatchID: try row.decode(column: "cutoff_match_id", as: Int64.self))
    }
}

func deleteManualFilter(_ id: String, username: String, on database: any Database) async throws {
    try await database.transaction { database in
        let sql = try manualFilterSQL(database)
        try await requireManualFilterOwner(id, username: username, sql: sql)
        try await sql.raw("DELETE FROM account_manual_filters WHERE id = \(bind: id) AND username = \(bind: username)").run()
    }
}

func setManualFilterState(_ id: String, matchID: Int64, state: ManualMatchState, username: String, on database: any Database) async throws -> ManualFilterAssignment {
    guard matchID > 0 else { throw Abort(.badRequest, reason: "Invalid match ID.") }
    try await database.transaction { database in
        let sql = try manualFilterSQL(database)
        try await requireManualFilterOwner(id, username: username, sql: sql)
        guard try await sql.raw("SELECT id FROM matches WHERE id = \(bind: matchID)").first() != nil else {
            throw Abort(.notFound, reason: "Match not found.")
        }
        try await sql.raw("""
            INSERT INTO account_manual_filter_states (filter_id, match_id, state)
            VALUES (\(bind: id), \(bind: matchID), \(bind: state.rawValue))
            ON DUPLICATE KEY UPDATE state = VALUES(state)
            """).run()
    }
    return ManualFilterAssignment(filterID: id, matchID: matchID, state: state)
}

private func manualFilterUsername(_ request: Request) throws -> String {
    guard let value = authenticatedUsername(request) else { throw Abort(.unauthorized, reason: "Log in to use manual filters.") }
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
        return try await createManualFilter(username: account, name: body.name, on: request.db)
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
        return try await setManualFilterState(id, matchID: matchID, state: body.state, username: account, on: request.db)
    }
}
