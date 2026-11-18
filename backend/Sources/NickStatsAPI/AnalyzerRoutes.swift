import Fluent
import Foundation
import SQLKit
import Vapor

private func analyzerSQL(_ db: any Database) throws -> any SQLDatabase {
    guard let sql = db as? any SQLDatabase else { throw Abort(.internalServerError) }; return sql
}
private func analyzerID(_ request: Request, _ name: String = "id") throws -> Int64 {
    guard let value = request.parameters.get(name, as: Int64.self), value > 0 else { throw Abort(.badRequest, reason: "Invalid match ID.") }; return value
}
private func captureID(_ request: Request) throws -> String {
    guard let value = request.parameters.get("capture"), UUID(uuidString: value) != nil else { throw Abort(.badRequest, reason: "Invalid capture ID.") }; return value
}
private func replayResponse(_ json: String) -> Response {
    let response = Response(status: .ok, body: .init(string: json))
    response.headers.contentType = .json
    response.headers.replaceOrAdd(name: "Cache-Control", value: "no-store")
    return response
}
private func storedRound(_ sql: any SQLDatabase, capture: String, manifest: ReplayRoundManifest) async throws -> Data {
    let rows = try await sql.raw("""
      SELECT part_number, body FROM replay_chunks WHERE capture_id = \(bind: capture)
      AND round_number = \(bind: manifest.number) ORDER BY part_number
      """).all()
    guard rows.count == manifest.parts else { throw Abort(.conflict, reason: "Replay upload is incomplete. Retry the upload.") }
    var data = Data()
    for (index,row) in rows.enumerated() {
        guard try row.decode(column:"part_number",as:Int.self) == index else { throw replayBad("missing chunk.") }
        data.append(contentsOf: try row.decode(column:"body",as:String.self).utf8)
        guard data.count <= manifest.bytes else { throw replayBad("round exceeds declared size.") }
    }
    guard data.count == manifest.bytes, replayDigest(data) == manifest.sha256 else { throw replayBad("round checksum mismatch.") }
    return data
}

struct AnalyzerQuery: Content { var players: String?; var match: Int64?; var offset: Int?; var limit: Int? }
struct AnalyzerRosterPlayer: Content { var id: Int64; var steam_id: String; var name: String; var team: Int }
struct AnalyzerMatch: Content {
    var id: Int64; var map: String; var played_at: Int64?; var capture: String?; var players: [AnalyzerRosterPlayer]
}
struct AnalyzerMatchPage: Content { var matches: [AnalyzerMatch]; var limit: Int; var offset: Int }
struct ReplayIndexQuery: Content { var captures: [String] }
struct ReplaySelection: Content { var rounds: [Int]; var players: [String] }
struct ReplayChunk: Content { var data: String }
struct ReplayCaptureCreated: Content { var capture: String }

