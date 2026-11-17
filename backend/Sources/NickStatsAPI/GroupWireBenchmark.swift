import Foundation
import Vapor

/// Diagnostic only: never selected by the regular Groups frontend.
struct GroupWireBenchmarkReport: Content {
    struct Trial: Content {
        var format: String
        var encoder: String
        var conversion_ms: Double
        var encode_ms: Double
        var total_ms: Double
        var bytes: Int
    }
    var players: Int
    var player_match_entries: Int
    var rows: Int
    var statistic_keys: Int
    var populated_slots: Int
    var padded_slots: Int
    var layouts: Int
    var trials: [Trial]
    var note: String
}

private func elapsedMilliseconds(_ start: ContinuousClock.Instant) -> Double {
    let value = start.duration(to: ContinuousClock.now).components
    return Double(value.seconds) * 1_000 + Double(value.attoseconds) / 1_000_000_000_000_000
}

/// Both encoders are measured because the existing Groups route uses Vapor's
/// configured encoder while cached individual profiles use Foundation directly.
/// Response buffers are discarded between trials; nothing is cached or stored.
func benchmarkGroupWire(_ payload: ComparisonResponse) throws -> GroupWireBenchmarkReport {
    var trials: [GroupWireBenchmarkReport.Trial] = []
    func measure<T: Content>(_ name: String, make: () -> T) throws {
        let start = ContinuousClock.now
        let value = make()
        let conversion = elapsedMilliseconds(start)
        do {
            let response = Response(status: .ok)
            let encodingStart = ContinuousClock.now
            try response.content.encode(value)
            let encoding = elapsedMilliseconds(encodingStart)
            trials.append(.init(format: name, encoder: "vapor", conversion_ms: conversion,
                encode_ms: encoding, total_ms: conversion + encoding, bytes: response.body.count))
        }
        do {
            let encodingStart = ContinuousClock.now
            let data = try JSONEncoder().encode(value)
            let encoding = elapsedMilliseconds(encodingStart)
            trials.append(.init(format: name, encoder: "foundation", conversion_ms: conversion,
                encode_ms: encoding, total_ms: conversion + encoding, bytes: data.count))
        }
    }
    try measure("verbose") { payload }
    try measure("padded") { DenseComparisonResponse(payload) }
    try measure("layouts") { LayoutComparisonResponse(payload) }

    // Collect counts outside the measured trials, without keeping dense arrays.
    var keys = Set<String>(), layouts = Set<[String]>()
    var rows = 0, populated = 0, matches = 0
    for player in payload.players {
        matches += player.matches.count
        for match in player.matches {
            for side in match.sides {
                rows += 1
                populated += side.stats.count
                keys.formUnion(side.stats.keys)
                layouts.insert(side.stats.keys.sorted())
            }
        }
    }
    return .init(players: payload.players.count, player_match_entries: matches, rows: rows,
        statistic_keys: keys.count, populated_slots: populated, padded_slots: rows * keys.count,
        layouts: layouts.count, trials: trials,
        note: "One real-data sample per format/encoder, in listed order. Conversion is shared by both encoders. Times exclude database build and network compression. Repeat to assess variability; this request intentionally does extra work.")
}
