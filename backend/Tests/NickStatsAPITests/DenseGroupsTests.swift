import Foundation
import Testing
@testable import NickStatsAPI

@Test func denseGroupsUseOneDictionaryAndRetainUnavailableVersusZeroCounters() throws {
    func match(_ stats: [String: Double]) -> ComparisonMatch {
        ComparisonMatch(id: 10, schema: "nickstats.match/27", playedAt: nil, map: "de_mirage", result: "w",
            scoreFor: 13, scoreAgainst: 7, teammateIDs: [2], rounds: 20, kills: 12, deaths: 0,
            assists: 0, headshots: 0, damage: 0, kastRounds: 0,
            sides: [ComparisonSideStats(side: .terrorist, buyType: "ALL", opponentBuyType: "ALL", roundResult: "ALL", stats: stats, weapons: [])], roundKills: [])
    }
    let response = DenseComparisonResponse(ComparisonResponse(players: [
        ComparisonPlayer(id: 1, steamID: "1", name: "One", matches: [match(["kills": 12, "deaths": 0])]),
        ComparisonPlayer(id: 2, steamID: "2", name: "Two", matches: [match(["kills": 0, "new_counter": 4])])
    ]))
    #expect(response.statKeys == ["deaths", "kills", "new_counter"])
    #expect(response.players[0].matches[0].sides[0].stats == [0, 12, nil])
    #expect(response.players[1].matches[0].sides[0].stats == [nil, 0, 4])
    #expect(response.players[0].matches[0].teammateIDs == [2])
    let data = try JSONEncoder().encode(response)
    let restored = try JSONDecoder().decode(DenseComparisonResponse.self, from: data)
    #expect(restored.players.count == 2)
    #expect(restored.statKeys == response.statKeys)
}
