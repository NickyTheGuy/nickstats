import Foundation
import Testing
@testable import NickStatsAPI

private struct IndependentProfileGroup: Decodable {
    var players: [LayoutPlayerProfileDataResponse]
}

private func assemblyFixture() -> ComparisonResponse {
    let counters: [[String: Double]] = [["kills": 0, "deaths": 2], ["kills": 3, "damage": 80], [:]]
    return ComparisonResponse(players: counters.enumerated().map { index, stats in
        let id = Int64(index + 1)
        let match = ComparisonMatch(id: 10, schema: "nickstats.match/27", playedAt: nil,
            map: "de_mirage", result: "w", scoreFor: 13, scoreAgainst: 7,
            teammateIDs: [9], rounds: 20, kills: 0, deaths: 0, assists: 0, headshots: 0,
            damage: 0, kastRounds: 0, sides: [ComparisonSideStats(side: .terrorist,
                buyType: "ALL", opponentBuyType: "ALL", roundResult: "ALL", hero: true,
                stats: stats, weapons: [])], roundKills: [])
        return ComparisonPlayer(id: id, steamID: String(id), name: "Name \"\\\nĀ\(id)", matches: [match])
    })
}

@Test func encodedProfilesAssembleIntoAnyRosterWithoutRemappingLayouts() throws {
    let original = assemblyFixture()
    let fragments = try original.players.map { player in
        try JSONEncoder().encode(LayoutPlayerProfileDataResponse(.init(
            player: .init(id: player.id, steamID: player.steamID, name: player.name, firstSeenAt: nil, lastSeenAt: nil),
            matches: player.matches)))
    }
    let group = try JSONDecoder().decode(IndependentProfileGroup.self,
        from: assembleProfileGroup([fragments[2], fragments[0]]))
    #expect(group.players.map { $0.player.id } == [3, 1])
    #expect(group.players[1].player.name == original.players[0].name)
    #expect(group.players[1].matches[0].teammate_ids == [9])
    #expect(group.players[1].matches[0].sides[0].hero)
    #expect(group.players[0].stat_keys.isEmpty)
    #expect(group.players[0].matches[0].sides[0].stats.isEmpty)
    let second = group.players[1]
    let side = second.matches[0].sides[0]
    let names = second.stat_layouts[side.stat_layout].map { second.stat_keys[$0] }
    #expect(Dictionary(uniqueKeysWithValues: zip(names, side.stats)) == ["kills": 0, "deaths": 2])
    let empty = try JSONDecoder().decode(IndependentProfileGroup.self, from: assembleProfileGroup([]))
    #expect(empty.players.isEmpty)
}

@Test func assemblyBenchmarkChecksRealCountersAndIncludesWarmDifferentRosters() throws {
    let report = try benchmarkGroupAssembly(assemblyFixture())
    #expect(report.verified_counters == 4)
    #expect(report.trials.count == 5)
    #expect(report.players == 3)
    #expect(report.player_match_entries == 3)
    let cold = try #require(report.trials.first { $0.format == "per_player_cold" })
    let warm = try #require(report.trials.first { $0.format == "per_player_warm" })
    #expect(cold.bytes == warm.bytes)
    #expect(cold.encoded_players == 3)
    #expect(warm.encoded_players == 0)
    #expect(warm.reused_players == 3)
    let different = try #require(report.trials.first { $0.format == "different_roster_warm" })
    #expect(different.reused_players == 2)
    #expect(different.encoded_players == 0)
    #expect(different.bytes < cold.bytes)
}
