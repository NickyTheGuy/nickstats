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

private func validateNumber(_ value: Double, path: String) throws {
    guard value.isFinite, value >= 0 else {
        try invalid(path, "Expected a finite non-negative number.")
    }
}

private func validateRelationTarget(
    _ target: Int,
    rowIndex: Int,
    playerCount: Int,
    path: String,
    seenTargets: inout Set<Int>
) throws -> String {
    let rowPath = "\(path)[\(rowIndex)]"
    guard target >= 0, target < playerCount else {
        try invalid("\(rowPath)[0]", "Invalid player index.")
    }
    guard seenTargets.insert(target).inserted else {
        try invalid(rowPath, "Duplicate target player index.")
    }
    return rowPath
}

private func validateSpeedSummary(_ summary: SpeedSummary, startingAt index: Int, path: String) throws {
    try validateNumber(summary.total, path: "\(path)[\(index)]")
    try validateCount(summary.samples, path: "\(path)[\(index + 1)]")
    if let maximum = summary.maximum {
        try validateNumber(maximum, path: "\(path)[\(index + 2)]")
    }
    try validateNumber(summary.percentOfMaximumTotal, path: "\(path)[\(index + 3)]")
    try validateCount(summary.percentOfMaximumSamples, path: "\(path)[\(index + 4)]")
    if let maximum = summary.percentOfMaximumPeak {
        try validateNumber(maximum, path: "\(path)[\(index + 5)]")
    }
}

