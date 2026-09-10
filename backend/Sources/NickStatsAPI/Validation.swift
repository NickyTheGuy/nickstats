import Foundation
import Vapor

struct MatchValidationError: AbortError, Sendable {
    let path: String
    let message: String
    var status: HTTPResponseStatus { .badRequest }
    var reason: String { "\(path): \(message)" }
}

private func invalid(_ path: String, _ message: String) throws -> Never {
    throw MatchValidationError(path: path, message: message)
}

private func validateCount(_ value: Int, path: String, maximum: Int = 65_535) throws {
    guard value >= 0, value <= maximum else {
        try invalid(path, "Expected an integer from 0 through \(maximum).")
    }
}

private func validateCounts(_ values: [Int], count: Int, path: String, maximum: Int = 65_535) throws {
    guard values.count == count else { try invalid(path, "Expected exactly \(count) values.") }
    for (index, value) in values.enumerated() {
        try validateCount(value, path: "\(path)[\(index)]", maximum: maximum)
    }
}

private func validateText(_ value: String, path: String, maximum: Int) throws {
    guard !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
        try invalid(path, "Expected a non-empty string.")
    }
    guard value.count <= maximum else { try invalid(path, "Must be at most \(maximum) characters.") }
}

private func validateRelations(
    _ rows: [[Int]], length: Int, actor: Int, playerCount: Int, path: String,
    memberships: [Int: Int], kind: String
) throws {
    var targets = Set<Int>()
    for (rowIndex, row) in rows.enumerated() {
        let rowPath = "\(path)[\(rowIndex)]"
        guard row.count == length else { try invalid(rowPath, "Expected exactly \(length) values.") }
        let target = row[0]
        guard target >= 0, target < playerCount else { try invalid("\(rowPath)[0]", "Invalid player index.") }
        guard targets.insert(target).inserted else { try invalid(rowPath, "Duplicate target player index.") }
        for index in 1..<row.count {
            let maximum = kind == "flash" && index == 2 ? Int(UInt32.max) : Int(UInt16.max)
            try validateCount(row[index], path: "\(rowPath)[\(index)]", maximum: maximum)
        }

        if kind == "duel", row[1] == 0 { try invalid(rowPath, "A duel row must contain a kill.") }
        if kind == "trade" {
            guard target != actor else { try invalid(rowPath, "A player cannot trade for themselves.") }
            guard memberships[target] == memberships[actor] else { try invalid(rowPath, "A trade target must be a teammate.") }
            guard row[3] <= row[2], row[2] <= row[1] else {
                try invalid(rowPath, "Expected successes <= attempts <= opportunities.")
            }
        }
        if kind == "flash", row[1] == 0, row[2] == 0 {
            try invalid(rowPath, "A flash row must contain an effect or duration.")
        }
    }
}

