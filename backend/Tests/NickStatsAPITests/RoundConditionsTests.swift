import Testing
@testable import NickStatsAPI

@Test func openingRoundCohortsPartitionKnownPlayerRoundsAndRejectInvalidAggregates() throws {
    var stats = try replayDecode("""
      {"rounds":[1,1],"kda":[3,0,1,1,250],"kast_rounds":1,"opening":[1,0],"trade_kills":0,"trade_d":[0,0,0],"utility":[0,0],
       "speed":[0,0,null,0,0,null,0,0,null,0,0,null],"clutches":[0,0,0,0,0],"kill_rounds":[0,0,1,0,0],
       "weapons":[],"duels":[],"trades":[],"contexts":[],"assisted_by":[],"flashes":[]}
      """,as:SideStatsPayload.self)
    #expect(openingRoundCondition(stats) == .kill)
    stats.opening = OpeningStats(kills:0,deaths:1);#expect(openingRoundCondition(stats) == .death)
    stats.opening = OpeningStats(kills:0,deaths:0);#expect(openingRoundCondition(stats) == .noAttempt)
    stats.opening = OpeningStats(kills:1,deaths:1);#expect(openingRoundCondition(stats) == nil)
    stats.opening = OpeningStats(kills:0,deaths:0);stats.rounds.played = 2;#expect(openingRoundCondition(stats) == nil)
}
