import Foundation
import Fluent
import SQLKit
import Vapor

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

func requireUploadAuthorization(_ request: Request) throws {
    if authenticatedUsername(request) != nil { return }
    try requireToken(
        request,
        environmentName: "NICKSTATS_UPLOAD_TOKEN",
        unavailableReason: "Match uploads are not configured.",
        unauthorizedReason: "Login or a valid upload token is required."
    )
}

func routes(_ app: Application) throws {
    roundConditionRoutes(app)
    accountFriendsRoutes(app)
    manualFilterRoutes(app)
    try analyzerRoutes(app)
    app.get("health") { request async throws -> HealthResponse in
        guard let sql = request.db as? any SQLDatabase else { throw Abort(.internalServerError) }
        _ = try await sql.raw("SELECT 1").first()
        return HealthResponse(status: "ok")
    }

    app.post("auth", "login") { request async throws -> Response in
        let login = try request.content.decode(LoginRequest.self)
        let session = try await authenticateLogin(login, on: request.db)
        let response = Response(status: .ok)
        try response.content.encode(try await accountSession(username: session.username, on: request.db))
        setSessionCookie(response, token: session.token, maxAge: session.expiresAt - Int64(Date().timeIntervalSince1970))
        return response
    }

    app.get("auth", "session") { request async throws -> AuthSessionResponse in
        guard let username = authenticatedUsername(request) else {
            return AuthSessionResponse(authenticated: false, username: nil, playerID: nil, playerName: nil, playerSteamID: nil)
        }
        return try await accountSession(username: username, on: request.db)
    }

    app.post("auth", "logout") { _ -> Response in
        let response = Response(status: .noContent)
        clearSessionCookie(response)
        return response
    }

    app.post("auth", "password") { request async throws -> Response in
        guard let username = authenticatedUsername(request) else {
            throw Abort(.unauthorized, reason: "Log in before changing your password.")
        }
        let change = try request.content.decode(ChangePasswordRequest.self)
        try await changePassword(username: username, change: change, on: request.db)
        return Response(status: .noContent)
    }

    app.post("auth", "player") { request async throws -> AuthSessionResponse in
        guard let username = authenticatedUsername(request) else {
            throw Abort(.unauthorized, reason: "Log in before changing your player.")
        }
        let selection = try request.content.decode(AccountPlayerRequest.self)
        return try await setAccountPlayer(username: username, playerID: selection.playerID, on: request.db)
    }

    app.on(.POST, "matches", body: .collect(maxSize: "8mb")) { request async throws -> Response in
        try requireUploadAuthorization(request)
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
        if !result.affectedPlayerIDs.isEmpty {
            let changes = [ProfileMatchChange(matchID: result.id, playerIDs: result.affectedPlayerIDs)]
            await profileResponseCache.markChanged(changes)
            await playerHistoryCache.markChanged(changes)
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
        let result = try await request.db.transaction { database in
            try await syncFaceitDates(payload, on: database)
        }
        await profileResponseCache.markChanged(result.changes)
        await playerHistoryCache.markChanged(result.changes)
        return result.response
    }

    app.get("matches") { request async throws -> MatchListResponse in
        try await listMatches(request)
    }

    app.get("matches", "revision") { request async throws -> MatchRevisionResponse in
        try await matchRevision(on: request.db)
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

    app.get("players", ":id", "teammate-ratings") { request async throws -> Response in
        guard let playerID = request.parameters.get("id", as: Int64.self), playerID > 0 else {
            throw Abort(.badRequest, reason: "Invalid player ID.")
        }
        let timing = ProfileTimingRecorder()
        let totalStart = timing.start()
        let queryStart = timing.start()
        let payload = try await getTeammateRatings(playerID, on: request.db)
        timing.record("ratings", since: queryStart)
        let response = Response(status: .ok)
        let encodeStart = timing.start()
        try response.content.encode(payload)
        timing.record("encode", since: encodeStart)
        timing.record("total", since: totalStart)
        let serverTiming = timing.serverTimingHeader()
        response.headers.replaceOrAdd(name: "Server-Timing", value: serverTiming)
        request.logger.info("Teammate ratings timing", metadata: ["player_id": "\(playerID)", "server_timing": "\(serverTiming)"])
        return response
    }

    // Read-only aggregate; a body avoids putting thousands of match IDs in a URL.
    app.on(.POST, "players", ":id", "trade-teammates", body: .collect(maxSize: "512kb")) { request async throws -> TradeTeammatesResponse in
        guard let playerID = request.parameters.get("id", as: Int64.self), playerID > 0 else {
            throw Abort(.badRequest, reason: "Invalid player ID.")
        }
        let selection = try request.content.decode(TradeTeammatesRequest.self)
        return try await request.db.transaction { database in
            try await getTradeTeammates(playerID, selection: selection, on: database)
        }
    }

    app.get("players", ":id") { request async throws -> Response in
        guard let playerID = request.parameters.get("id", as: Int64.self), playerID > 0 else {
            throw Abort(.badRequest, reason: "Invalid player ID.")
        }
        let response = Response(status: .ok)
        if request.query[Bool.self, at: "compact"] == true {
            let timing = ProfileTimingRecorder()
            let totalStart = timing.start()
            let wireVersion = request.query[Int.self, at: "wire"]
            if wireVersion == 3 {
                let data = try await encodedPlayerHistory(playerID, on: request.db, timing: timing)
                response.body = .init(data: data)
                response.headers.contentType = .json
                timing.record("total", since: totalStart)
                let serverTiming = timing.serverTimingHeader()
                response.headers.replaceOrAdd(name: "Server-Timing", value: serverTiming)
                request.logger.info("Compact player profile timing", metadata: ["player_id": "\(playerID)", "server_timing": "\(serverTiming)"])
                return response
            }
            var cacheVersion: UInt64?
            if wireVersion == 2 {
                let cacheStart = timing.start()
                let lookup = await profileResponseCache.lookup(playerID: playerID, wireVersion: 2)
                cacheVersion = lookup.version
                if let data = lookup.data, lookup.staleMatchIDs.isEmpty {
                    timing.record("cache_hit", since: cacheStart)
                    response.headers.contentType = .json
                    response.body = .init(data: data)
                    timing.record("total", since: totalStart)
                    let serverTiming = timing.serverTimingHeader()
                    response.headers.replaceOrAdd(name: "Server-Timing", value: serverTiming)
                    request.logger.info("Compact player profile timing", metadata: [
                        "player_id": "\(playerID)",
                        "server_timing": "\(serverTiming)"
                    ])
                    return response
                }
                if let cachedProfile = lookup.profile, !lookup.staleMatchIDs.isEmpty {
                    timing.record("cache_stale", since: cacheStart)
                    let refreshStart = timing.start()
                    let player = try await getPlayerProfileIdentity(
                        playerID, on: request.db, timing: timing
                    )
                    let refreshedMatches = try await getPlayerProfileMatches(
                        playerID,
                        matchIDs: lookup.staleMatchIDs,
                        on: request.db,
                        timing: timing
                    )
                    let densePayload = DensePlayerProfileDataResponse(
                        refreshing: cachedProfile,
                        player: player,
                        replacingMatchIDs: lookup.staleMatchIDs,
                        with: refreshedMatches
                    )
                    timing.record("incremental_refresh", since: refreshStart)
                    let encodeStart = timing.start()
                    let data = try JSONEncoder().encode(densePayload)
                    response.headers.contentType = .json
                    response.body = .init(data: data)
                    timing.record("encode", since: encodeStart)
                    let cacheStoreStart = timing.start()
                    await profileResponseCache.insert(
                        data,
                        profile: densePayload,
                        playerID: playerID,
                        wireVersion: 2,
                        version: lookup.version
                    )
                    timing.record("cache_store", since: cacheStoreStart)
                    timing.record("total", since: totalStart)
                    let serverTiming = timing.serverTimingHeader()
                    response.headers.replaceOrAdd(name: "Server-Timing", value: serverTiming)
                    request.logger.info("Compact player profile timing", metadata: [
                        "player_id": "\(playerID)",
                        "server_timing": "\(serverTiming)"
                    ])
                    return response
                }
                timing.record("cache_miss", since: cacheStart)
            }
            let buildStart = timing.start()
            let payload = try await getPlayerProfileData(playerID, on: request.db, timing: timing)
            let densePayload: DensePlayerProfileDataResponse?
            if wireVersion == 2 {
                let denseStart = timing.start()
                densePayload = DensePlayerProfileDataResponse(payload)
                timing.record("dense_wire", since: denseStart)
            } else {
                densePayload = nil
            }
            timing.record("build", since: buildStart)
            let encodeStart = timing.start()
            if let densePayload {
                let data = try JSONEncoder().encode(densePayload)
                response.headers.contentType = .json
                response.body = .init(data: data)
                timing.record("encode", since: encodeStart)
                let cacheStoreStart = timing.start()
                if let cacheVersion {
                    await profileResponseCache.insert(
                        data,
                        profile: densePayload,
                        playerID: playerID,
                        wireVersion: 2,
                        version: cacheVersion
                    )
                }
                timing.record("cache_store", since: cacheStoreStart)
            } else {
                try response.content.encode(payload)
                timing.record("encode", since: encodeStart)
            }
            timing.record("total", since: totalStart)
            let serverTiming = timing.serverTimingHeader()
            response.headers.replaceOrAdd(name: "Server-Timing", value: serverTiming)
            request.logger.info("Compact player profile timing", metadata: [
                "player_id": "\(playerID)",
                "server_timing": "\(serverTiming)"
            ])
        } else {
            let payload = try await getPlayerProfile(playerID, on: request.db)
            try response.content.encode(payload)
        }
        return response
    }

    app.get("groups") { request async throws -> Response in
        let benchmarkVersion = request.query[Int.self, at: "benchmark"] ?? 0
        let benchmark = benchmarkVersion == 1 || benchmarkVersion == 2
        if benchmark {
            guard authenticatedUsername(request) != nil else {
                throw Abort(.unauthorized, reason: "Log in to run the Groups wire benchmark.")
            }
        }
        let timing = ProfileTimingRecorder()
        let totalStart = timing.start()
        if !benchmark && request.query[Int.self, at: "wire"] == 4 {
            let query = try request.query.decode(ComparisonQuery.self)
            let playerIDs = try comparisonPlayerIDs(query.players, minimum: 1)
            let matchIDs = try comparisonMatchIDs(query.matches)
            var fragments: [Data] = []
            let buildStart = timing.start()
            if matchIDs == nil {
                for (index, playerID) in playerIDs.enumerated() {
                    let playerStart = timing.start()
                    fragments.append(try await encodedPlayerHistory(playerID, on: request.db, timing: timing))
                    timing.record("player_\(index + 1)", since: playerStart)
                }
            } else {
                // Scoped comparisons must never reuse an unfiltered full history.
                let scoped = try await comparisonData(request, timing: timing, minimumPlayers: 1)
                for player in scoped.players {
                    let identity = PlayerProfileIdentity(id: player.id, steamID: player.steamID,
                        name: player.name, firstSeenAt: nil, lastSeenAt: nil)
                    fragments.append(try encodeLayoutHistory(.init(player: identity, matches: player.matches), timing: timing))
                }
            }
            timing.record("build", since: buildStart)
            let assemblyStart = timing.start()
            let data = assembleProfileGroup(fragments)
            timing.record("assembly", since: assemblyStart)
            let response = Response(status: .ok)
            response.headers.contentType = .json
            response.headers.replaceOrAdd(name: "Cache-Control", value: "no-store")
            response.body = .init(data: data)
            timing.record("total", since: totalStart)
            let serverTiming = timing.serverTimingHeader()
            response.headers.replaceOrAdd(name: "Server-Timing", value: serverTiming)
            request.logger.info("Group profile timing", metadata: ["player_count": "\(playerIDs.count)", "server_timing": "\(serverTiming)"])
            return response
        }
        let buildStart = timing.start()
        let payload = try await comparisonData(request, timing: timing, useHistoryCache: !benchmark)
        timing.record("build", since: buildStart)
        let response = Response(status: .ok)
        if benchmarkVersion == 2 {
            let report = try benchmarkGroupAssembly(payload)
            try response.content.encode(report)
            response.headers.replaceOrAdd(name: "Cache-Control", value: "no-store")
            timing.record("total", since: totalStart)
            response.headers.replaceOrAdd(name: "Server-Timing", value: timing.serverTimingHeader())
            let reportJSON = String(decoding: try JSONEncoder().encode(report), as: UTF8.self)
            request.logger.info("Groups assembly benchmark", metadata: ["report": "\(reportJSON)"])
            return response
        }
        if benchmark {
            let report = try benchmarkGroupWire(payload)
            try response.content.encode(report)
            response.headers.replaceOrAdd(name: "Cache-Control", value: "no-store")
            timing.record("total", since: totalStart)
            response.headers.replaceOrAdd(name: "Server-Timing", value: timing.serverTimingHeader())
            let reportJSON = String(decoding: try JSONEncoder().encode(report), as: UTF8.self)
            request.logger.info("Groups wire benchmark", metadata: ["report": "\(reportJSON)"])
            return response
        }
        if request.query[Int.self, at: "wire"] == 3 {
            let layoutStart = timing.start()
            let layoutPayload = LayoutComparisonResponse(payload)
            timing.record("layouts", since: layoutStart)
            let encodeStart = timing.start()
            try response.content.encode(layoutPayload)
            timing.record("encode", since: encodeStart)
        } else if request.query[Int.self, at: "wire"] == 2 {
            let denseStart = timing.start()
            let densePayload = DenseComparisonResponse(payload)
            timing.record("dense", since: denseStart)
            let encodeStart = timing.start()
            try response.content.encode(densePayload)
            timing.record("encode", since: encodeStart)
        } else {
            let encodeStart = timing.start()
            try response.content.encode(payload)
            timing.record("encode", since: encodeStart)
        }
        timing.record("total", since: totalStart)
        let serverTiming = timing.serverTimingHeader()
        response.headers.replaceOrAdd(name: "Server-Timing", value: serverTiming)
        request.logger.info("Group profile timing", metadata: ["player_count": "\(payload.players.count)", "server_timing": "\(serverTiming)"])
        return response
    }
}
