import Foundation
import Testing
@testable import NickStatsAPI

private func benchmarkFixture() -> ComparisonResponse {
    let sides = [
        ComparisonSideStats(side: .terrorist, buyType: "ALL", opponentBuyType: "ALL", roundResult: "ALL",
            roundPhase: "OT", hero: true, stats: ["kills": 2, "deaths": 0], weapons: []),
        ComparisonSideStats(side: .counterTerrorist, buyType: "FULL", opponentBuyType: "ECO", roundResult: "W",
            stats: ["kills": 0, "damage": 80], weapons: []),
        ComparisonSideStats(side: .terrorist, buyType: "ECO", opponentBuyType: "ALL", roundResult: "L",
            stats: ["deaths": 3, "kills": 1], weapons: []),
        ComparisonSideStats(side: .terrorist, buyType: "ALL", opponentBuyType: "ALL", roundResult: "ALL",
            stats: [:], weapons: [])
    ]
    let match = ComparisonMatch(id: 10, schema: "nickstats.match/27", playedAt: 123,
        map: "de_mirage", result: "w", scoreFor: 13, scoreAgainst: 7,
        teammateIDs: [2], opponentIDs: [3, 4], rounds: 20, kills: 3, deaths: 3, assists: 0, headshots: 0,
        damage: 80, kastRounds: 0, sides: sides, roundKills: [])
    return ComparisonResponse(players: [ComparisonPlayer(id: 1, steamID: "1", name: "One", matches: [match])])
}

@Test func sharedLayoutsRoundTripEveryCounterAndMatchField() throws {
    let original = benchmarkFixture()
    let candidate = LayoutComparisonResponse(original)
    #expect(candidate.stat_layouts.count == 3)
    #expect(candidate.players[0].matches[0].sides[0].stat_layout == candidate.players[0].matches[0].sides[2].stat_layout)
    let encoded = try JSONEncoder().encode(candidate)
    var json = try #require(JSONSerialization.jsonObject(with: encoded) as? [String: Any])
    var players = try #require(json["players"] as? [[String: Any]])
    for playerIndex in players.indices {
        var matches = try #require(players[playerIndex]["matches"] as? [[String: Any]])
        for matchIndex in matches.indices {
            var sides = try #require(matches[matchIndex]["sides"] as? [[String: Any]])
            for sideIndex in sides.indices {
                let layout = try #require(sides[sideIndex].removeValue(forKey: "stat_layout") as? Int)
                let values = try #require(sides[sideIndex]["stats"] as? [Double])
                let names = candidate.stat_layouts[layout].map { candidate.stat_keys[$0] }
                sides[sideIndex]["stats"] = Dictionary(uniqueKeysWithValues: zip(names, values))
            }
            matches[matchIndex]["sides"] = sides
        }
        players[playerIndex]["matches"] = matches
    }
    json["players"] = players
    json.removeValue(forKey: "stat_keys")
    json.removeValue(forKey: "stat_layouts")
    let expected = try JSONSerialization.jsonObject(with: JSONEncoder().encode(original)) as! NSDictionary
    #expect((json as NSDictionary).isEqual(expected))
}

@Test func groupBenchmarkMeasuresAllFormatsAndBothEncoders() throws {
    let report = try benchmarkGroupWire(benchmarkFixture())
    #expect(report.trials.count == 6)
    #expect(report.rows == 4)
    #expect(report.populated_slots == 6)
    #expect(report.padded_slots == 12)
    #expect(report.layouts == 3)
    #expect(Set(report.trials.map(\.format)) == ["verbose", "padded", "layouts"])
    #expect(Set(report.trials.map(\.encoder)) == ["vapor", "foundation"])
    #expect(report.trials.allSatisfy { $0.bytes > 0 && $0.encode_ms >= 0 && $0.conversion_ms >= 0 })
}
