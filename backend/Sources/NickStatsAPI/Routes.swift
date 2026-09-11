import Fluent
import SQLKit
import Vapor

private func constantTimeEqual(_ supplied: String, _ expected: String) -> Bool {
    let left = Array(supplied.utf8)
    let right = Array(expected.utf8)
    guard left.count == right.count else { return false }
    var difference: UInt8 = 0
    for index in left.indices { difference |= left[index] ^ right[index] }
    return difference == 0
}

private func requireToken(
    _ request: Request,
    environmentName: String,
    unavailableReason: String,
    unauthorizedReason: String
) throws {
    guard let expected = Environment.get(environmentName), !expected.isEmpty else {
        throw Abort(.serviceUnavailable, reason: unavailableReason)
    }
    guard let supplied = request.headers.bearerAuthorization?.token,
          constantTimeEqual(supplied, expected) else {
        throw Abort(.unauthorized, reason: unauthorizedReason)
    }
}

func routes(_ app: Application) throws {
    app.get("health") { request async throws -> HealthResponse in
        guard let sql = request.db as? any SQLDatabase else { throw Abort(.internalServerError) }
        _ = try await sql.raw("SELECT 1").first()
        return HealthResponse(status: "ok")
    }

    app.on(.POST, "matches", body: .collect(maxSize: "2mb")) { request async throws -> Response in
        try requireToken(
            request,
            environmentName: "NICKSTATS_UPLOAD_TOKEN",
            unavailableReason: "Match uploads are not configured.",
            unauthorizedReason: "A valid upload token is required."
        )
        let replaceExisting = request.query[Bool.self, at: "replace"] ?? false
        let payload: MatchPayload
        do {
            payload = try request.content.decode(MatchPayload.self)
        } catch {
            throw Abort(.badRequest, reason: "The request body is not valid \(compactSchema) JSON.")
        }
        try payload.validate()
        let result = try await request.db.transaction { database in
            try await importMatch(payload, replacingExisting: replaceExisting, on: database)
        }
        let response = Response(status: result.created ? .created : .ok)
        try response.content.encode(UploadResponse(id: result.id, created: result.created, replaced: result.replaced))
        return response
    }

    app.on(.POST, "matches", "faceit-dates", body: .collect(maxSize: "128kb")) { request async throws -> FaceitDateSyncResponse in
        try requireToken(
            request,
            environmentName: "NICKSTATS_FACEIT_SYNC_TOKEN",
            unavailableReason: "FACEIT date synchronization is not configured.",
            unauthorizedReason: "A valid FACEIT sync token is required."
        )
        let payload: FaceitDateSyncPayload
        do {
            payload = try request.content.decode(FaceitDateSyncPayload.self)
        } catch {
            throw Abort(.badRequest, reason: "The request body is not valid \(faceitDateSyncSchema) JSON.")
        }
        try payload.validate()
        return try await request.db.transaction { database in
            try await syncFaceitDates(payload, on: database)
        }
    }

    app.get("matches") { request async throws -> MatchListResponse in
        try await listMatches(request)
    }

    app.get("matches", ":id") { request async throws -> MatchPayload in
        guard let matchID = request.parameters.get("id", as: Int64.self), matchID > 0 else {
            throw Abort(.badRequest, reason: "Invalid match ID.")
        }
        return try await getMatch(matchID, on: request.db)
    }

    app.get("players") { request async throws -> PlayerListResponse in
        try await listPlayers(request)
    }

    app.get("players", ":id") { request async throws -> PlayerProfileResponse in
        guard let playerID = request.parameters.get("id", as: Int64.self), playerID > 0 else {
            throw Abort(.badRequest, reason: "Invalid player ID.")
        }
        return try await getPlayerProfile(playerID, on: request.db)
    }

    app.get("compare") { request async throws -> ComparisonResponse in
        try await comparisonData(request)
    }
}
