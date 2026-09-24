import Foundation
import Testing
@testable import NickStatsAPI

private func emptySide() -> SideStatsPayload {
    var value = SideStatsPayload(
        rounds: RoundRecord(played: 0, won: 0),
        combat: CombatStats(kills: 0, deaths: 0, assists: 0, headshots: 0, damage: 0),
        kastRounds: 0, opening: OpeningStats(kills: 0, deaths: 0), tradeKills: 0,
        tradeDeaths: TradeDeathStats(tradeable: 0, attempted: 0, traded: 0),
        utility: UtilityDamage(highExplosive: 0, fire: 0),
        damageReceived: 0, utilityThrown: .zero, objectives: .zero,
        speed: SpeedStats(
            kills: SpeedSummary(
                total: 0, samples: 0, maximum: nil,
                percentOfMaximumTotal: 0, percentOfMaximumSamples: 0, percentOfMaximumPeak: nil
            ),
            deaths: SpeedSummary(
                total: 0, samples: 0, maximum: nil,
                percentOfMaximumTotal: 0, percentOfMaximumSamples: 0, percentOfMaximumPeak: nil
            )
        ),
        clutches: ClutchWins(
            oneVersusOne: 0, oneVersusTwo: 0, oneVersusThree: 0,
            oneVersusFour: 0, oneVersusFive: 0
        ),
        killRounds: KillRoundCounts(oneKill: 0, twoKills: 0, threeKills: 0, fourKills: 0, fiveKills: 0),
        trueKillRounds: .zero,
        weapons: [], duels: [], trades: [], contexts: [], assistedBy: [], flashes: []
    )
    value.profile = Array(repeating: 0, count: 16)
    value.trueMultikillRounds = 0
    return value
}

private func validPayload() -> MatchPayload {
    MatchPayload(
        schema: "nickstats.match/21",
        nickstatsBuild: "2026.09.10",
        parser: ParserMetadata(name: "@deademx/cs2", version: "4.0.0"),
        id: MatchIdentity(faceit: "1-abc", sha256: String(repeating: "a", count: 64)),
        map: "de_mirage",
        playedAt: 1_757_462_400,
        playedAtSource: "zip_extended_mtime",
        rounds: 1,
        roundTiming: [RoundTimingPayload(
            round: 1, liveStartTick: 100, endTick: 200, durationMilliseconds: 1_562,
            winnerSide: .terrorist, bombPlantElapsedMilliseconds: nil
        )],
        roundSurvivors: [RoundSurvivorPayload(round: 1, terroristAlive: 2, counterTerroristAlive: 0)],
        roundEconomy: [RoundEconomyPayload(
            round: 1, terroristEquipmentValue: 4_100, counterTerroristEquipmentValue: 3_800,
            terroristPlayers: 2, counterTerroristPlayers: 2, pistolRound: true,
            terroristTeamIndex: 0, counterTerroristTeamIndex: 1
        )],
        deathEvents: [],
        rules: ParserRules(
            trade: TradeRules(
                windowSeconds: 5, proximityUnits: 250, engagementLullSeconds: 2,
                bulletPathToleranceUnits: 96, unarmoredHEDamageCap: 98, armoredHEDamageCap: 57
            ),
            movement: MovementRules(
                stillSpeedToleranceUnitsPerSecond: 1, runningThresholdPercentOfWeaponMax: 0.34
            ),
            equipmentDisadvantageSeconds: 1.4
        ),
        teams: [
            TeamPayload(
                id: "2", name: "Alpha", score: 1,
                sideScores: SideScores(terrorist: 1, counterTerrorist: 0), players: [0, 1]
            ),
            TeamPayload(
                id: "3", name: "Bravo", score: 0,
                sideScores: SideScores(terrorist: 0, counterTerrorist: 0), players: [2, 3]
            )
        ],
        players: [
            PlayerPayload(
                name: "One", steamID: "76561198000000001", bot: nil,
                sides: PlayerSideStats(terrorist: emptySide(), counterTerrorist: emptySide()), buys: Array(repeating: emptySide(), count: 8), roundResults: Array(repeating: emptySide(), count: 20), economyMatchups: []
            ),
            PlayerPayload(
                name: "Two", steamID: "76561198000000002", bot: nil,
                sides: PlayerSideStats(terrorist: emptySide(), counterTerrorist: emptySide()), buys: Array(repeating: emptySide(), count: 8), roundResults: Array(repeating: emptySide(), count: 20), economyMatchups: []
            ),
            PlayerPayload(
                name: "Three", steamID: "76561198000000003", bot: nil,
                sides: PlayerSideStats(terrorist: emptySide(), counterTerrorist: emptySide()), buys: Array(repeating: emptySide(), count: 8), roundResults: Array(repeating: emptySide(), count: 20), economyMatchups: []
            ),
            PlayerPayload(
                name: "BOT", steamID: nil, bot: true,
                sides: PlayerSideStats(terrorist: emptySide(), counterTerrorist: emptySide()), buys: Array(repeating: emptySide(), count: 8), roundResults: Array(repeating: emptySide(), count: 20), economyMatchups: []
            )
        ]
    )
}

