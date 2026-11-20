import Fluent
import Foundation
import SQLKit
import Vapor

enum OpeningRoundCondition: String, Codable, Hashable, Sendable {
    case kill = "opening_kill", death = "opening_death", noAttempt = "no_opening"
}
func openingRoundCondition(_ stats: SideStatsPayload) -> OpeningRoundCondition? {
    guard stats.rounds.played == 1,(0...1).contains(stats.opening.kills),(0...1).contains(stats.opening.deaths),stats.opening.kills + stats.opening.deaths <= 1 else { return nil }
    return stats.opening.kills == 1 ? .kill:stats.opening.deaths == 1 ? .death:.noAttempt
}
private struct ConditionKey: Hashable {
    var condition: OpeningRoundCondition;var side: String;var buy: String;var enemyBuy: String;var result: String;var phase: String;var hero: Bool
}
struct RoundConditionSlice: Content {
    var condition: OpeningRoundCondition;var side: PlayerSide;var buy_type: String;var opponent_buy_type: String;var round_result: String;var round_phase: String;var hero: Bool
    var rounds: [Int];var stats: [String:Double];var weapons: [ComparisonWeaponStats]
}
struct RoundConditionMatch: Content { var id: Int64;var expected_rounds: Int;var covered_rounds: Int;var slices: [RoundConditionSlice] }
struct RoundConditionsResponse: Content { var player_id: Int64;var matches: [RoundConditionMatch] }
func roundConditionRoutes(_ app: Application) {
    app.get("players",":id","round-conditions") { request async throws -> Response in
        guard let id = request.parameters.get("id",as:Int64.self),id > 0 else { throw Abort(.badRequest) }
        guard let sql = request.db as? any SQLDatabase else { throw Abort(.internalServerError) }
        let timing = ProfileTimingRecorder(),start = timing.start()
        guard try await sql.raw("SELECT id FROM players WHERE id=\(bind:id)").first() != nil else { throw Abort(.notFound) }
        let totals = try await sql.raw("""
          SELECT mp.match_id,CAST(SUM(s.rounds_played) AS SIGNED) AS rounds FROM match_players mp
          JOIN player_side_stats s ON s.match_player_id=mp.id WHERE mp.player_id=\(bind:id) GROUP BY mp.match_id
          """).all()
        var expected: [Int64:Int] = [:]
        for row in totals { expected[try row.decode(column:"match_id",as:Int64.self)] = try row.decode(column:"rounds",as:Int.self) }
        let rosterRows = try await sql.raw("""
          SELECT p.match_id,p.player_slot,p.match_team_id FROM match_players p
          JOIN match_players own ON own.match_id=p.match_id WHERE own.player_id=\(bind:id)
          """).all()
        var teams: [Int64:[Int:Int64]] = [:]
        for row in rosterRows { teams[try row.decode(column:"match_id",as:Int64.self),default:[:]][try row.decode(column:"player_slot",as:Int.self)] = try row.decode(column:"match_team_id",as:Int64.self) }
        let read = timing.start()
        let rows = try await sql.raw("""
          SELECT r.match_id,r.round_number,r.side,r.buy_type,r.opponent_buy_type,r.round_result,
                 mp.player_slot,mp.match_team_id,CAST(r.stats_json AS CHAR) AS stats_json
          FROM player_round_phase_stats r JOIN match_players mp ON mp.id=r.match_player_id
          WHERE mp.player_id=\(bind:id) ORDER BY r.match_id,r.round_number
          """).all()
        timing.record("rounds",since:read)
        let build = timing.start();var groups: [Int64:[ConditionKey:RoundConditionSlice]] = [:],covered: [Int64:Int] = [:]
        for row in rows {
            // Missing legacy round payloads are unknown, never "no opening".
            guard let stats = try? replayDecode(row.decode(column:"stats_json",as:String.self),as:SideStatsPayload.self),let condition = openingRoundCondition(stats) else { continue }
            let match = try row.decode(column:"match_id",as:Int64.self),number = try row.decode(column:"round_number",as:Int.self)
            let side = try row.decode(column:"side",as:PlayerSide.self),buy = try row.decode(column:"buy_type",as:String?.self) ?? "UNKNOWN",enemy = try row.decode(column:"opponent_buy_type",as:String?.self) ?? "UNKNOWN",result = try row.decode(column:"round_result",as:String?.self) ?? "UNKNOWN",phase = number <= 24 ? "REGULATION":"OVERTIME"
            let key = ConditionKey(condition:condition,side:side.rawValue,buy:buy,enemyBuy:enemy,result:result,phase:phase,hero:stats.hero == true)
            var slice = groups[match]?[key] ?? RoundConditionSlice(condition:condition,side:side,buy_type:buy,opponent_buy_type:enemy,round_result:result,round_phase:phase,hero:stats.hero == true,rounds:[],stats:[:],weapons:[])
            let flat = flattenedConditionStats(stats,ownSlot:try row.decode(column:"player_slot",as:Int.self),ownTeam:try row.decode(column:"match_team_id",as:Int64.self),teams:teams[match] ?? [:])
            for (name,amount) in flat where amount != 0 {
                if name.hasSuffix("_max") { slice.stats[name] = max(slice.stats[name] ?? 0,amount) } else { slice.stats[name,default:0] += amount }
            }
            for weapon in stats.weapons {
                if let index = slice.weapons.firstIndex(where:{$0.weapon == weapon.weapon}) {
                    slice.weapons[index].kills += weapon.kills;slice.weapons[index].shots += weapon.shots;slice.weapons[index].hits += weapon.hits;slice.weapons[index].damage += weapon.damage;slice.weapons[index].roundsUsed += weapon.roundsUsed
                } else { slice.weapons.append(ComparisonWeaponStats(weapon:weapon.weapon,kills:weapon.kills,shots:weapon.shots,hits:weapon.hits,damage:weapon.damage,roundsUsed:weapon.roundsUsed)) }
            }
            slice.rounds.append(number);groups[match,default:[:]][key] = slice;covered[match,default:0] += 1
        }
        timing.record("build",since:build)
        let payload = RoundConditionsResponse(player_id:id,matches:expected.keys.sorted().map { match in
            RoundConditionMatch(id:match,expected_rounds:expected[match] ?? 0,covered_rounds:covered[match] ?? 0,slices:(groups[match]?.values.map{$0} ?? []).sorted { ($0.rounds.first ?? 0) < ($1.rounds.first ?? 0) })
        })
        let encode = timing.start(),response = Response(status:.ok,body:.init(string:try replayText(payload)))
        timing.record("encode",since:encode);timing.record("total",since:start)
        response.headers.contentType = .json;response.headers.replaceOrAdd(name:"Cache-Control",value:"no-store");response.headers.replaceOrAdd(name:"Server-Timing",value:timing.serverTimingHeader())
        return response
    }
}
