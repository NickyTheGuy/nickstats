import Testing
import Vapor
@testable import NickStatsAPI

@Test func comparisonScopeIsOptionalAndRetainsExactIDs() throws {
    #expect(try comparisonMatchIDs(nil) == nil)
    #expect(try comparisonMatchIDs("101, 100") == [101, 100])
    #expect(try comparisonMatchIDs("100") == [100])
    let largest = (1...100).map { String($0) }.joined(separator: ",")
    #expect(try comparisonMatchIDs(largest)?.count == 100)
}

@Test func invalidComparisonScopeCannotBecomeAnUnboundedQuery() {
    for value in ["", "0", "-1", "1,1", "1,", ",1", "1,,2", "nope", "1,nope", "9223372036854775808"] {
        #expect(throws: Abort.self) { try comparisonMatchIDs(value) }
    }
    #expect(throws: Abort.self) {
        try comparisonMatchIDs((1...101).map { String($0) }.joined(separator: ","))
    }
}