private func comparisonMatch(id: Int64, playedAt: Int64, kills: Double) -> ComparisonMatch {
    ComparisonMatch(
        id: id,
        schema: compactSchema,
        playedAt: playedAt,
        map: "de_mirage",
        result: "w",
        scoreFor: 13,
        scoreAgainst: 7,
        teammateIDs: [],
        rounds: 20,
        kills: Int(kills),
        deaths: 10,
        assists: 3,
        headshots: 5,
        damage: 1_500,
        kastRounds: 15,
        sides: [ComparisonSideStats(
            side: .terrorist,
            buyType: "ALL",
            opponentBuyType: "ALL",
            roundResult: "ALL",
            stats: ["kills": kills],
            weapons: []
        )],
        roundKills: []
    )
}

@Test func acceptsValidCompactMatch() throws {
    try validPayload().validate()
}

@Test func acceptsRoundPhaseSlicesAndRejectsDuplicatePlayedRounds() throws {
    var payload = validPayload()
    payload.schema = compactSchema
    for index in payload.players.indices { payload.players[index].roundSlices = [] }
    var played = emptySide()
    played.rounds = RoundRecord(played: 1, won: 1)
    payload.players[0].sides.terrorist = played
    payload.players[0].buys![0] = played
    payload.players[0].roundResults![0] = played
    payload.players[0].roundResults![4] = played
    payload.players[0].economyMatchups = [EconomyMatchupStats(
        ownBuyIndex: 0, opponentBuyIndex: 0, resultIndex: 0, sideIndex: 0, stats: played
    )]
    let slice = PlayerRoundSlice(round: 1, side: .terrorist, buy: "pistol",
                                 opponentBuy: "pistol", result: "win", stats: played, hero: false)
    payload.players[0].roundSlices = [slice]
    try payload.validate()
    payload.players[0].roundSlices![0].hero = nil
    #expect(throws: MatchValidationError.self) { try payload.validate() }
    payload.schema = "nickstats.match/22"
    try payload.validate()
    payload.schema = compactSchema
    payload.players[0].roundSlices![0].hero = false
    payload.players[0].roundSlices = [slice, slice]
    #expect(throws: MatchValidationError.self) { try payload.validate() }
}

@Test func profileCacheAccumulatesMatchesAndRejectsAnOutdatedRefresh() async throws {
    let cache = ProfileResponseCache(maximumEntries: 2)
    let identity = PlayerProfileIdentity(
        id: 7, steamID: "76561198000000007", name: "Seven",
        firstSeenAt: 100, lastSeenAt: 200
    )
    let dense = DensePlayerProfileDataResponse(PlayerProfileDataResponse(
        player: identity,
        matches: [comparisonMatch(id: 10, playedAt: 100, kills: 10)]
    ))
    let data = try JSONEncoder().encode(dense)
    let initial = await cache.lookup(playerID: 7, wireVersion: 2)
    await cache.insert(data, profile: dense, playerID: 7, wireVersion: 2, version: initial.version)

    await cache.markChanged([
        ProfileMatchChange(matchID: 11, playerIDs: [7]),
        ProfileMatchChange(matchID: 12, playerIDs: [7])
    ])
    let stale = await cache.lookup(playerID: 7, wireVersion: 2)
    #expect(stale.staleMatchIDs == [11, 12])

    await cache.markChanged([ProfileMatchChange(matchID: 13, playerIDs: [7])])
    await cache.insert(data, profile: dense, playerID: 7, wireVersion: 2, version: stale.version)
    let stillStale = await cache.lookup(playerID: 7, wireVersion: 2)
    #expect(stillStale.staleMatchIDs == [11, 12, 13])
}

