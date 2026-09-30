import Foundation
import Testing
@testable import NickStatsAPI

@Test func reparsesPreserveStoredDatesAndTheirSources() {
    let stored = Date(timeIntervalSince1970: 1_789_096_760)
    let incoming = Date(timeIntervalSince1970: 1_789_400_000)
    for source in ["faceit_history", "faceit_match_page", "zip_extended_mtime", nil] as [String?] {
        for replacement in [incoming, nil] as [Date?] {
            let resolved = resolvedMatchImportDate(existingDate: stored, existingSource: source,
                                                  incomingDate: replacement, incomingSource: "zip_extended_mtime")
            #expect(resolved.playedAt == stored)
            #expect(resolved.source == source)
        }
    }
}

@Test func missingStoredDatesCanBeFilledByIncomingMetadata() {
    let incoming = Date(timeIntervalSince1970: 1_789_400_000)
    let resolved = resolvedMatchImportDate(existingDate: nil, existingSource: "faceit_history",
                                          incomingDate: incoming, incomingSource: "zip_extended_mtime")
    #expect(resolved.playedAt == incoming)
    #expect(resolved.source == "zip_extended_mtime")
}

@Test func missingOrInvalidDatesDoNotKeepAnOrphanSource() {
    for date in [nil, Date(timeIntervalSince1970: 0), Date(timeIntervalSince1970: -1), Date(timeIntervalSince1970: 32_503_680_001)] as [Date?] {
        let missing = resolvedMatchImportDate(existingDate: date, existingSource: "faceit_history",
                                             incomingDate: nil, incomingSource: "zip_extended_mtime")
        #expect(missing.playedAt == nil)
        #expect(missing.source == nil)
        let incoming = Date(timeIntervalSince1970: 1_789_400_000)
        let filled = resolvedMatchImportDate(existingDate: date, existingSource: "faceit_history",
                                            incomingDate: incoming, incomingSource: "zip_extended_mtime")
        #expect(filled.playedAt == incoming)
        #expect(filled.source == "zip_extended_mtime")
    }
}
