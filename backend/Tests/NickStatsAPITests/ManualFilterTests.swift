import Foundation
import Testing
@testable import NickStatsAPI

@Test func manualFilterNamesRejectEmptyOversizedAndControlCharacters() throws {
    #expect(try validatedManualFilterName("  Solo queue  ") == "Solo queue")
    #expect(try validatedManualFilterName("Latviešu spēles") == "Latviešu spēles")
    for value in ["", "   ", String(repeating: "a", count: 65), "Line\nBreak", "\u{0000}"] {
        #expect(throws: (any Error).self) { try validatedManualFilterName(value) }
    }
}

@Test func manualFilterStatesRoundTripAllThreeValuesAndRejectInvalidStates() throws {
    for state in [ManualMatchState.trueValue, .falseValue, .unknown] {
        let assignment = ManualFilterAssignment(filterID: "a", matchID: 101, state: state)
        let data = try JSONEncoder().encode(assignment)
        let decoded = try JSONDecoder().decode(ManualFilterAssignment.self, from: data)
        #expect(decoded.filterID == "a")
        #expect(decoded.matchID == 101)
        #expect(decoded.state == state)
    }
    #expect(throws: (any Error).self) {
        try JSONDecoder().decode(ManualFilterStateRequest.self, from: Data(#"{"state":"maybe"}"#.utf8))
    }
}

@Test func manualFilterCutoffIsSeparateFromPlayedDatesAndAssignments() throws {
    let payload = ManualFiltersResponse(filters: [ManualFilter(id: "a", name: "Solo", cutoffMatchID: 500)], assignments: [])
    let data = try JSONEncoder().encode(payload)
    let object = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
    let filters = try #require(object["filters"] as? [[String: Any]])
    #expect(filters[0]["cutoff_match_id"] as? Int == 500)
    #expect(object["assignments"] as? [String] == [])
}

@Test func numericTagsValidateTypesUnknownAndFiniteValues() throws {
    for value in [0.0, 8.5, -1.0] {
        try validatedManualTagValue(kind: .number, state: .trueValue, value: value)
    }
    try validatedManualTagValue(kind: .number, state: .unknown, value: nil)
    try validatedManualTagValue(kind: .boolean, state: .falseValue, value: nil)
    for value in [Double.infinity, Double.nan] {
        #expect(throws: (any Error).self) { try validatedManualTagValue(kind: .number, state: .trueValue, value: value) }
    }
    #expect(throws: (any Error).self) { try validatedManualTagValue(kind: .number, state: .trueValue, value: nil) }
    #expect(throws: (any Error).self) { try validatedManualTagValue(kind: .number, state: .falseValue, value: nil) }
    #expect(throws: (any Error).self) { try validatedManualTagValue(kind: .number, state: .unknown, value: 1) }
    #expect(throws: (any Error).self) { try validatedManualTagValue(kind: .boolean, state: .trueValue, value: 1) }
    let row = ManualFilterAssignment(filterID: "sleep", matchID: 2, state: .trueValue, value: 8.5)
    let decoded = try JSONDecoder().decode(ManualFilterAssignment.self, from: JSONEncoder().encode(row))
    #expect(decoded.value == 8.5)
}
