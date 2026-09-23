import Foundation

struct ProfileTimingMetric: Sendable {
    let name: String
    let durationMilliseconds: Double
}

/// Request-local timing collector. The lock keeps this safe if profile query
/// groups are made concurrent later.
final class ProfileTimingRecorder: @unchecked Sendable {
    private let clock = ContinuousClock()
    private let lock = NSLock()
    private var recordedMetrics: [ProfileTimingMetric] = []

    func start() -> ContinuousClock.Instant {
        clock.now
    }

    func record(_ name: String, since start: ContinuousClock.Instant?) {
        guard let start else { return }
        let duration = start.duration(to: clock.now)
        let components = duration.components
        let milliseconds = Double(components.seconds) * 1_000
            + Double(components.attoseconds) / 1_000_000_000_000_000
        lock.lock()
        recordedMetrics.append(ProfileTimingMetric(name: name, durationMilliseconds: milliseconds))
        lock.unlock()
    }

    var metrics: [ProfileTimingMetric] {
        lock.lock()
        defer { lock.unlock() }
        return recordedMetrics
    }

    func serverTimingHeader() -> String {
        metrics.map { metric in
            "\(metric.name);dur=\(String(format: "%.1f", metric.durationMilliseconds))"
        }.joined(separator: ", ")
    }
}
