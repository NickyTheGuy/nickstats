import Foundation
import Testing
@testable import NickStatsAPI

private func historyFixture(_ id: Int64 = 1, matchID: Int64 = 10, date: Int64? = 100) -> PlayerProfileDataResponse {
    let identity = PlayerProfileIdentity(id: id, steamID: String(id), name: "Player", firstSeenAt: nil, lastSeenAt: nil)
    let match = ComparisonMatch(id: matchID, schema: "nickstats.match/27", playedAt: date,
        map: "de_mirage", result: "w", scoreFor: 13, scoreAgainst: 7, teammateIDs: [2],
        rounds: 20, kills: 0, deaths: 1, assists: 0, headshots: 0, damage: 0, kastRounds: 0,
        sides: [ComparisonSideStats(side: .terrorist, buyType: "ALL", opponentBuyType: "ALL", roundResult: "ALL", stats: ["kills": 0], weapons: [])], roundKills: [])
    return .init(player: identity, matches: [match])
}

@Test func historyCacheInvalidatesAffectedPlayersAndRejectsRacingFills() async {
    let cache = PlayerHistoryCache()
    let token = await cache.lookup(1).generation
    await cache.insert(historyFixture(), generation: token)
    await cache.storeEncoded(Data([1]), playerID: 1, generation: token)
    await cache.insert(historyFixture(2), generation: token)
    #expect(await cache.lookup(1).data == Data([1]))
    await cache.markChanged([.init(matchID: 10, playerIDs: [1])])
    let stale = await cache.lookup(1)
    #expect(stale.staleMatchIDs == [10])
    #expect(stale.data == nil)
    #expect(stale.profile != nil)
    #expect(await cache.lookup(2).staleMatchIDs.isEmpty)
    await cache.insert(historyFixture(), generation: token)
    await cache.storeEncoded(Data([2]), playerID: 1, generation: token)
    #expect(await cache.lookup(1).staleMatchIDs == [10])
    await cache.insert(historyFixture(), generation: stale.generation)
    #expect(await cache.lookup(1).staleMatchIDs.isEmpty)
}

@Test func historyCacheBoundsCountersBytesEntriesAndExpires() async {
    let now = Date(timeIntervalSince1970: 1_000)
    let cache = PlayerHistoryCache(maximumEntries: 2, maximumCounters: 2, maximumBytes: 2, lifetime: 10)
    for id in [Int64(1), Int64(2)] { await cache.insert(historyFixture(id), generation: 0, now: now) }
    _ = await cache.lookup(1, now: now)
    await cache.insert(historyFixture(3), generation: 0, now: now)
    #expect(await cache.lookup(2, now: now).profile == nil)
    await cache.storeEncoded(Data([1, 2]), playerID: 1, generation: 0)
    await cache.storeEncoded(Data([1]), playerID: 3, generation: 0)
    #expect(await cache.lookup(1, now: now).data == nil)
    #expect(await cache.lookup(1, now: now).profile != nil)
    #expect(await cache.lookup(3, now: now.addingTimeInterval(11)).profile == nil)
    let noRoom = PlayerHistoryCache(maximumCounters: 0)
    await noRoom.insert(historyFixture(), generation: 0)
    #expect(await noRoom.lookup(1).profile == nil)
}

@Test func historyRefreshReplacesChangedMatchesKeepsOthersAndReordersDates() {
    var cached = historyFixture()
    cached.matches += historyFixture(matchID: 11, date: nil).matches
    let updated = historyFixture(matchID: 11, date: 200)
    let result = refreshedPlayerHistory(cached, identity: updated.player, replacing: [11], with: updated.matches)
    #expect(result.matches.map(\.id) == [11, 10])
    #expect(result.matches.count == 2)
    let removed = refreshedPlayerHistory(result, identity: updated.player, replacing: [11], with: [])
    #expect(removed.matches.map(\.id) == [10])
}

@Test func layoutProfilesPreserveIdentityAndStatisticAvailability() throws {
    let profile = historyFixture()
    let wire = LayoutPlayerProfileDataResponse(profile)
    #expect(wire.player.id == profile.player.id)
    #expect(wire.player.firstSeenAt == profile.player.firstSeenAt)
    #expect(wire.stat_keys == ["kills"])
    #expect(wire.matches[0].sides[0].stats == [0])
    let restored = try JSONDecoder().decode(LayoutPlayerProfileDataResponse.self, from: JSONEncoder().encode(wire))
    #expect(restored.matches[0].teammate_ids == [2])
}


@Test func encodedHistoriesSurviveRawEvictionAndInvalidateWithoutRawEntries() async {
    let cache = PlayerHistoryCache(maximumEntries: 8, maximumCounters: 1, maximumBytes: 64)
    let now = Date()
    await cache.insert(historyFixture(1), generation: 0, now: now)
    await cache.storeEncoded(Data([1]), playerID: 1, generation: 0, now: now)
    await cache.insert(historyFixture(2), generation: 0, now: now)
    await cache.storeEncoded(Data([2]), playerID: 2, generation: 0, now: now)
    #expect(await cache.lookup(1, now: now).profile == nil)
    #expect(await cache.lookup(1, now: now).data == Data([1]))
    #expect(await cache.lookup(2, now: now).data == Data([2]))
    await cache.markChanged([.init(matchID: 12, playerIDs: [1])])
    #expect(await cache.lookup(1, now: now).data == nil)
    #expect(await cache.lookup(2, now: now).data == Data([2]))
    await cache.storeEncoded(Data([9]), playerID: 1, generation: 0, now: now)
    #expect(await cache.lookup(1, now: now).data == nil)
    #expect(await cache.lookup(2, now: now.addingTimeInterval(301)).data == nil)
}

@Test func aNewSharedMatchInvalidatesBothPlayersAndRefreshPreservesPreviousMatches() async throws {
    let cache = PlayerHistoryCache()
    for id in [Int64(1), Int64(2)] {
        await cache.insert(historyFixture(id), generation: 0)
        await cache.storeEncoded(Data([UInt8(id)]), playerID: id, generation: 0)
    }
    await cache.markChanged([.init(matchID: 12, playerIDs: [1, 2])])
    for id in [Int64(1), Int64(2)] {
        let stale = await cache.lookup(id)
        #expect(stale.data == nil)
        #expect(stale.staleMatchIDs == [12])
        let old = try #require(stale.profile)
        let added = historyFixture(id, matchID: 12, date: 200)
        let refreshed = refreshedPlayerHistory(old, identity: added.player,
            replacing: stale.staleMatchIDs, with: added.matches)
        await cache.insert(refreshed, generation: stale.generation)
        #expect(await cache.lookup(id).profile?.matches.map(\.id) == [12, 10])
        #expect(await cache.lookup(id).staleMatchIDs.isEmpty)
    }
}
