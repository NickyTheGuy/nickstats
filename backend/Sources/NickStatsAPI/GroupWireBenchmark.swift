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

/// Candidate representation used only by the benchmark. Row values contain
/// exactly the available counters (including zero), aligned with a shared layout.
struct LayoutComparisonResponse: Content {
    struct Player: Codable {
        var id: Int64
        var steam_id: String
        var name: String
        var matches: [Match]
    }
    struct Match: Codable {
        var id: Int64
        var schema: String
        var played_at: Int64?
        var map: String
        var result: String
        var score_for: Int?
        var score_against: Int?
        var teammate_ids: [Int64]
        var rounds: Int
        var kills: Int
        var deaths: Int
        var assists: Int
        var headshots: Int
        var damage: Int
        var kast_rounds: Int
        var sides: [Side]
        var round_kills: [ComparisonRoundKill]
    }
    struct Side: Codable {
        var side: PlayerSide
        var buy_type: String
        var opponent_buy_type: String
        var round_result: String
        var round_phase: String?
        var hero: Bool
        var stat_layout: Int
        var stats: [Double]
        var weapons: [ComparisonWeaponStats]
    }
    var stat_keys: [String]
    var stat_layouts: [[Int]]
    var players: [Player]

    init(_ response: ComparisonResponse) {
        var names = Set<String>()
        for player in response.players {
            for match in player.matches {
                for side in match.sides { names.formUnion(side.stats.keys) }
            }
        }
        let keys = names.sorted()
        let indexes = Dictionary(uniqueKeysWithValues: keys.enumerated().map { ($0.element, $0.offset) })
        var layouts: [[Int]] = []
        var layoutIDs: [[Int]: Int] = [:]
        stat_keys = keys
        players = response.players.map { player in
            Player(id: player.id, steam_id: player.steamID, name: player.name,
                matches: player.matches.map { match in
                    let sides = match.sides.map { side in
                        let entries = side.stats.map { (index: indexes[$0.key]!, value: $0.value) }
                            .sorted { $0.index < $1.index }
                        let layout = entries.map(\.index)
                        let layoutID: Int
                        if let existing = layoutIDs[layout] {
                            layoutID = existing
                        } else {
                            layoutID = layouts.count
                            layouts.append(layout)
                            layoutIDs[layout] = layoutID
                        }
                        return Side(side: side.side, buy_type: side.buyType,
                            opponent_buy_type: side.opponentBuyType, round_result: side.roundResult,
                            round_phase: side.roundPhase, hero: side.hero, stat_layout: layoutID,
                            stats: entries.map(\.value), weapons: side.weapons)
                    }
                    return Match(id: match.id, schema: match.schema, played_at: match.playedAt,
                        map: match.map, result: match.result, score_for: match.scoreFor,
                        score_against: match.scoreAgainst, teammate_ids: match.teammateIDs,
                        rounds: match.rounds, kills: match.kills, deaths: match.deaths,
                        assists: match.assists, headshots: match.headshots, damage: match.damage,
                        kast_rounds: match.kastRounds, sides: sides, round_kills: match.roundKills)
                })
        }
        stat_layouts = layouts
    }
}