@Test func denseProfileRefreshReplacesAllPendingMatchesAndPreservesOrdering() {
    let oldIdentity = PlayerProfileIdentity(
        id: 7, steamID: "76561198000000007", name: "Old",
        firstSeenAt: 100, lastSeenAt: 200
    )
    let cached = DensePlayerProfileDataResponse(PlayerProfileDataResponse(
        player: oldIdentity,
        matches: [
            comparisonMatch(id: 10, playedAt: 100, kills: 10),
            comparisonMatch(id: 11, playedAt: 200, kills: 11)
        ]
    ))
    let newIdentity = PlayerProfileIdentity(
        id: 7, steamID: "76561198000000007", name: "New",
        firstSeenAt: 100, lastSeenAt: 300
    )
    let refreshed = DensePlayerProfileDataResponse(
        refreshing: cached,
        player: newIdentity,
        replacingMatchIDs: [11, 12],
        with: [
            comparisonMatch(id: 11, playedAt: 250, kills: 21),
            comparisonMatch(id: 12, playedAt: 300, kills: 12)
        ]
    )

    #expect(refreshed.player.name == "New")
    #expect(refreshed.matches.map(\.id) == [12, 11, 10])
    #expect(refreshed.matches.count == 3)
}

@Test func rejectsOpeningAssistCountsThatExceedOpeningKills() {
    var payload = validPayload()
    payload.players[0].sides.terrorist.opening = OpeningStats(
        kills: 1, deaths: 0, assistedKills: 2, damageAssistedKills: 1, flashAssistedKills: 1
    )
    #expect(throws: MatchValidationError.self) { try payload.validate() }
}

@Test func rejectsOpeningFlashSourceCountsThatExceedBlindOpenings() {
    var payload = validPayload()
    payload.players[0].sides.terrorist.opening = OpeningStats(
        kills: 1, deaths: 0, blindedEnemyKills: 0, ownFlashKills: 1
    )
    #expect(throws: MatchValidationError.self) { try payload.validate() }
}

@Test func acceptsLegacyPayloadWithoutClutchAttempts() throws {
    var legacyPayload = validPayload()
    legacyPayload.schema = "nickstats.match/9"
    legacyPayload.roundTiming = nil
    legacyPayload.roundSurvivors = nil
    legacyPayload.roundEconomy = nil
    legacyPayload.deathEvents = nil
    let data = try JSONEncoder().encode(legacyPayload)
    let decoded = try JSONDecoder().decode(MatchPayload.self, from: data)
    #expect(decoded.players[0].sides.terrorist.clutchAttempts == nil)
    try decoded.validate()
}

@Test func acceptsSchemaTenTimingWithoutRoundSurvivors() throws {
    var payload = validPayload()
    payload.schema = "nickstats.match/10"
    payload.roundSurvivors = nil
    payload.roundEconomy = nil
    try payload.validate()
}

@Test func acceptsSchemaElevenWithoutRoundEconomy() throws {
    var payload = validPayload()
    payload.schema = "nickstats.match/11"
    payload.roundEconomy = nil
    try payload.validate()
}

@Test func rejectsDeathWithoutMatchingRoundTiming() {
    var payload = validPayload()
    payload.roundTiming = []
    payload.roundSurvivors = []
    payload.deathEvents = [DeathEventPayload(
        round: 1, sequence: 0, tick: 150, elapsedMilliseconds: 781,
        killerPlayerIndex: 0, victimPlayerIndex: 2, killerSide: .terrorist,
        victimSide: .counterTerrorist, weapon: "ak47", enemyKill: true,
        flags: 1, terroristAliveBefore: 2, counterTerroristAliveBefore: 2,
        sincePlantMilliseconds: nil
    )]
    #expect(throws: MatchValidationError.self) { try payload.validate() }
}

