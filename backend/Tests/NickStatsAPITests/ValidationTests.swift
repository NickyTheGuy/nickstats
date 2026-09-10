import Testing
@testable import NickStatsAPI

private func emptySide() -> SideStatsPayload {
    SideStatsPayload(
        rounds: [0, 0], kda: [0, 0, 0, 0, 0], kastRounds: 0,
        opening: [0, 0], tradeKills: 0, tradeD: [0, 0, 0], utility: [0, 0],
        speed: [0, 0, nil, 0, 0, nil, 0, 0, nil, 0, 0, nil],
        clutches: [0, 0, 0, 0, 0], killRounds: [0, 0, 0, 0, 0],
        weapons: [], duels: [], trades: [], contexts: [], assistedBy: [], flashes: []
    )
}

private func validPayload() -> MatchPayload {
    MatchPayload(
        schema: compactSchema,
        nickstatsBuild: "2026.09.10",
        parser: ["@deademx/cs2", "4.0.0"],
        id: MatchIdentity(faceit: "1-abc", sha256: String(repeating: "a", count: 64)),
        map: "de_mirage",
        playedAt: 1_757_462_400,
        playedAtSource: "zip_extended_mtime",
        rounds: 1,
        rules: ParserRules(
            trade: [250, 5, 96, 2, 98, 57], movement: [1, 0.34],
            equipmentDisadvantageSeconds: 2
        ),
        teams: [
            TeamPayload(id: "2", name: "Alpha", score: 1, sideScores: [1, 0], players: [0, 1]),
            TeamPayload(id: "3", name: "Bravo", score: 0, sideScores: [0, 0], players: [2, 3])
        ],
        players: [
            PlayerPayload(name: "One", steamID: "76561198000000001", bot: nil, sides: [emptySide(), emptySide()]),
            PlayerPayload(name: "Two", steamID: "76561198000000002", bot: nil, sides: [emptySide(), emptySide()]),
            PlayerPayload(name: "Three", steamID: "76561198000000003", bot: nil, sides: [emptySide(), emptySide()]),
            PlayerPayload(name: "BOT", steamID: nil, bot: true, sides: [emptySide(), emptySide()])
        ]
    )
}

@Test func acceptsValidCompactMatch() throws {
    try validPayload().validate()
}

@Test func rejectsDuplicateTeamMembership() {
    var payload = validPayload()
    payload.teams[1].players = [1, 2, 3]
    #expect(throws: MatchValidationError.self) { try payload.validate() }
}

@Test func rejectsInvalidRelationshipIndex() {
    var payload = validPayload()
    payload.players[0].sides[0].duels = [[99, 1]]
    #expect(throws: MatchValidationError.self) { try payload.validate() }
}

@Test func rejectsImpossibleTradeCounts() {
    var payload = validPayload()
    payload.players[0].sides[0].trades = [[1, 2, 3, 1]]
    #expect(throws: MatchValidationError.self) { try payload.validate() }
}

@Test func allowsBotAndSelfDuel() throws {
    var payload = validPayload()
    payload.players[3].sides[0].duels = [[3, 1]]
    try payload.validate()
}