func analyzerRoutes(_ app: Application) throws {
    // Candidate union only: the shared browser rule evaluator tests both team
    // orientations. No histories, counters or positions are built for this lookup.
    app.get("analyzer","matches") { request async throws -> AnalyzerMatchPage in
        let q = try request.query.decode(AnalyzerQuery.self), sql = try analyzerSQL(request.db)
        let offset = q.offset ?? 0, limit = q.limit ?? 100
        guard offset >= 0, (1...100).contains(limit) else { throw Abort(.badRequest) }
        let ids = try comparisonPlayerIDs(q.players ?? "", minimum: q.match == nil ? 1 : 0)
        guard ids.count <= 20, q.match == nil || q.match! > 0 else { throw Abort(.badRequest) }
        let candidate: SQLQueryString
        if let match = q.match { candidate = "m.id=\(bind:match)" }
        else { candidate = "EXISTS(SELECT 1 FROM match_players mp WHERE mp.match_id=m.id AND mp.player_id IN (\(binds:ids)))" }
        let rows = try await sql.raw("""
          SELECT m.id, m.map_name, m.played_at,
            (SELECT c.id FROM replay_captures c WHERE c.match_id=m.id AND c.complete=TRUE
             AND c.demo_sha256=m.demo_sha256 ORDER BY c.created_at DESC,c.id DESC LIMIT 1) AS capture
          FROM matches m
          WHERE \(candidate)
          ORDER BY m.played_at IS NULL,m.played_at DESC,m.id DESC LIMIT \(bind:limit) OFFSET \(bind:offset)
          """).all()
        let matchIDs = try rows.map { try $0.decode(column:"id",as:Int64.self) }
        var rosters: [Int64:[AnalyzerRosterPlayer]] = [:]
        if !matchIDs.isEmpty {
            let rosterRows = try await sql.raw("""
              SELECT mp.match_id,p.id,CAST(p.steam_id AS CHAR) AS steam_id,mp.display_name,mt.team_slot
              FROM match_players mp JOIN players p ON p.id=mp.player_id
              JOIN match_teams mt ON mt.id=mp.match_team_id WHERE mp.match_id IN (\(binds:matchIDs))
              ORDER BY mp.match_id,mp.player_slot
              """).all()
            for row in rosterRows {
                let id = try row.decode(column:"match_id",as:Int64.self)
                rosters[id,default:[]].append(AnalyzerRosterPlayer(id:try row.decode(column:"id",as:Int64.self),
                    steam_id:try row.decode(column:"steam_id",as:String.self),name:try row.decode(column:"display_name",as:String.self),team:try row.decode(column:"team_slot",as:Int.self)))
            }
        }
        let matches = try rows.map { row in
            let id = try row.decode(column:"id",as:Int64.self)
            return AnalyzerMatch(id:id,map:try row.decode(column:"map_name",as:String.self),
                played_at:try row.decode(column:"played_at",as:Date?.self).map { Int64($0.timeIntervalSince1970) },
                capture:try row.decode(column:"capture",as:String?.self),players:rosters[id] ?? [])
        }
        return AnalyzerMatchPage(matches:matches,limit:limit,offset:offset)
    }
    // Group histories may span hundreds of matches. Fetch small indexes in
    // batches instead of paying one network round trip per match before loading.
    app.post("analyzer","indexes") { request async throws -> Response in
        let query = try request.content.decode(ReplayIndexQuery.self), sql = try analyzerSQL(request.db)
        guard !query.captures.isEmpty, query.captures.count <= 100,
              Set(query.captures).count == query.captures.count,
              query.captures.allSatisfy({ UUID(uuidString:$0) != nil }) else { throw Abort(.badRequest) }
        let rows = try await sql.raw("""
          SELECT c.id,c.header_json,c.manifest_json FROM replay_captures c JOIN matches m ON m.id=c.match_id
          WHERE c.id IN (\(binds:query.captures)) AND c.complete=TRUE AND c.demo_sha256=m.demo_sha256
          """).all()
        guard rows.count == query.captures.count else { throw Abort(.conflict,reason:"Movement captures changed. Find matches again.") }
        let indexes = try rows.map { row -> ReplayJSON in
            let header = try replayDecode(row.decode(column:"header_json",as:String.self),as:ReplayJSON.self)
            let rounds = try replayDecode(row.decode(column:"manifest_json",as:String.self),as:[ReplayRoundManifest].self)
            return .object(["capture":.string(try row.decode(column:"id",as:String.self)),"header":header,"rounds":.array(rounds.map(\.summary))])
        }
        return replayResponse(try replayText(ReplayJSON.object(["captures":.array(indexes)])))
    }
    app.post("analyzer","matches",":id","captures") { request async throws -> ReplayCaptureCreated in
        try requireUploadAuthorization(request)
        let match = try analyzerID(request), sql = try analyzerSQL(request.db)
        let upload = try request.content.decode(ReplayUpload.self)
        try validateReplayUpload(upload)
        let sha = upload.header["demo_sha256"].string!, map = upload.header["map"].string!
        guard let row = try await sql.raw("SELECT provider_match_id,rounds FROM matches WHERE id=\(bind:match) AND demo_sha256=UNHEX(\(bind:sha)) AND map_name=\(bind:map)").first() else {
            throw Abort(.conflict,reason:"This replay does not match the stored demo fingerprint. Replace the stored statistics first if this is a different demo.")
        }
        let provider = try row.decode(column:"provider_match_id",as:String?.self)
        let uid = provider.map { "faceit:\($0)" } ?? "sha256:\(sha)"
        guard upload.header["match_uid"].string == uid,
              upload.rounds.count == (try row.decode(column:"rounds",as:Int.self)),
              upload.rounds.map(\.number).sorted() == Array(1...upload.rounds.count) else { throw replayBad("match identity or completed rounds differ from stored statistics.") }
        // Incomplete interrupted uploads expire; active captures remain readable.
        try await sql.raw("DELETE FROM replay_captures WHERE complete=FALSE AND created_at < NOW() - INTERVAL 1 DAY").run()
        let id = UUID().uuidString.lowercased(), header = try replayText(upload.header), manifest = try replayText(upload.rounds)
        try await sql.raw("""
          INSERT INTO replay_captures(id,match_id,demo_sha256,header_json,manifest_json)
          VALUES(\(bind:id),\(bind:match),UNHEX(\(bind:sha)),\(bind:header),\(bind:manifest))
          """).run()
        return ReplayCaptureCreated(capture:id)
    }
    app.put("analyzer","captures",":capture","rounds",":round","parts",":part") { request async throws -> HTTPStatus in
        try requireUploadAuthorization(request)
        let capture = try captureID(request)
        guard let number = request.parameters.get("round",as:Int.self), let part = request.parameters.get("part",as:Int.self) else { throw Abort(.badRequest) }
        let chunk = try request.content.decode(ReplayChunk.self)
        guard !chunk.data.isEmpty, chunk.data.utf8.count <= 512*1024 else { throw replayBad("chunk is too large.") }
        // Lock against finalization: a completed capture is immutable.
        try await request.db.transaction { db in
            let sql = try analyzerSQL(db)
            guard let row = try await sql.raw("SELECT manifest_json FROM replay_captures WHERE id=\(bind:capture) AND complete=FALSE FOR UPDATE").first() else { throw Abort(.conflict,reason:"Capture is missing or already complete.") }
            let manifest = try replayDecode(row.decode(column:"manifest_json",as:String.self),as:[ReplayRoundManifest].self)
            guard let round = manifest.first(where:{$0.number == number}), (0..<round.parts).contains(part) else { throw replayBad("unexpected chunk.") }
            try await sql.raw("""
              INSERT INTO replay_chunks(capture_id,round_number,part_number,body) VALUES(\(bind:capture),\(bind:number),\(bind:part),\(bind:chunk.data))
              ON DUPLICATE KEY UPDATE body=VALUES(body)
              """).run()
        }
        return .noContent
    }
    app.post("analyzer","captures",":capture","complete") { request async throws -> HTTPStatus in
        try requireUploadAuthorization(request)
        let capture = try captureID(request)
        try await request.db.transaction { db in
            let sql = try analyzerSQL(db)
            guard let row = try await sql.raw("SELECT match_id,header_json,manifest_json,LOWER(HEX(demo_sha256)) AS sha FROM replay_captures WHERE id=\(bind:capture) AND complete=FALSE FOR UPDATE").first() else { throw Abort(.conflict,reason:"Capture is missing or already complete.") }
            let match = try row.decode(column:"match_id",as:Int64.self), sha = try row.decode(column:"sha",as:String.self)
            guard try await sql.raw("SELECT id FROM matches WHERE id=\(bind:match) AND demo_sha256=UNHEX(\(bind:sha)) FOR UPDATE").first() != nil else { throw Abort(.conflict,reason:"Stored demo changed during upload. Retry with its current demo.") }
            let header = try replayDecode(row.decode(column:"header_json",as:String.self),as:ReplayJSON.self)
            let players = Set((header["players"].array ?? []).compactMap { $0["id"].string })
            let manifest = try replayDecode(row.decode(column:"manifest_json",as:String.self),as:[ReplayRoundManifest].self)
            var sampleCount = 0
            for item in manifest {
                let data = try await storedRound(sql,capture:capture,manifest:item)
                let round = try JSONDecoder().decode(ReplayJSON.self,from:data)
                let (summary,count) = try replayRoundSummary(round,players:players)
                guard summary == item.summary else { throw replayBad("round filter index does not match capture.") }
                sampleCount += count
                guard sampleCount <= 1000000 else { throw replayBad("too many samples in match.") }
            }
            try await sql.raw("UPDATE replay_captures SET complete=TRUE WHERE id=\(bind:capture)").run()
            // Keep old readers safe for a day, then reclaim superseded captures.
            try await sql.raw("DELETE FROM replay_captures WHERE match_id=\(bind:match) AND id<>\(bind:capture) AND created_at < NOW() - INTERVAL 1 DAY").run()
        }
        return .noContent
    }
    app.get("analyzer","captures",":capture") { request async throws -> Response in
        let capture = try captureID(request), sql = try analyzerSQL(request.db)
        guard let row = try await sql.raw("""
          SELECT c.header_json,c.manifest_json FROM replay_captures c JOIN matches m ON m.id=c.match_id
          WHERE c.id=\(bind:capture) AND c.complete=TRUE AND c.demo_sha256=m.demo_sha256
          """).first() else { throw Abort(.notFound,reason:"Movement capture is unavailable. Reparse this demo from Match to add it.") }
        let header = try replayDecode(row.decode(column:"header_json",as:String.self),as:ReplayJSON.self)
        let rounds = try replayDecode(row.decode(column:"manifest_json",as:String.self),as:[ReplayRoundManifest].self)
        return replayResponse(try replayText(ReplayJSON.object(["header":header,"rounds":.array(rounds.map(\.summary))])))
    }
    // One bounded read per match, rather than a network request for every round.
    app.post("analyzer","captures",":capture","selection") { request async throws -> Response in
        let capture = try captureID(request), sql = try analyzerSQL(request.db)
        let selection = try request.content.decode(ReplaySelection.self)
        guard !selection.rounds.isEmpty, selection.rounds.count <= 65535,
              Set(selection.rounds).count == selection.rounds.count,
              !selection.players.isEmpty, selection.players.count <= 64,
              selection.players.allSatisfy({ !$0.isEmpty && $0.count <= 200 }) else { throw Abort(.badRequest) }
        guard let row = try await sql.raw("""
          SELECT c.manifest_json,c.header_json FROM replay_captures c JOIN matches m ON m.id=c.match_id
          WHERE c.id=\(bind:capture) AND c.complete=TRUE AND c.demo_sha256=m.demo_sha256
          """).first() else { throw Abort(.notFound,reason:"Movement capture is unavailable or changed. Reload the match selection.") }
        let header = try replayDecode(row.decode(column:"header_json",as:String.self),as:ReplayJSON.self)
        let manifest = try replayDecode(row.decode(column:"manifest_json",as:String.self),as:[ReplayRoundManifest].self)
        let numbers = Set(selection.rounds), players = Set(selection.players)
        let items = manifest.filter { numbers.contains($0.number) }
        guard items.count == numbers.count else { throw Abort(.badRequest,reason:"Unknown replay round.") }
        var rounds: [ReplayJSON] = []
        for item in items {
            let data = try await storedRound(sql,capture:capture,manifest:item)
            let round = try JSONDecoder().decode(ReplayJSON.self,from:data)
            let projected = projectReplayRound(round,players:players)
            if !(projected["tracks"].array ?? []).isEmpty { rounds.append(projected) }
        }
        return replayResponse(try replayText(ReplayJSON.object(["header":header,"rounds":.array(rounds)])))
    }
}
