import Foundation
import Testing
@testable import NickStatsAPI

@Test func repeatedGroupPhasesAreSummedInBoundedTimingHeaders() {
    let timing = ProfileTimingRecorder()
    for _ in 0..<20 {
        timing.record("side_stats", since: timing.start())
        timing.record("weapons", since: timing.start())
    }
    timing.record("total", since: timing.start())
    let header = timing.serverTimingHeader()
    #expect(timing.metrics.count == 41)
    #expect(header.components(separatedBy: "side_stats;dur=").count == 2)
    #expect(header.components(separatedBy: "weapons;dur=").count == 2)
    #expect(header.split(separator: ",").count == 3)
}