extension MatchPayload {
    func validate() throws {
        guard schema == compactSchema else { try invalid("$.schema", "Only \(compactSchema) is supported.") }
        try validateText(nickstatsBuild, path: "$.nickstats_build", maximum: 32)
        guard parser.count == 2 else { try invalid("$.parser", "Expected exactly two values.") }
        try validateText(parser[0], path: "$.parser[0]", maximum: 64)
        try validateText(parser[1], path: "$.parser[1]", maximum: 32)
        if let faceit = id.faceit { try validateText(faceit, path: "$.id.faceit", maximum: 128) }
        guard id.sha256.count == 64, id.sha256.allSatisfy({ $0.isHexDigit }) else {
            try invalid("$.id.sha256", "Expected a 64-character hexadecimal SHA-256.")
        }
        try validateText(map, path: "$.map", maximum: 64)
        if let playedAt, !(0...32_503_680_000).contains(playedAt) {
            try invalid("$.played_at", "Expected a Unix timestamp from 0 through year 3000.")
        }
        if let playedAtSource { try validateText(playedAtSource, path: "$.played_at_source", maximum: 32) }
        guard rounds > 0, rounds <= 255 else { try invalid("$.rounds", "Expected 1 through 255 rounds.") }

        guard rules.trade.count == 6 else { try invalid("$.rules.trade", "Expected exactly six values.") }
        guard rules.movement.count == 2 else { try invalid("$.rules.movement", "Expected exactly two values.") }
        for (index, value) in rules.trade.enumerated() where !value.isFinite || value < 0 {
            try invalid("$.rules.trade[\(index)]", "Expected a finite non-negative number.")
        }
        for (index, value) in rules.movement.enumerated() where !value.isFinite || value < 0 {
            try invalid("$.rules.movement[\(index)]", "Expected a finite non-negative number.")
        }
        guard rules.equipmentDisadvantageSeconds.isFinite, rules.equipmentDisadvantageSeconds >= 0 else {
            try invalid("$.rules.equipment_disadvantage_seconds", "Expected a finite non-negative number.")
        }

        guard players.count >= 2, players.count <= 32 else { try invalid("$.players", "Expected 2 through 32 players.") }
        guard teams.count == 2 else { try invalid("$.teams", "Expected exactly two teams.") }
        var memberships: [Int: Int] = [:]
        var sourceTeamIDs = Set<String>()
        for (teamIndex, team) in teams.enumerated() {
            let path = "$.teams[\(teamIndex)]"
            try validateText(team.id, path: "\(path).id", maximum: 32)
            guard sourceTeamIDs.insert(team.id).inserted else { try invalid("\(path).id", "Team IDs must be unique.") }
            try validateText(team.name, path: "\(path).name", maximum: 128)
            if let score = team.score { try validateCount(score, path: "\(path).score", maximum: 255) }
            try validateCounts(team.sideScores, count: 2, path: "\(path).side_scores", maximum: 255)
            if let score = team.score, team.sideScores.reduce(0, +) != score {
                try invalid("\(path).side_scores", "T and CT wins must add up to the team score.")
            }
            guard !team.players.isEmpty else { try invalid("\(path).players", "A team must contain a player.") }
            for (memberIndex, playerIndex) in team.players.enumerated() {
                guard playerIndex >= 0, playerIndex < players.count else {
                    try invalid("\(path).players[\(memberIndex)]", "Invalid player index.")
                }
                guard memberships[playerIndex] == nil else {
                    try invalid("\(path).players[\(memberIndex)]", "A player may belong to only one team.")
                }
                memberships[playerIndex] = teamIndex
            }
        }
        guard memberships.count == players.count else { try invalid("$.teams", "Every player must belong to exactly one team.") }
        let knownScores = teams.compactMap(\.score)
        if knownScores.count == 2, knownScores.reduce(0, +) != rounds {
            try invalid("$.rounds", "Completed rounds must equal the two team scores combined.")
        }

        var steamIDs = Set<UInt64>()
        for (playerIndex, player) in players.enumerated() {
            let path = "$.players[\(playerIndex)]"
            try validateText(player.name, path: "\(path).name", maximum: 128)
            if player.bot == true {
                guard player.steamID == nil || player.steamID == "" else { try invalid("\(path).steam_id", "Bots cannot have a Steam ID.") }
            } else {
                guard let steamText = player.steamID, let steamID = UInt64(steamText), String(steamID) == steamText, steamID > 0 else {
                    try invalid("\(path).steam_id", "A human player requires a numeric unsigned 64-bit Steam ID.")
                }
                guard steamIDs.insert(steamID).inserted else { try invalid("\(path).steam_id", "Steam IDs must be unique within a match.") }
            }
            guard player.sides.count == 2 else { try invalid("\(path).sides", "Expected T and CT side records.") }
            guard player.sides.allSatisfy({ $0.rounds.count == 2 }) else {
                try invalid("\(path).sides", "Every side record requires rounds played and rounds won.")
            }
            guard player.sides.reduce(0, { $0 + $1.rounds[0] }) <= rounds else {
                try invalid("\(path).sides", "A player cannot play more rounds than the match contains.")
            }
            for (sideIndex, stats) in player.sides.enumerated() {
                let sidePath = "\(path).sides[\(sideIndex)]"
                try validateCounts(stats.rounds, count: 2, path: "\(sidePath).rounds")
                guard stats.rounds[1] <= stats.rounds[0] else { try invalid("\(sidePath).rounds", "Round wins cannot exceed rounds played.") }
                guard stats.kda.count == 5 else { try invalid("\(sidePath).kda", "Expected exactly five values.") }
                try validateCounts(Array(stats.kda.prefix(4)), count: 4, path: "\(sidePath).kda", maximum: Int(UInt16.max))
                try validateCount(stats.kda[4], path: "\(sidePath).kda[4]", maximum: Int(UInt32.max))
                try validateCount(stats.kastRounds, path: "\(sidePath).kast_rounds")
                guard stats.kastRounds <= stats.rounds[0] else { try invalid("\(sidePath).kast_rounds", "KAST rounds cannot exceed rounds played.") }
                try validateCounts(stats.opening, count: 2, path: "\(sidePath).opening")
                try validateCount(stats.tradeKills, path: "\(sidePath).trade_kills")
                try validateCounts(stats.tradeD, count: 3, path: "\(sidePath).trade_d")
                guard stats.tradeD[2] <= stats.tradeD[1], stats.tradeD[1] <= stats.tradeD[0] else {
                    try invalid("\(sidePath).trade_d", "Expected traded <= attempted <= tradeable deaths.")
                }
                try validateCounts(stats.utility, count: 2, path: "\(sidePath).utility", maximum: 4_294_967_295)
                guard stats.speed.count == 12 else { try invalid("\(sidePath).speed", "Expected exactly twelve values.") }
                for (index, value) in stats.speed.enumerated() {
                    if let value, (!value.isFinite || value < 0) { try invalid("\(sidePath).speed[\(index)]", "Expected a finite non-negative number or null.") }
                    if ![2, 5, 8, 11].contains(index), value == nil { try invalid("\(sidePath).speed[\(index)]", "Only maximum values may be null.") }
                }
                for index in [1, 4, 7, 10] {
                    guard let value = stats.speed[index], value.rounded() == value, value <= Double(UInt16.max) else {
                        try invalid("\(sidePath).speed[\(index)]", "Expected an integer sample count from 0 through \(UInt16.max).")
                    }
                }
                try validateCounts(stats.clutches, count: 5, path: "\(sidePath).clutches")
                try validateCounts(stats.killRounds, count: 5, path: "\(sidePath).kill_rounds")
                var weaponNames = Set<String>()
                for (weaponIndex, weapon) in stats.weapons.enumerated() {
                    let weaponPath = "\(sidePath).weapons[\(weaponIndex)]"
                    try validateText(weapon.weapon, path: "\(weaponPath)[0]", maximum: 64)
                    guard weaponNames.insert(weapon.weapon).inserted else { try invalid(weaponPath, "Duplicate weapon.") }
                    try validateCount(weapon.kills, path: "\(weaponPath)[1]")
                    try validateCount(weapon.shots, path: "\(weaponPath)[2]", maximum: 4_294_967_295)
                    try validateCount(weapon.damage, path: "\(weaponPath)[3]", maximum: 4_294_967_295)
                    try validateCount(weapon.roundsUsed, path: "\(weaponPath)[4]")
                }
                try validateRelations(stats.duels, length: 2, actor: playerIndex, playerCount: players.count, path: "\(sidePath).duels", memberships: memberships, kind: "duel")
                try validateRelations(stats.trades, length: 4, actor: playerIndex, playerCount: players.count, path: "\(sidePath).trades", memberships: memberships, kind: "trade")
                try validateRelations(stats.contexts, length: 14, actor: playerIndex, playerCount: players.count, path: "\(sidePath).contexts", memberships: memberships, kind: "context")
                try validateRelations(stats.assistedBy, length: 4, actor: playerIndex, playerCount: players.count, path: "\(sidePath).assisted_by", memberships: memberships, kind: "assist")
                try validateRelations(stats.flashes, length: 3, actor: playerIndex, playerCount: players.count, path: "\(sidePath).flashes", memberships: memberships, kind: "flash")
            }
        }
    }
}
