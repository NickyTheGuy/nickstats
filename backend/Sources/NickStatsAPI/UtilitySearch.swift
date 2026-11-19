import Fluent
import Foundation
import SQLKit
import Vapor

struct UtilityIndexEvent: Sendable {
    var number: Int; var event: ReplayJSON; var damage: Int?; var enemies: Int?; var blind: Int?; var attribution: String
}
func utilityIndexEvents(_ round: ReplayJSON,legacy: [String:ReplayJSON] = [:]) -> [UtilityIndexEvent] {
    let events = round["utility"].array ?? []
    let performance = Dictionary(uniqueKeysWithValues:(round["performance"].array ?? []).compactMap { p in p["player"].string.map { ($0,p["grenades"]) } })
    return events.enumerated().compactMap { index,event in
        guard let type = event["type"].string,["HE","Flash","Fire"].contains(type) else { return nil }
        var damage = event["effectiveness"]["enemy_damage"].integer,enemies = event["effectiveness"]["enemies_flashed"].integer,blind = event["effectiveness"]["enemy_blind_ms"].integer
        var source = damage != nil || enemies != nil || blind != nil ? "capture":"unknown"
        if let player = event["player"].string {
            let captured = performance[player] ?? .null,totals = captured == .null ? legacy[player] ?? .null : captured
            let thrown = type == "HE" ? "he_thrown":type == "Flash" ? "flash_thrown":"fire_thrown"
            if totals[thrown].integer == 1,events.filter({ $0["player"].string == player && $0["type"].string == type }).count == 1 {
                if type == "Flash" {
                    if enemies == nil,let value = totals["enemies_flashed"].integer { enemies = value;source = "single_throw" }
                    if blind == nil,let value = totals["blind_ms"].integer { blind = value;source = "single_throw" }
                } else if damage == nil,let value = totals[type == "HE" ? "he_damage":"fire_damage"].integer { damage = value;source = "single_throw" }
            }
        }
        return UtilityIndexEvent(number:index,event:event,damage:damage,enemies:enemies,blind:blind,attribution:source)
    }
}
func legacyUtilityTotals(_ sql: any SQLDatabase,matchID: Int64) async throws -> [Int:[String:ReplayJSON]] {
    let rows = try await sql.raw("""
      SELECT r.round_number,CONCAT('steam:',CAST(p.steam_id AS CHAR)) AS player,
        CAST(JSON_OBJECT('he_thrown',JSON_EXTRACT(r.stats_json,'$.utility_thrown[0]'),
          'flash_thrown',JSON_EXTRACT(r.stats_json,'$.utility_thrown[1]'),'fire_thrown',JSON_EXTRACT(r.stats_json,'$.utility_thrown[3]'),
          'he_damage',JSON_EXTRACT(r.stats_json,'$.utility[0]'),'fire_damage',JSON_EXTRACT(r.stats_json,'$.utility[1]'),
          'enemies_flashed',JSON_EXTRACT(r.stats_json,'$.profile[13]'),'blind_ms',JSON_EXTRACT(r.stats_json,'$.profile[14]')) AS CHAR) AS totals
      FROM player_round_phase_stats r JOIN match_players mp ON mp.id=r.match_player_id JOIN players p ON p.id=mp.player_id
      WHERE r.match_id=\(bind:matchID)
      """).all()
    var result: [Int:[String:ReplayJSON]] = [:]
    for row in rows { result[try row.decode(column:"round_number",as:Int.self),default:[:]][try row.decode(column:"player",as:String.self)] = try replayDecode(row.decode(column:"totals",as:String.self),as:ReplayJSON.self) }
    return result
}
func saveUtilityIndexRound(_ sql: any SQLDatabase,capture: String,round: ReplayJSON,legacy: [String:ReplayJSON]) async throws {
    for row in utilityIndexEvents(round,legacy:legacy) {
        let e = row.event
        try await sql.raw("""
          INSERT INTO replay_utility_events(capture_id,round_number,event_number,player_id,side,grenade_type,icon,elapsed_ms,x,y,z,enemy_damage,enemies_flashed,enemy_blind_ms,attribution)
          VALUES(\(bind:capture),\(bind:round["number"].integer!),\(bind:row.number),\(bind:e["player"].string),\(bind:e["side"].integer!),
            \(bind:e["type"].string!),\(bind:e["icon"].string!),\(bind:Int(e["time"].number!)),\(bind:Int(e["x"].number!)),\(bind:Int(e["y"].number!)),\(bind:Int(e["z"].number!)),
            \(bind:row.damage),\(bind:row.enemies),\(bind:row.blind),\(bind:row.attribution))
          """).run()
    }
}
func markUtilityIndexed(_ sql: any SQLDatabase,capture: String) async throws {
    try await sql.raw("INSERT INTO replay_utility_index_state(capture_id,version) VALUES(\(bind:capture),1)").run()
}
struct UtilityScope: Content { var capture: String;var rounds: [Int] }
struct UtilitySearchQuery: Content { var scopes: [UtilityScope];var players: [String];var type: String;var metric: String;var minimum: Int;var offset: Int?;var limit: Int? }
struct UtilitySearchHit: Content {
    var capture: String;var match_id: Int64;var map: String;var round: Int;var event: Int;var player: String;var side: Int;var type: String;var icon: String;var time: Int
    var x: Int;var y: Int;var z: Int;var enemy_damage: Int?;var enemies_flashed: Int?;var enemy_blind_ms: Int?;var attribution: String
}
struct UtilitySearchPage: Content { var rows: [UtilitySearchHit];var total: Int;var unknown: Int;var pending_captures: [String];var offset: Int;var limit: Int }
struct UtilityReindexQuery: Content { var capture: String }
struct UtilityReindexResult: Content { var indexed: Bool }
func validateUtilitySearch(_ q: UtilitySearchQuery) throws {
    guard !q.scopes.isEmpty,q.scopes.count <= 1000,Set(q.scopes.map(\.capture)).count == q.scopes.count,
          q.scopes.reduce(0,{ $0+$1.rounds.count }) <= 20000,
          q.scopes.allSatisfy({ UUID(uuidString:$0.capture) != nil && !$0.rounds.isEmpty && Set($0.rounds).count == $0.rounds.count && $0.rounds.allSatisfy({ (1...65535).contains($0) }) }),
          !q.players.isEmpty,q.players.count <= 64,Set(q.players).count == q.players.count,q.players.allSatisfy({ !$0.isEmpty && $0.count <= 200 }),
          ["HE","Flash","Fire"].contains(q.type),q.type == "Flash" ? ["enemies","blind_ms"].contains(q.metric):q.metric == "damage",
          (0...999999999).contains(q.minimum),(0...1000000).contains(q.offset ?? 0),(1...100).contains(q.limit ?? 50) else {
        throw Abort(.badRequest,reason:"Invalid utility search. Narrow the match or round selection if it is too large.")
    }
}
func utilitySearchRoutes(_ app: Application) {
    app.post("analyzer","utility","index") { request async throws -> UtilityReindexResult in
        try requireUploadAuthorization(request)
        let query = try request.content.decode(UtilityReindexQuery.self)
        guard UUID(uuidString:query.capture) != nil else { throw Abort(.badRequest) }
        try await request.db.transaction { db in
            guard let sql = db as? any SQLDatabase else { throw Abort(.internalServerError) }
            guard let row = try await sql.raw("""
              SELECT c.match_id,c.manifest_json FROM replay_captures c JOIN matches m ON m.id=c.match_id
              WHERE c.id=\(bind:query.capture) AND c.complete=TRUE AND c.demo_sha256=m.demo_sha256 FOR UPDATE
              """).first() else { throw Abort(.conflict,reason:"Capture changed. Find matches again.") }
            if try await sql.raw("SELECT capture_id FROM replay_utility_index_state WHERE capture_id=\(bind:query.capture) AND version=1").first() != nil { return }
            let manifest = try replayDecode(row.decode(column:"manifest_json",as:String.self),as:[ReplayRoundManifest].self)
            let totals = try await legacyUtilityTotals(sql,matchID:row.decode(column:"match_id",as:Int64.self))
            try await sql.raw("DELETE FROM replay_utility_events WHERE capture_id=\(bind:query.capture)").run()
            try await sql.raw("DELETE FROM replay_utility_index_state WHERE capture_id=\(bind:query.capture)").run()
            for item in manifest {
                let data = try await storedRound(sql,capture:query.capture,manifest:item),round = try JSONDecoder().decode(ReplayJSON.self,from:data)
                try await saveUtilityIndexRound(sql,capture:query.capture,round:round,legacy:totals[item.number] ?? [:])
            }
            try await markUtilityIndexed(sql,capture:query.capture)
        }
        return UtilityReindexResult(indexed:true)
    }
    app.post("analyzer","utility","search") { request async throws -> UtilitySearchPage in
        let q = try request.content.decode(UtilitySearchQuery.self);try validateUtilitySearch(q)
        guard let sql = request.db as? any SQLDatabase else { throw Abort(.internalServerError) }
        let ids = q.scopes.map(\.capture),offset = q.offset ?? 0,limit = q.limit ?? 50
        let captures = try await sql.raw("""
          SELECT c.id,i.capture_id AS indexed FROM replay_captures c JOIN matches m ON m.id=c.match_id
          LEFT JOIN replay_utility_index_state i ON i.capture_id=c.id AND i.version=1
          WHERE c.id IN (\(binds:ids)) AND c.complete=TRUE AND c.demo_sha256=m.demo_sha256
          AND c.id=(SELECT latest.id FROM replay_captures latest WHERE latest.match_id=m.id AND latest.complete=TRUE AND latest.demo_sha256=m.demo_sha256 ORDER BY latest.created_at DESC,latest.id DESC LIMIT 1)
          """).all()
        guard captures.count == ids.count else { throw Abort(.conflict,reason:"Captures changed. Find matches again.") }
        var pending: [String] = [],indexed: [String] = []
        for row in captures { let id = try row.decode(column:"id",as:String.self);if try row.decode(column:"indexed",as:String?.self) == nil { pending.append(id) } else { indexed.append(id) } }
        if indexed.isEmpty { return UtilitySearchPage(rows:[],total:0,unknown:0,pending_captures:pending.sorted(),offset:offset,limit:limit) }
        var scope: SQLQueryString = "FALSE"
        for s in q.scopes { scope = "\(scope) OR (e.capture_id=\(bind:s.capture) AND e.round_number IN (\(binds:s.rounds)))" }
        let column: SQLQueryString = q.metric == "damage" ? "e.enemy_damage":q.metric == "enemies" ? "e.enemies_flashed":"e.enemy_blind_ms"
        let owner: SQLQueryString = "e.player_id IN (\(binds:q.players))"
        let complete: SQLQueryString = q.type == "Flash" && q.metric == "enemies" && q.minimum > 0 ? "\(column) IS NOT NULL AND e.enemy_blind_ms IS NOT NULL":"\(column) IS NOT NULL"
        let qualifies: SQLQueryString = q.type == "Flash" && q.metric == "enemies" && q.minimum > 0 ? "\(owner) AND \(complete) AND \(column)>=\(bind:q.minimum) AND e.enemy_blind_ms>0":"\(owner) AND \(complete) AND \(column)>=\(bind:q.minimum)"
        let base: SQLQueryString = "(\(scope)) AND e.capture_id IN (\(binds:indexed)) AND e.grenade_type=\(bind:q.type) AND (\(owner) OR e.player_id IS NULL)"
        let counts = try await sql.raw("""
          SELECT CAST(COALESCE(SUM(CASE WHEN \(qualifies) THEN 1 ELSE 0 END),0) AS SIGNED) AS matched,
            CAST(COALESCE(SUM(CASE WHEN e.player_id IS NULL OR NOT(\(complete)) THEN 1 ELSE 0 END),0) AS SIGNED) AS unknown_count
          FROM replay_utility_events e WHERE \(base)
          """).first()!
        let rows = try await sql.raw("""
          SELECT e.*,c.match_id,m.map_name FROM replay_utility_events e JOIN replay_captures c ON c.id=e.capture_id JOIN matches m ON m.id=c.match_id
          WHERE \(base) AND \(qualifies) ORDER BY \(column) DESC,e.capture_id,e.round_number,e.event_number LIMIT \(bind:limit) OFFSET \(bind:offset)
          """).all()
        let hits = try rows.map { row in
            UtilitySearchHit(capture:try row.decode(column:"capture_id",as:String.self),match_id:try row.decode(column:"match_id",as:Int64.self),map:try row.decode(column:"map_name",as:String.self),
              round:try row.decode(column:"round_number",as:Int.self),event:try row.decode(column:"event_number",as:Int.self),player:try row.decode(column:"player_id",as:String.self),side:try row.decode(column:"side",as:Int.self),
              type:try row.decode(column:"grenade_type",as:String.self),icon:try row.decode(column:"icon",as:String.self),time:try row.decode(column:"elapsed_ms",as:Int.self),
              x:try row.decode(column:"x",as:Int.self),y:try row.decode(column:"y",as:Int.self),z:try row.decode(column:"z",as:Int.self),enemy_damage:try row.decode(column:"enemy_damage",as:Int?.self),
              enemies_flashed:try row.decode(column:"enemies_flashed",as:Int?.self),enemy_blind_ms:try row.decode(column:"enemy_blind_ms",as:Int?.self),attribution:try row.decode(column:"attribution",as:String.self))
        }
        return UtilitySearchPage(rows:hits,total:try counts.decode(column:"matched",as:Int.self),unknown:try counts.decode(column:"unknown_count",as:Int.self),pending_captures:pending.sorted(),offset:offset,limit:limit)
    }
}
