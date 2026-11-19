import Foundation
import Testing
@testable import NickStatsAPI

@Test func utilityIndexKeepsSeparateHEFlashAndBothFireGrenadesWithUnknowns() throws {
    let round = try replayDecode("""
    {"number":1,"utility":[
      {"type":"HE","player":"p","effectiveness":{"enemy_damage":40}},
      {"type":"HE","player":"p","effectiveness":{"enemy_damage":20}},
      {"type":"Flash","player":"p","effectiveness":{"enemies_flashed":0,"enemy_blind_ms":0}},
      {"type":"Fire","player":"p","icon":"molotov","effectiveness":{"enemy_damage":80}},
      {"type":"Fire","player":"p","icon":"incgrenade","effectiveness":{"enemy_damage":45}},
      {"type":"Fire","player":"p"}],"performance":[]}
    """,as:ReplayJSON.self)
    let rows = utilityIndexEvents(round,legacy:["p":try replayDecode("{\"fire_thrown\":1,\"fire_damage\":200}",as:ReplayJSON.self)])
    #expect(rows.count == 6)
    #expect(rows[0].damage == 40)
    #expect(rows[1].damage == 20)
    #expect(rows[2].enemies == 0)
    #expect(rows[2].blind == 0)
    #expect(rows[3].damage == 80)
    #expect(rows[4].damage == 45)
    #expect(rows[5].damage == nil)
}
@Test func utilityIndexUsesRoundTotalsOnlyWithProofOfOneThrow() throws {
    let round = try replayDecode("{\"utility\":[{\"type\":\"HE\",\"player\":\"p\"}]}",as:ReplayJSON.self)
    let one = try replayDecode("{\"he_thrown\":1,\"he_damage\":70}",as:ReplayJSON.self)
    let two = try replayDecode("{\"he_thrown\":2,\"he_damage\":70}",as:ReplayJSON.self)
    #expect(utilityIndexEvents(round,legacy:["p":one])[0].damage == 70)
    #expect(utilityIndexEvents(round,legacy:["p":one])[0].attribution == "single_throw")
    #expect(utilityIndexEvents(round,legacy:["p":two])[0].damage == nil)
}
@Test func utilitySearchRejectsUnboundedAndInvalidQueries() throws {
    let scope = UtilityScope(capture:UUID().uuidString,rounds:[1,29])
    let valid = UtilitySearchQuery(scopes:[scope],players:["steam:1"],type:"Fire",metric:"damage",minimum:40,offset:0,limit:50)
    try validateUtilitySearch(valid)
    var bad = valid;bad.metric = "SQL";#expect(throws:(any Error).self) { try validateUtilitySearch(bad) }
    bad = valid;bad.minimum = -1;#expect(throws:(any Error).self) { try validateUtilitySearch(bad) }
    bad = valid;bad.scopes = [];#expect(throws:(any Error).self) { try validateUtilitySearch(bad) }
}