@Test func rejectsMissingRoundSurvivorRow() {
    var payload = validPayload()
    payload.roundSurvivors = []
    #expect(throws: MatchValidationError.self) { try payload.validate() }
}

@Test func rejectsMissingRoundEconomyRow() {
    var payload = validPayload()
    payload.roundEconomy = []
    #expect(throws: MatchValidationError.self) { try payload.validate() }
}

@Test func rejectsMisclassifiedPistolRound() {
    var payload = validPayload()
    payload.roundEconomy?[0].pistolRound = false
    #expect(throws: MatchValidationError.self) { try payload.validate() }
}

@Test func decodesLegacyAndCurrentWeaponRows() throws {
    let legacy = try JSONDecoder().decode(WeaponPayload.self, from: Data(#"["ak47",3,20,275,8]"#.utf8))
    #expect(legacy.hits == 0)
    let current = try JSONDecoder().decode(WeaponPayload.self, from: Data(#"["ak47",3,20,275,8,7]"#.utf8))
    #expect(current.hits == 7)
}

@Test func rejectsDuplicateTeamMembership() {
    var payload = validPayload()
    payload.teams[1].players = [1, 2, 3]
    #expect(throws: MatchValidationError.self) { try payload.validate() }
}

@Test func rejectsInvalidRelationshipIndex() {
    var payload = validPayload()
    payload.players[0].sides.terrorist.duels = [DuelStats(opponentPlayerIndex: 99, kills: 1)]
    #expect(throws: MatchValidationError.self) { try payload.validate() }
}

@Test func rejectsImpossibleTradeCounts() {
    var payload = validPayload()
    payload.players[0].sides.terrorist.trades = [
        TradeStats(teammatePlayerIndex: 1, opportunities: 2, attempts: 3, successes: 1)
    ]
    #expect(throws: MatchValidationError.self) { try payload.validate() }
}

@Test func rejectsClutchWinsWithoutEnoughAttempts() {
    var payload = validPayload()
    payload.players[0].sides.terrorist.clutches = ClutchWins(
        oneVersusOne: 1, oneVersusTwo: 0, oneVersusThree: 0,
        oneVersusFour: 0, oneVersusFive: 0
    )
    payload.players[0].sides.terrorist.clutchAttempts = ClutchWins.zero
    #expect(throws: MatchValidationError.self) { try payload.validate() }
}

@Test func flattensFilteredClutchSizesUsingComparisonMetricNames() {
    var stats = emptySide()
    stats.clutches = ClutchWins(
        oneVersusOne: 1, oneVersusTwo: 2, oneVersusThree: 3,
        oneVersusFour: 4, oneVersusFive: 5
    )
    stats.clutchAttempts = ClutchWins(
        oneVersusOne: 6, oneVersusTwo: 7, oneVersusThree: 8,
        oneVersusFour: 9, oneVersusFive: 10
    )

    let flattened = flattenedBuyStats(stats)

    for size in 1...5 {
        #expect(flattened["clutch_1v\(size)"] == Double(size))
        #expect(flattened["clutch_attempt_1v\(size)"] == Double(size + 5))
    }
    #expect(flattened["clutch_2v2"] == nil)
    #expect(flattened["clutch_attempt_2v2"] == nil)
}

@Test func allowsBotAndSelfDuel() throws {
    var payload = validPayload()
    payload.players[3].sides.terrorist.duels = [DuelStats(opponentPlayerIndex: 3, kills: 1)]
    try payload.validate()
}

@Test func preservesCompactJSONWireFormat() throws {
    var payload = validPayload()
    payload.players[0].sides.terrorist.duels = [DuelStats(opponentPlayerIndex: 2, kills: 3)]
    payload.players[0].sides.terrorist.trades = [
        TradeStats(teammatePlayerIndex: 1, opportunities: 4, attempts: 3, successes: 2)
    ]
    payload.players[0].sides.terrorist.clutches = ClutchWins(
        oneVersusOne: 1, oneVersusTwo: 0, oneVersusThree: 0,
        oneVersusFour: 0, oneVersusFive: 0
    )
    payload.players[0].sides.terrorist.clutchAttempts = ClutchWins(
        oneVersusOne: 2, oneVersusTwo: 1, oneVersusThree: 0,
        oneVersusFour: 0, oneVersusFive: 0
    )
    payload.deathEvents = [DeathEventPayload(
        round: 1, sequence: 0, tick: 150, elapsedMilliseconds: 781,
        killerPlayerIndex: 0, victimPlayerIndex: 2, killerSide: .terrorist,
        victimSide: .counterTerrorist, weapon: "ak47", enemyKill: true,
        flags: 1, terroristAliveBefore: 2, counterTerroristAliveBefore: 2,
        sincePlantMilliseconds: nil
    )]

    let data = try JSONEncoder().encode(payload)
    let object = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
    #expect(object["parser"] as? [String] == ["@deademx/cs2", "4.0.0"])

    let players = try #require(object["players"] as? [[String: Any]])
    let sides = try #require(players[0]["sides"] as? [[String: Any]])
    #expect(sides[0]["duels"] as? [[Int]] == [[2, 3]])
    #expect(sides[0]["trades"] as? [[Int]] == [[1, 4, 3, 2, 0]])
    #expect((sides[0]["opening"] as? [Int])?.count == 23)
    #expect(sides[0]["clutch_attempts"] as? [Int] == [2, 1, 0, 0, 0])
    #expect(object["round_timing"] as? [[Any]] != nil)
    #expect(object["round_survivors"] as? [[Int]] == [[1, 2, 0]])
    let economy = try #require(object["round_economy"] as? [[Any]])
    #expect(economy.count == 1)
    #expect(economy[0][0] as? Int == 1)
    #expect(economy[0][5] as? Bool == true)
    #expect(object["death_events"] as? [[Any]] != nil)

    let decoded = try JSONDecoder().decode(MatchPayload.self, from: data)
    #expect(decoded.players[0].sides.terrorist.duels[0].opponentPlayerIndex == 2)
    #expect(decoded.players[0].sides.terrorist.trades[0].successes == 2)
    #expect(decoded.players[0].sides.terrorist.clutchAttempts?.oneVersusTwo == 1)
    #expect(decoded.deathEvents?.first?.elapsedMilliseconds == 781)
    #expect(decoded.roundSurvivors?.first?.terroristAlive == 2)
    #expect(decoded.roundEconomy?.first?.terroristEquipmentValue == 4_100)
}

private func validFaceitDatePayload() -> FaceitDateSyncPayload {
    FaceitDateSyncPayload(
        schema: faceitDateSyncSchema,
        timezone: "America/New_York",
        matches: [
            FaceitDateMetadata(
                faceitMatchID: "1-dbf7b382-0e6f-4298-b397-ebc5343e8ec9",
                playedAt: 1_789_096_760,
                displayedAt: "Thu 10 Sep 23:26"
            )
        ]
    )
}

@Test func acceptsValidFaceitDateSyncPayload() throws {
    try validFaceitDatePayload().validate(now: Date(timeIntervalSince1970: 1_789_200_000))
}

@Test func rejectsDuplicateFaceitDateSyncIDs() {
    var payload = validFaceitDatePayload()
    payload.matches.append(payload.matches[0])
    #expect(throws: MatchValidationError.self) {
        try payload.validate(now: Date(timeIntervalSince1970: 1_789_200_000))
    }
}

@Test func rejectsMalformedFaceitDateSyncID() {
    var payload = validFaceitDatePayload()
    payload.matches[0].faceitMatchID = "not-a-match"
    #expect(throws: MatchValidationError.self) {
        try payload.validate(now: Date(timeIntervalSince1970: 1_789_200_000))
    }
}

@Test func rejectsImplausibleFutureFaceitDate() {
    var payload = validFaceitDatePayload()
    payload.matches[0].playedAt = 1_789_400_000
    #expect(throws: MatchValidationError.self) {
        try payload.validate(now: Date(timeIntervalSince1970: 1_789_200_000))
    }
}
