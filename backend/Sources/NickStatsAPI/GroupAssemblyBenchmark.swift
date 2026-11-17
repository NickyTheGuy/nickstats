import Foundation
import Vapor

/// Join complete, already encoded profile JSON objects. No decoding, layout
/// remapping or counter encoding is needed when a different roster reuses them.
/// This candidate envelope is diagnostic only until the benchmark is accepted.
func assembleProfileGroup(_ profiles: [Data]) -> Data {
    var data = Data()
    data.reserveCapacity(profiles.reduce(14) { $0 + $1.count + 1 })
    data.append(contentsOf: "{\"players\":[".utf8)
    for (index, profile) in profiles.enumerated() {
        if index > 0 { data.append(0x2c) }
        data.append(profile)
    }
    data.append(contentsOf: "]}".utf8)
    return data
}

struct GroupAssemblyBenchmarkReport: Content {
    struct Trial: Content {
        var format: String
        var conversion_ms: Double
        var encode_ms: Double
        var assembly_ms: Double
        var total_ms: Double
        var bytes: Int
        var encoded_players: Int
        var reused_players: Int
    }
    var players: Int
    var player_match_entries: Int
    var verified_counters: Int
    var trials: [Trial]
    var note: String
}

private func assemblyMilliseconds(_ start: ContinuousClock.Instant) -> Double {
    let parts = start.duration(to: ContinuousClock.now).components
    return Double(parts.seconds) * 1_000 + Double(parts.attoseconds) / 1_000_000_000_000_000
}

func benchmarkGroupAssembly(_ payload: ComparisonResponse) throws -> GroupAssemblyBenchmarkReport {
    var trials: [GroupAssemblyBenchmarkReport.Trial] = []
    do {
        let totalStart = ContinuousClock.now
        let conversionStart = ContinuousClock.now
        let layout = LayoutComparisonResponse(payload)
        let conversion = assemblyMilliseconds(conversionStart)
        let response = Response(status: .ok)
        let encodingStart = ContinuousClock.now
        try response.content.encode(layout)
        let encoding = assemblyMilliseconds(encodingStart)
        trials.append(.init(format: "current_group_layouts", conversion_ms: conversion,
            encode_ms: encoding, assembly_ms: 0, total_ms: assemblyMilliseconds(totalStart),
            bytes: response.body.count, encoded_players: payload.players.count, reused_players: 0))
    }

    // Request-local fragments simulate the per-player encoded cache. This does
    // not alter production caches, normal responses or any database records.
    var fragments: [Data] = []
    var conversion = 0.0, encoding = 0.0
    let coldStart = ContinuousClock.now
    for player in payload.players {
        let start = ContinuousClock.now
        let identity = PlayerProfileIdentity(id: player.id, steamID: player.steamID,
            name: player.name, firstSeenAt: nil, lastSeenAt: nil)
        let layout = LayoutPlayerProfileDataResponse(.init(player: identity, matches: player.matches))
        conversion += assemblyMilliseconds(start)
        let encodeStart = ContinuousClock.now
        let data = try JSONEncoder().encode(layout)
        encoding += assemblyMilliseconds(encodeStart)
        fragments.append(data)
    }
    do {
        let start = ContinuousClock.now
        let assembled = assembleProfileGroup(fragments)
        let assembly = assemblyMilliseconds(start)
        trials.append(.init(format: "per_player_cold", conversion_ms: conversion,
            encode_ms: encoding, assembly_ms: assembly, total_ms: assemblyMilliseconds(coldStart),
            bytes: assembled.count, encoded_players: fragments.count, reused_players: 0))
    }
    func measureReuse(_ name: String, _ parts: [Data]) {
        let start = ContinuousClock.now
        let assembled = assembleProfileGroup(parts)
        let assembly = assemblyMilliseconds(start)
        trials.append(.init(format: name, conversion_ms: 0, encode_ms: 0,
            assembly_ms: assembly, total_ms: assembly, bytes: assembled.count,
            encoded_players: 0, reused_players: parts.count))
    }
    measureReuse("per_player_warm", fragments)
    // Reordering and (with at least three players) changing the roster only join
    // existing fragments; no combination cache is involved. Keep the existing
    // Groups minimum of two players when constructing the subset sample.
    measureReuse("reordered_roster_warm", Array(fragments.reversed()))
    if fragments.count > 2 {
        measureReuse("different_roster_warm", Array(fragments.dropLast().reversed()))
    }

    // Outside measured trials, validate every transmitted counter after decoding
    // the real encoded fragments. Zero stays present; unavailable keys stay absent.
    var verified = 0
    for (player, fragment) in zip(payload.players, fragments) {
        let restored = try JSONDecoder().decode(LayoutPlayerProfileDataResponse.self, from: fragment)
        guard restored.player.id == player.id, restored.matches.count == player.matches.count else {
            throw Abort(.internalServerError, reason: "Assembly benchmark identity verification failed.")
        }
        for (original, match) in zip(player.matches, restored.matches) {
            guard original.id == match.id, original.sides.count == match.sides.count else {
                throw Abort(.internalServerError, reason: "Assembly benchmark match verification failed.")
            }
            for (source, side) in zip(original.sides, match.sides) {
                guard restored.stat_layouts.indices.contains(side.stat_layout) else {
                    throw Abort(.internalServerError, reason: "Assembly benchmark layout verification failed.")
                }
                let layout = restored.stat_layouts[side.stat_layout]
                guard layout.count == side.stats.count, layout.count == source.stats.count else {
                    throw Abort(.internalServerError, reason: "Assembly benchmark counter count verification failed.")
                }
                for (index, value) in zip(layout, side.stats) {
                    guard restored.stat_keys.indices.contains(index), source.stats[restored.stat_keys[index]] == value else {
                        throw Abort(.internalServerError, reason: "Assembly benchmark counter verification failed.")
                    }
                    verified += 1
                }
            }
        }
    }
    return .init(players: payload.players.count,
        player_match_entries: payload.players.reduce(0) { $0 + $1.matches.count },
        verified_counters: verified, trials: trials,
        note: "One fixed-order sample using the same real histories. Cold trials convert and encode; warm trials reuse request-local encoded player fragments, including a different roster. Database building, cache lookup, counter verification, compression, transfer and browser decoding are excluded. No production format or caches are changed; repeat to assess variability.")
}
