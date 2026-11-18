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


@Test func replayChunkAssemblyVerifiesUploadsAndBoundsPublishedReads() throws {
    let chunks = [ReplayStoredChunk(part:0,body:"abc"),ReplayStoredChunk(part:1,body:"def")]
    let manifest = ReplayRoundManifest(number:1,parts:2,bytes:6,sha256:replayDigest(Data("abcdef".utf8)),summary:.null)
    #expect(try assembleReplayRound(chunks,manifest:manifest,verifyChecksum:true) == Data("abcdef".utf8))
    #expect(try assembleReplayRound(chunks,manifest:manifest,verifyChecksum:false) == Data("abcdef".utf8))
    let corrupt = [ReplayStoredChunk(part:0,body:"abx"),chunks[1]]
    #expect(throws:(any Error).self) { try assembleReplayRound(corrupt,manifest:manifest,verifyChecksum:true) }
    for bad in [[chunks[0]],[chunks[1],chunks[0]],[ReplayStoredChunk(part:0,body:"toolong"),chunks[1]]] {
        #expect(throws:(any Error).self) { try assembleReplayRound(bad,manifest:manifest,verifyChecksum:false) }
    }
}


@Test func numericFirstReplayDecodingKeepsNumbersBooleansStringsAndNullDistinct() throws {
    let value = try replayDecode("[0,1,-42,12.5,true,false,\"1\",null,[2,3]]",as:ReplayJSON.self)
    #expect(value == .array([.number(0),.number(1),.number(-42),.number(12.5),.bool(true),.bool(false),.string("1"),.null,.array([.number(2),.number(3)])]))
    #expect(try replayDecode(replayText(value),as:ReplayJSON.self) == value)
}


@Test func optionalRoundPerformanceIsValidatedAndProjectedByPlayer() throws {
    let round = try analyzerRound()
    let stats: ReplayJSON = .object(["player":.string("steam:1"),"kills":.number(2),"deaths":.number(1),"assists":.number(1),"damage":.number(150),"kast":.number(1)])
    var object = round.object!;object["performance"] = .array([stats])
    _ = try replayRoundSummary(.object(object),players:["steam:1","steam:2"])
    #expect(projectReplayRound(.object(object),players:["steam:1"])["performance"] == .array([stats]))
    #expect(projectReplayRound(.object(object),players:["steam:2"])["performance"] == .array([]))
    var invalid = stats.object!;invalid["kast"] = .number(2);object["performance"] = .array([.object(invalid)])
    #expect(throws:(any Error).self) { try replayRoundSummary(.object(object),players:["steam:1","steam:2"]) }
}


@Test func grenadeEffectivenessAndNullableRoundTotalsValidateWithoutLosingZero() throws {
    let round = try analyzerRound()
    let utility = try replayDecode("""
    {"type":"Flash","player":"steam:1","side":3,"time":0,"end":1000,"x":0,"y":0,"z":0,"icon":"flashbang","radius":0,"estimated":false,
     "effectiveness":{"enemies_flashed":0,"enemy_damage":null,"enemy_blind_ms":0}}
    """,as:ReplayJSON.self)
    var object = round.object!;object["utility"] = .array([utility])
    _ = try replayRoundSummary(.object(object),players:["steam:1","steam:2"])
    #expect(projectReplayRound(.object(object),players:["steam:1"])["utility"].array?.first?["effectiveness"]["enemies_flashed"].integer == 0)
    var invalid = utility.object!;invalid["effectiveness"] = .object([:]);object["utility"] = .array([.object(invalid)])
    #expect(throws:(any Error).self) { try replayRoundSummary(.object(object),players:["steam:1","steam:2"]) }
}
