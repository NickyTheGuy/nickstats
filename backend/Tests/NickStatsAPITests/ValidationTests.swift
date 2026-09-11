import Foundation
import Testing
@testable import NickStatsAPI

private func emptySide() -> SideStatsPayload {
    SideStatsPayload(
        rounds: RoundRecord(played: 0, won: 0),
        combat: CombatStats(kills: 0, deaths: 0, assists: 0, headshots: 0, damage: 0),
        kastRounds: 0, opening: OpeningStats(kills: 0, deaths: 0), tradeKills: 0,
        tradeDeaths: TradeDeathStats(tradeable: 0, attempted: 0, traded: 0),
        utility: UtilityDamage(highExplosive: 0, fire: 0),
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
        weapons: [], duels: [], trades: [], contexts: [], assistedBy: [], flashes: []
    )
}

private func validPayload() -> MatchPayload {
    MatchPayload(
        schema: compactSchema,
        nickstatsBuild: "2026.09.10",
        parser: ParserMetadata(name: "@deademx/cs2", version: "4.0.0"),
        id: MatchIdentity(faceit: "1-abc", sha256: String(repeating: "a", count: 64)),
        map: "de_mirage",
        playedAt: 1_757_462_400,
        playedAtSource: "zip_extended_mtime",
        rounds: 1,
        rules: ParserRules(
            trade: TradeRules(
                windowSeconds: 5, proximityUnits: 250, engagementLullSeconds: 2,
                bulletPathToleranceUnits: 96, unarmoredHEDamageCap: 98, armoredHEDamageCap: 57
            ),
            movement: MovementRules(
                stillSpeedToleranceUnitsPerSecond: 1, runningThresholdPercentOfWeaponMax: 0.34
            ),
            equipmentDisadvantageSeconds: 2
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
                sides: PlayerSideStats(terrorist: emptySide(), counterTerrorist: emptySide())
            ),
            PlayerPayload(
                name: "Two", steamID: "76561198000000002", bot: nil,
                sides: PlayerSideStats(terrorist: emptySide(), counterTerrorist: emptySide())
            ),
            PlayerPayload(
                name: "Three", steamID: "76561198000000003", bot: nil,
                sides: PlayerSideStats(terrorist: emptySide(), counterTerrorist: emptySide())
            ),
            PlayerPayload(
                name: "BOT", steamID: nil, bot: true,
                sides: PlayerSideStats(terrorist: emptySide(), counterTerrorist: emptySide())
            )
        ]
    )
}

@Test func acceptsValidCompactMatch() throws {
    try validPayload().validate()
}

@Test func acceptsLegacyPayloadWithoutClutchAttempts() throws {
    let data = try JSONEncoder().encode(validPayload())
    let decoded = try JSONDecoder().decode(MatchPayload.self, from: data)
    #expect(decoded.players[0].sides.terrorist.clutchAttempts == nil)
    try decoded.validate()
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

    let data = try JSONEncoder().encode(payload)
    let object = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
    #expect(object["parser"] as? [String] == ["@deademx/cs2", "4.0.0"])

    let players = try #require(object["players"] as? [[String: Any]])
    let sides = try #require(players[0]["sides"] as? [[String: Any]])
    #expect(sides[0]["duels"] as? [[Int]] == [[2, 3]])
    #expect(sides[0]["trades"] as? [[Int]] == [[1, 4, 3, 2]])
    #expect(sides[0]["clutch_attempts"] as? [Int] == [2, 1, 0, 0, 0])

    let decoded = try JSONDecoder().decode(MatchPayload.self, from: data)
    #expect(decoded.players[0].sides.terrorist.duels[0].opponentPlayerIndex == 2)
    #expect(decoded.players[0].sides.terrorist.trades[0].successes == 2)
    #expect(decoded.players[0].sides.terrorist.clutchAttempts?.oneVersusTwo == 1)
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
