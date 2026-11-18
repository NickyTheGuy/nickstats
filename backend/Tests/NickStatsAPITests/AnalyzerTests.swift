import Foundation
import Testing
@testable import NickStatsAPI

private func analyzerRound() throws -> ReplayJSON {
    try replayDecode("""
    {"number":1,"duration":1000,"winner":"CT","tracks":[{"player":"steam:1","samples":[[0,0,0,0,100,3,null],[200,1,0,0,100,3,45]]}],
    "context":[{"player":"steam:1","side":3,"result":"win","buy":"full","enemy_buy":"eco","hero":false}],
    "firing":[],"utility":[],"projectiles":[],"deaths":[{"time":500,"victim":"steam:2","killer":"steam:1","victim_side":2,"killer_side":3,"x":1,"y":0,"z":0,"from":[0,0,0],"weapon":"ak47","headshot":true}]}
    """,as:ReplayJSON.self)
}
@Test func replayRoundIndexesAreDerivedFromValidatedSamplesAndContext() throws {
    let round = try analyzerRound()
    let (summary,samples) = try replayRoundSummary(round,players:["steam:1","steam:2"])
    #expect(samples == 2)
    #expect(summary["number"].integer == 1)
    #expect(summary["player_ids"] == .array([.string("steam:1")]))
    #expect(summary["context"] == round["context"])
    #expect(try replayDecode(replayText(round),as:ReplayJSON.self) == round)
}
@Test func replayPublicationRejectsInvalidOwnershipCoordinatesTimingAndContexts() throws {
    let round = try analyzerRound()
    #expect(throws:(any Error).self) { try replayRoundSummary(round,players:["steam:2"]) }
    let patches: [[String:ReplayJSON]] = [
        ["duration":.number(-1)],
        ["tracks":.array([.object(["player":.string("steam:1"),"samples":.array([.array([.number(0),.number(99999),.number(0),.number(0),.number(100),.number(3),.null])])])])],
        ["context":.array([.object(["player":.string("steam:1"),"side":.number(9)])])]
    ]
    for patch in patches {
        let bad = ReplayJSON.object(round.object!.merging(patch) { _,new in new })
        #expect(throws:(any Error).self) { try replayRoundSummary(bad,players:["steam:1","steam:2"]) }
    }
}
@Test func replayProjectionKeepsKillVictimIdentityButOnlyRequestedMovement() throws {
    let round = try analyzerRound()
    let one = projectReplayRound(round,players:["steam:1"])
    #expect(one["tracks"].array?.count == 1)
    #expect(one["deaths"].array?.first?["victim"].string == "steam:2")
    let two = projectReplayRound(round,players:["steam:2"])
    #expect(two["tracks"].array?.isEmpty == true)
    #expect(two["deaths"].array?.count == 1)
    #expect(projectReplayRound(round,players:["steam:3"])["deaths"].array?.isEmpty == true)
    #expect(projectReplayRound(round,players:nil) == round)
}