extension MatchPayload {
    func validate() throws {
        guard schema == compactSchema else { try invalid("$.schema", "Only \(compactSchema) is supported.") }
        try validateText(nickstatsBuild, path: "$.nickstats_build", maximum: 32)
        try validateText(parser.name, path: "$.parser[0]", maximum: 64)
        try validateText(parser.version, path: "$.parser[1]", maximum: 32)
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

        try validateNumber(rules.trade.windowSeconds, path: "$.rules.trade[0]")
        try validateNumber(rules.trade.proximityUnits, path: "$.rules.trade[1]")
        try validateNumber(rules.trade.engagementLullSeconds, path: "$.rules.trade[2]")
        try validateNumber(rules.trade.bulletPathToleranceUnits, path: "$.rules.trade[3]")
        try validateNumber(rules.trade.unarmoredHEDamageCap, path: "$.rules.trade[4]")
        try validateNumber(rules.trade.armoredHEDamageCap, path: "$.rules.trade[5]")
        try validateNumber(rules.movement.stillSpeedToleranceUnitsPerSecond, path: "$.rules.movement[0]")
        try validateNumber(rules.movement.runningThresholdPercentOfWeaponMax, path: "$.rules.movement[1]")
        try validateNumber(rules.equipmentDisadvantageSeconds, path: "$.rules.equipment_disadvantage_seconds")

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
            try validateCount(team.sideScores.terrorist, path: "\(path).side_scores[0]", maximum: 255)
            try validateCount(team.sideScores.counterTerrorist, path: "\(path).side_scores[1]", maximum: 255)
            if let score = team.score, team.sideScores.total != score {
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
            guard player.sides.terrorist.rounds.played + player.sides.counterTerrorist.rounds.played <= rounds else {
                try invalid("\(path).sides", "A player cannot play more rounds than the match contains.")
            }
            let sideRecords = [player.sides.terrorist, player.sides.counterTerrorist]
            for (sideIndex, stats) in sideRecords.enumerated() {
                let sidePath = "\(path).sides[\(sideIndex)]"
                try validateCount(stats.rounds.played, path: "\(sidePath).rounds[0]")
                try validateCount(stats.rounds.won, path: "\(sidePath).rounds[1]")
                guard stats.rounds.won <= stats.rounds.played else {
                    try invalid("\(sidePath).rounds", "Round wins cannot exceed rounds played.")
                }
                try validateCount(stats.combat.kills, path: "\(sidePath).kda[0]")
                try validateCount(stats.combat.deaths, path: "\(sidePath).kda[1]")
                try validateCount(stats.combat.assists, path: "\(sidePath).kda[2]")
                try validateCount(stats.combat.headshots, path: "\(sidePath).kda[3]")
                try validateCount(stats.combat.damage, path: "\(sidePath).kda[4]", maximum: Int(UInt32.max))
                try validateCount(stats.kastRounds, path: "\(sidePath).kast_rounds")
                guard stats.kastRounds <= stats.rounds.played else {
                    try invalid("\(sidePath).kast_rounds", "KAST rounds cannot exceed rounds played.")
                }
                try validateCount(stats.opening.kills, path: "\(sidePath).opening[0]")
                try validateCount(stats.opening.deaths, path: "\(sidePath).opening[1]")
                try validateCount(stats.tradeKills, path: "\(sidePath).trade_kills")
                try validateCount(stats.tradeDeaths.tradeable, path: "\(sidePath).trade_d[0]")
                try validateCount(stats.tradeDeaths.attempted, path: "\(sidePath).trade_d[1]")
                try validateCount(stats.tradeDeaths.traded, path: "\(sidePath).trade_d[2]")
                guard stats.tradeDeaths.traded <= stats.tradeDeaths.attempted,
                      stats.tradeDeaths.attempted <= stats.tradeDeaths.tradeable else {
                    try invalid("\(sidePath).trade_d", "Expected traded <= attempted <= tradeable deaths.")
                }
                try validateCount(stats.utility.highExplosive, path: "\(sidePath).utility[0]", maximum: Int(UInt32.max))
                try validateCount(stats.utility.fire, path: "\(sidePath).utility[1]", maximum: Int(UInt32.max))
                try validateSpeedSummary(stats.speed.kills, startingAt: 0, path: "\(sidePath).speed")
                try validateSpeedSummary(stats.speed.deaths, startingAt: 6, path: "\(sidePath).speed")
                try validateCounts(stats.clutches.values, count: 5, path: "\(sidePath).clutches")
                try validateCounts(stats.killRounds.values, count: 5, path: "\(sidePath).kill_rounds")
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
                var duelTargets = Set<Int>()
                for (rowIndex, duel) in stats.duels.enumerated() {
                    let rowPath = try validateRelationTarget(
                        duel.opponentPlayerIndex, rowIndex: rowIndex, playerCount: players.count,
                        path: "\(sidePath).duels", seenTargets: &duelTargets
                    )
                    try validateCount(duel.kills, path: "\(rowPath)[1]")
                    guard duel.kills > 0 else { try invalid(rowPath, "A duel row must contain a kill.") }
                }

                var tradeTargets = Set<Int>()
                for (rowIndex, trade) in stats.trades.enumerated() {
                    let rowPath = try validateRelationTarget(
                        trade.teammatePlayerIndex, rowIndex: rowIndex, playerCount: players.count,
                        path: "\(sidePath).trades", seenTargets: &tradeTargets
                    )
                    guard trade.teammatePlayerIndex != playerIndex else {
                        try invalid(rowPath, "A player cannot trade for themselves.")
                    }
                    guard memberships[trade.teammatePlayerIndex] == memberships[playerIndex] else {
                        try invalid(rowPath, "A trade target must be a teammate.")
                    }
                    try validateCount(trade.opportunities, path: "\(rowPath)[1]")
                    try validateCount(trade.attempts, path: "\(rowPath)[2]")
                    try validateCount(trade.successes, path: "\(rowPath)[3]")
                    guard trade.successes <= trade.attempts, trade.attempts <= trade.opportunities else {
                        try invalid(rowPath, "Expected successes <= attempts <= opportunities.")
                    }
                }

                var contextTargets = Set<Int>()
                for (rowIndex, context) in stats.contexts.enumerated() {
                    let rowPath = try validateRelationTarget(
                        context.victimPlayerIndex, rowIndex: rowIndex, playerCount: players.count,
                        path: "\(sidePath).contexts", seenTargets: &contextTargets
                    )
                    let counts = [
                        context.victimBlindedKills, context.attackerBlindKills, context.wallbangKills,
                        context.penetrationTotal, context.smokeKills, context.airborneKills,
                        context.movingKills, context.stillKills, context.runningKills,
                        context.victimGrenadeOutKills, context.victimKnifeOutKills,
                        context.equipmentDisadvantageKills, context.unfairKills
                    ]
                    for (valueIndex, count) in counts.enumerated() {
                        try validateCount(count, path: "\(rowPath)[\(valueIndex + 1)]")
                    }
                }

                var assistTargets = Set<Int>()
                for (rowIndex, assist) in stats.assistedBy.enumerated() {
                    let rowPath = try validateRelationTarget(
                        assist.assisterPlayerIndex, rowIndex: rowIndex, playerCount: players.count,
                        path: "\(sidePath).assisted_by", seenTargets: &assistTargets
                    )
                    try validateCount(assist.damageAssistedKills, path: "\(rowPath)[1]")
                    try validateCount(assist.teammateFlashAssistedKills, path: "\(rowPath)[2]")
                    try validateCount(assist.ownFlashKills, path: "\(rowPath)[3]")
                }

                var flashTargets = Set<Int>()
                for (rowIndex, flash) in stats.flashes.enumerated() {
                    let rowPath = try validateRelationTarget(
                        flash.victimPlayerIndex, rowIndex: rowIndex, playerCount: players.count,
                        path: "\(sidePath).flashes", seenTargets: &flashTargets
                    )
                    try validateCount(flash.effects, path: "\(rowPath)[1]")
                    try validateCount(flash.blindDurationMilliseconds, path: "\(rowPath)[2]", maximum: Int(UInt32.max))
                    guard flash.effects > 0 || flash.blindDurationMilliseconds > 0 else {
                        try invalid(rowPath, "A flash row must contain an effect or duration.")
                    }
                }
            }
        }
    }
}
