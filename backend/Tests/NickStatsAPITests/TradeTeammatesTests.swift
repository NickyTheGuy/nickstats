import Foundation
import Testing
@testable import NickStatsAPI

@Test func tradeTeammateSelectionsValidateLimitsSidesAndMatchIDs() throws {
    try TradeTeammatesRequest(matchIDs: [], side: "ALL").validate()
    try TradeTeammatesRequest(matchIDs: [1, 2, 2], side: "CT").validate()
    try TradeTeammatesRequest(matchIDs: [3], side: "T").validate()
    for selection in [TradeTeammatesRequest(matchIDs: [0], side: "ALL"),
                      TradeTeammatesRequest(matchIDs: [-1], side: "ALL"),
                      TradeTeammatesRequest(matchIDs: [1], side: "other"),
                      TradeTeammatesRequest(matchIDs: Array(repeating: 1, count: 20_001), side: "ALL")] {
        #expect(throws: (any Error).self) { try selection.validate() }
    }
}

@Test func tradeTeammatesRequestUsesMatchIDsWireKey() throws {
    let value = try JSONDecoder().decode(TradeTeammatesRequest.self, from: Data(#"{"match_ids":[1,2],"side":"T"}"#.utf8))
    #expect(value.matchIDs == [1, 2])
    #expect(value.side == "T")
}
