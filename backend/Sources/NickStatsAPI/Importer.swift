import Crypto
import Fluent
import Foundation
import SQLKit
import Vapor

struct ImportResult: Sendable {
    let id: Int64
    let created: Bool
    let replaced: Bool
}

private func integerID(_ row: any SQLRow, column: String = "id") throws -> Int64 {
    if let value = try? row.decode(column: column, as: Int64.self) { return value }
    return Int64(try row.decode(column: column, as: UInt64.self))
}

private func lastInsertID(_ sql: any SQLDatabase) async throws -> Int64 {
    guard let row = try await sql.raw("SELECT LAST_INSERT_ID() AS id").first() else {
        throw Abort(.internalServerError, reason: "MySQL did not return an inserted ID.")
    }
    return try integerID(row)
}

private func hashHex(_ data: Data) -> String {
    SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
}

private func canonicalRules(_ rules: ParserRules) throws -> (json: String, hash: String) {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
    let data = try encoder.encode(rules)
    guard let json = String(data: data, encoding: .utf8) else {
        throw Abort(.badRequest, reason: "Parser rules are not valid UTF-8 JSON.")
    }
    return (json, hashHex(data))
}

private func findExisting(_ sql: any SQLDatabase, sha256: String, faceitID: String?) async throws -> Int64? {
    let shaRow = try await sql.raw("SELECT id FROM matches WHERE demo_sha256 = UNHEX(\(bind: sha256))").first()
    var providerRow: (any SQLRow)?
    if let faceitID {
        providerRow = try await sql.raw("SELECT id FROM matches WHERE provider = 'faceit' AND provider_match_id = \(bind: faceitID)").first()
    }
    let shaID = try shaRow.map { try integerID($0) }
    let providerID = try providerRow.map { try integerID($0) }
    if let shaID, let providerID, shaID != providerID {
        throw Abort(.conflict, reason: "The demo hash and FACEIT ID belong to different stored matches.")
    }
    return shaID ?? providerID
}

private func parserConfigurationID(_ sql: any SQLDatabase, rules: ParserRules) async throws -> Int64 {
    let canonical = try canonicalRules(rules)
    try await sql.raw("""
        INSERT INTO parser_configs (config_sha256, rules_json)
        VALUES (UNHEX(\(bind: canonical.hash)), \(bind: canonical.json))
        ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)
        """).run()
    return try await lastInsertID(sql)
}

private func globalPlayerID(
    _ sql: any SQLDatabase, steamID: UInt64, name: String, playedAt: Date?
) async throws -> Int64 {
    try await sql.raw("""
        INSERT INTO players (steam_id, current_name, first_seen_at, last_seen_at)
        VALUES (\(bind: steamID), \(bind: name), \(bind: playedAt), \(bind: playedAt))
          AS new(new_steam_id, new_current_name, new_first_seen_at, new_last_seen_at)
        ON DUPLICATE KEY UPDATE
          id = LAST_INSERT_ID(id),
          current_name = CASE
            WHEN new.new_last_seen_at IS NULL OR last_seen_at IS NULL OR new.new_last_seen_at >= last_seen_at
              THEN new.new_current_name
            ELSE current_name
          END,
          first_seen_at = CASE
            WHEN new.new_first_seen_at IS NULL THEN first_seen_at
            WHEN first_seen_at IS NULL THEN new.new_first_seen_at
            ELSE LEAST(first_seen_at, new.new_first_seen_at)
          END,
          last_seen_at = CASE
            WHEN new.new_last_seen_at IS NULL THEN last_seen_at
            WHEN last_seen_at IS NULL THEN new.new_last_seen_at
            ELSE GREATEST(last_seen_at, new.new_last_seen_at)
          END
        """).run()
    return try await lastInsertID(sql)
}

func importMatch(
    _ payload: MatchPayload, replacingExisting: Bool = false, on database: any Database
) async throws -> ImportResult {
    guard let sql = database as? any SQLDatabase else {
        throw Abort(.internalServerError, reason: "The configured database does not support SQL.")
    }
    let sha256 = payload.id.sha256.lowercased()
    let existingMatchID = try await findExisting(sql, sha256: sha256, faceitID: payload.id.faceit)
    if let existingMatchID, !replacingExisting {
        return ImportResult(id: existingMatchID, created: false, replaced: false)
    }

    let configID = try await parserConfigurationID(sql, rules: payload.rules)
    let playedAt = payload.playedAt.map { Date(timeIntervalSince1970: TimeInterval($0)) }
    let provider: String? = payload.id.faceit == nil ? nil : "faceit"
    let matchID: Int64
    if let existingMatchID {
        // Relationship rows must go first because they also reference match_players.
        try await sql.raw("DELETE FROM match_rounds WHERE match_id = \(bind: existingMatchID)").run()
        try await sql.raw("DELETE FROM duel_side_stats WHERE match_id = \(bind: existingMatchID)").run()
        try await sql.raw("DELETE FROM trade_side_stats WHERE match_id = \(bind: existingMatchID)").run()
        try await sql.raw("DELETE FROM kill_context_side_stats WHERE match_id = \(bind: existingMatchID)").run()
        try await sql.raw("DELETE FROM assisted_kill_side_stats WHERE match_id = \(bind: existingMatchID)").run()
        try await sql.raw("DELETE FROM flash_side_stats WHERE match_id = \(bind: existingMatchID)").run()
        try await sql.raw("DELETE FROM match_players WHERE match_id = \(bind: existingMatchID)").run()
        try await sql.raw("DELETE FROM match_teams WHERE match_id = \(bind: existingMatchID)").run()
        try await sql.raw("""
            UPDATE matches SET
              provider = \(bind: provider), provider_match_id = \(bind: payload.id.faceit),
              demo_sha256 = UNHEX(\(bind: sha256)), payload_schema = \(bind: payload.schema),
              nickstats_build = \(bind: payload.nickstatsBuild), parser_name = \(bind: payload.parser.name),
              parser_version = \(bind: payload.parser.version), parser_config_id = \(bind: configID),
              map_name = \(bind: payload.map), played_at = \(bind: playedAt),
              played_at_source = \(bind: payload.playedAtSource), rounds = \(bind: payload.rounds)
            WHERE id = \(bind: existingMatchID)
            """).run()
        matchID = existingMatchID
    } else {
        try await sql.raw("""
            INSERT INTO matches (
              provider, provider_match_id, demo_sha256, payload_schema, nickstats_build,
              parser_name, parser_version, parser_config_id, map_name, played_at,
              played_at_source, rounds
            ) VALUES (
              \(bind: provider), \(bind: payload.id.faceit), UNHEX(\(bind: sha256)),
              \(bind: payload.schema), \(bind: payload.nickstatsBuild),
              \(bind: payload.parser.name), \(bind: payload.parser.version), \(bind: configID),
              \(bind: payload.map), \(bind: playedAt), \(bind: payload.playedAtSource), \(bind: payload.rounds)
            )
            """).run()
        matchID = try await lastInsertID(sql)
    }

    var teamIDs: [Int64] = []
    var playerTeam: [Int: Int] = [:]
    for (teamSlot, team) in payload.teams.enumerated() {
        try await sql.raw("""
            INSERT INTO match_teams (
              match_id, team_slot, source_team_id, display_name, score,
              t_round_wins, ct_round_wins
            ) VALUES (
              \(bind: matchID), \(bind: teamSlot), \(bind: team.id), \(bind: team.name),
              \(bind: team.score), \(bind: team.sideScores.terrorist), \(bind: team.sideScores.counterTerrorist)
            )
            """).run()
        teamIDs.append(try await lastInsertID(sql))
        for playerSlot in team.players { playerTeam[playerSlot] = teamSlot }
    }

    var matchPlayerIDs: [Int64] = []
    for (playerSlot, player) in payload.players.enumerated() {
        let isBot = player.bot == true
        let playerID: Int64?
        if isBot {
            playerID = nil
        } else {
            playerID = try await globalPlayerID(
                sql, steamID: UInt64(player.steamID!)!, name: player.name, playedAt: playedAt
            )
        }
        let teamID = teamIDs[playerTeam[playerSlot]!]
        try await sql.raw("""
            INSERT INTO match_players (
              match_id, match_team_id, player_slot, player_id, display_name, is_bot
            ) VALUES (
              \(bind: matchID), \(bind: teamID), \(bind: playerSlot), \(bind: playerID),
              \(bind: player.name), \(bind: isBot)
            )
            """).run()
        matchPlayerIDs.append(try await lastInsertID(sql))
    }

    var roundIDs: [Int: Int64] = [:]
    let survivorsByRound = Dictionary(uniqueKeysWithValues: (payload.roundSurvivors ?? []).map { ($0.round, $0) })
    let economyByRound = Dictionary(uniqueKeysWithValues: (payload.roundEconomy ?? []).map { ($0.round, $0) })
    for timing in payload.roundTiming ?? [] {
        let survivors = survivorsByRound[timing.round]
        let economy = economyByRound[timing.round]
        try await sql.raw("""
            INSERT INTO match_rounds (
              match_id, round_number, live_start_tick, end_tick, duration_ms,
              winner_side, bomb_plant_elapsed_ms, t_alive_end, ct_alive_end,
              t_equipment_value, ct_equipment_value, t_player_count, ct_player_count,
              pistol_round, t_match_team_id, ct_match_team_id
            ) VALUES (
              \(bind: matchID), \(bind: timing.round), \(bind: timing.liveStartTick),
              \(bind: timing.endTick), \(bind: timing.durationMilliseconds),
              \(bind: timing.winnerSide?.rawValue), \(bind: timing.bombPlantElapsedMilliseconds),
              \(bind: survivors?.terroristAlive), \(bind: survivors?.counterTerroristAlive),
              \(bind: economy?.terroristEquipmentValue), \(bind: economy?.counterTerroristEquipmentValue),
              \(bind: economy?.terroristPlayers), \(bind: economy?.counterTerroristPlayers),
              \(bind: economy?.pistolRound),
              \(bind: economy.map { teamIDs[$0.terroristTeamIndex] }),
              \(bind: economy.map { teamIDs[$0.counterTerroristTeamIndex] })
            )
            """).run()
        roundIDs[timing.round] = try await lastInsertID(sql)
    }
    for event in payload.deathEvents ?? [] {
        guard let roundID = roundIDs[event.round] else { continue }
        let killerID = event.killerPlayerIndex.map { matchPlayerIDs[$0] }
        try await sql.raw("""
            INSERT INTO death_events (
              match_id, match_round_id, event_sequence, event_tick, elapsed_ms,
              killer_match_player_id, victim_match_player_id, killer_side, victim_side,
              weapon, enemy_kill, context_flags, t_alive_before, ct_alive_before, since_plant_ms
            ) VALUES (
              \(bind: matchID), \(bind: roundID), \(bind: event.sequence), \(bind: event.tick),
              \(bind: event.elapsedMilliseconds), \(bind: killerID),
              \(bind: matchPlayerIDs[event.victimPlayerIndex]), \(bind: event.killerSide?.rawValue),
              \(bind: event.victimSide.rawValue), \(bind: event.weapon), \(bind: event.enemyKill),
              \(bind: event.flags), \(bind: event.terroristAliveBefore),
              \(bind: event.counterTerroristAliveBefore), \(bind: event.sincePlantMilliseconds)
            )
            """).run()
    }

    for (playerSlot, player) in payload.players.enumerated() {
        for side in PlayerSide.allCases {
            try await insertSideStats(
                player.sides[side], side: side, actorID: matchPlayerIDs[playerSlot],
                matchID: matchID, playerIDs: matchPlayerIDs, sql: sql
            )
        }
        if let buys = player.buys {
            let buyTypes = ["pistol", "eco", "force", "full"]
            for (buyIndex, buyType) in buyTypes.enumerated() {
                for (sideIndex, side) in PlayerSide.allCases.enumerated() {
                    let stats = buys[buyIndex * 2 + sideIndex]
                    let data = try JSONEncoder().encode(stats)
                    guard let json = String(data: data, encoding: .utf8) else {
                        throw Abort(.internalServerError, reason: "Could not encode buy statistics.")
                    }
                    try await sql.raw("""
                        INSERT INTO player_side_buy_stats
                          (match_id, match_player_id, side, buy_type, stats_json)
                        VALUES (
                          \(bind: matchID), \(bind: matchPlayerIDs[playerSlot]), \(bind: side.rawValue),
                          \(bind: buyType), CAST(\(bind: json) AS JSON)
                        )
                        """).run()
                }
            }
        }
        if let roundResults = player.roundResults {
            let buyTypes = ["ALL", "pistol", "eco", "force", "full"]
            let results = ["win", "loss"]
            for (buyIndex, buyType) in buyTypes.enumerated() {
                for (resultIndex, result) in results.enumerated() {
                    for (sideIndex, side) in PlayerSide.allCases.enumerated() {
                        let stats = roundResults[buyIndex * 4 + resultIndex * 2 + sideIndex]
                        let data = try JSONEncoder().encode(stats)
                        guard let json = String(data: data, encoding: .utf8) else {
                            throw Abort(.internalServerError, reason: "Could not encode round-result statistics.")
                        }
                        try await sql.raw("""
                            INSERT INTO player_round_result_stats
                              (match_id, match_player_id, side, buy_type, round_result, stats_json)
                            VALUES (
                              \(bind: matchID), \(bind: matchPlayerIDs[playerSlot]), \(bind: side.rawValue),
                              \(bind: buyType), \(bind: result), CAST(\(bind: json) AS JSON)
                            )
                            """).run()
                    }
                }
            }
        }
        if let matchups = player.economyMatchups {
            let buyTypes = ["pistol", "eco", "force", "full"]
            let results = ["win", "loss"]
            for matchup in matchups {
                let data = try JSONEncoder().encode(matchup.stats)
                guard let json = String(data: data, encoding: .utf8) else {
                    throw Abort(.internalServerError, reason: "Could not encode economy-matchup statistics.")
                }
                try await sql.raw("""
                    INSERT INTO player_economy_matchup_stats
                      (match_id, match_player_id, side, buy_type, opponent_buy_type, round_result, stats_json)
                    VALUES (
                      \(bind: matchID), \(bind: matchPlayerIDs[playerSlot]), \(bind: PlayerSide.allCases[matchup.sideIndex].rawValue),
                      \(bind: buyTypes[matchup.ownBuyIndex]), \(bind: buyTypes[matchup.opponentBuyIndex]),
                      \(bind: results[matchup.resultIndex]), CAST(\(bind: json) AS JSON)
                    )
                    """).run()
            }
        }
    }
    return ImportResult(id: matchID, created: existingMatchID == nil, replaced: existingMatchID != nil)
}

private func insertSideStats(
    _ stats: SideStatsPayload, side: PlayerSide, actorID: Int64, matchID: Int64,
    playerIDs: [Int64], sql: any SQLDatabase
) async throws {
    // Older compact clients only send wins. Every win necessarily represents
    // at least one attempt, so preserve that minimum instead of writing 0/W.
    let clutchAttempts = stats.clutchAttempts ?? stats.clutches
    let trueKillRounds = stats.trueKillRounds ?? .zero
    let utilityThrown = stats.utilityThrown ?? .zero
    let objectives = stats.objectives ?? .zero
    try await sql.raw("""
        INSERT INTO player_side_stats (
          match_player_id, side, rounds_played, rounds_won,
          kills, deaths, assists, headshots, damage, damage_received, kast_rounds,
          opening_kills, opening_deaths, opening_assisted_kills,
          opening_damage_assisted_kills, opening_flash_assisted_kills,
          opening_traded_deaths, opening_trade_kills, opening_assists,
          opening_damage_assists, opening_flash_assists,
          opening_blinded_enemy_kills, opening_blind_kills,
          opening_deaths_while_blind, opening_deaths_to_blind_killer,
          opening_enemy_assisted_deaths, opening_enemy_damage_assisted_deaths,
          opening_enemy_flash_assisted_deaths,
          opening_own_flash_kills, opening_victim_side_flash_kills,
          opening_blind_source_unknown_kills, opening_deaths_to_killer_flash,
          opening_deaths_to_own_side_flash, opening_deaths_blind_source_unknown,
          trade_kills,
          tradeable_deaths, attempted_tradeable_deaths, traded_deaths,
          he_damage, fire_damage,
          he_grenades_thrown, flashbangs_thrown, smokes_thrown, fire_grenades_thrown, decoys_thrown,
          bomb_plants, bomb_defuses,
          kill_speed_total, kill_speed_samples, kill_speed_max,
          kill_speed_percent_total, kill_speed_percent_samples, kill_speed_percent_max,
          death_speed_total, death_speed_samples, death_speed_max,
          death_speed_percent_total, death_speed_percent_samples, death_speed_percent_max,
          clutch_1v1, clutch_1v2, clutch_1v3, clutch_1v4, clutch_1v5,
          clutch_attempt_1v1, clutch_attempt_1v2, clutch_attempt_1v3, clutch_attempt_1v4, clutch_attempt_1v5,
          kill_rounds_1k, kill_rounds_2k, kill_rounds_3k, kill_rounds_4k, kill_rounds_5k,
          true_kill_rounds_1k, true_kill_rounds_2k, true_kill_rounds_3k,
          true_kill_rounds_4k, true_kill_rounds_5k
        ) VALUES (
          \(bind: actorID), \(bind: side.rawValue), \(bind: stats.rounds.played), \(bind: stats.rounds.won),
          \(bind: stats.combat.kills), \(bind: stats.combat.deaths), \(bind: stats.combat.assists),
          \(bind: stats.combat.headshots), \(bind: stats.combat.damage), \(bind: stats.damageReceived ?? 0), \(bind: stats.kastRounds),
          \(bind: stats.opening.kills), \(bind: stats.opening.deaths), \(bind: stats.opening.assistedKills),
          \(bind: stats.opening.damageAssistedKills), \(bind: stats.opening.flashAssistedKills),
          \(bind: stats.opening.tradedDeaths), \(bind: stats.opening.tradeKills), \(bind: stats.opening.assists),
          \(bind: stats.opening.damageAssists), \(bind: stats.opening.flashAssists),
          \(bind: stats.opening.blindedEnemyKills), \(bind: stats.opening.blindKills),
          \(bind: stats.opening.deathsWhileBlind), \(bind: stats.opening.deathsToBlindKiller),
          \(bind: stats.opening.enemyAssistedDeaths), \(bind: stats.opening.enemyDamageAssistedDeaths),
          \(bind: stats.opening.enemyFlashAssistedDeaths),
          \(bind: stats.opening.ownFlashKills), \(bind: stats.opening.victimSideFlashKills),
          \(bind: stats.opening.blindSourceUnknownKills), \(bind: stats.opening.deathsToKillerFlash),
          \(bind: stats.opening.deathsToOwnSideFlash), \(bind: stats.opening.deathsBlindSourceUnknown),
          \(bind: stats.tradeKills),
          \(bind: stats.tradeDeaths.tradeable), \(bind: stats.tradeDeaths.attempted), \(bind: stats.tradeDeaths.traded),
          \(bind: stats.utility.highExplosive), \(bind: stats.utility.fire),
          \(bind: utilityThrown.highExplosive), \(bind: utilityThrown.flashbang), \(bind: utilityThrown.smoke),
          \(bind: utilityThrown.fire), \(bind: utilityThrown.decoy),
          \(bind: objectives.plants), \(bind: objectives.defuses),
          \(bind: stats.speed.kills.total), \(bind: stats.speed.kills.samples), \(bind: stats.speed.kills.maximum),
          \(bind: stats.speed.kills.percentOfMaximumTotal), \(bind: stats.speed.kills.percentOfMaximumSamples), \(bind: stats.speed.kills.percentOfMaximumPeak),
          \(bind: stats.speed.deaths.total), \(bind: stats.speed.deaths.samples), \(bind: stats.speed.deaths.maximum),
          \(bind: stats.speed.deaths.percentOfMaximumTotal), \(bind: stats.speed.deaths.percentOfMaximumSamples), \(bind: stats.speed.deaths.percentOfMaximumPeak),
          \(bind: stats.clutches.oneVersusOne), \(bind: stats.clutches.oneVersusTwo), \(bind: stats.clutches.oneVersusThree),
          \(bind: stats.clutches.oneVersusFour), \(bind: stats.clutches.oneVersusFive),
          \(bind: clutchAttempts.oneVersusOne), \(bind: clutchAttempts.oneVersusTwo), \(bind: clutchAttempts.oneVersusThree),
          \(bind: clutchAttempts.oneVersusFour), \(bind: clutchAttempts.oneVersusFive),
          \(bind: stats.killRounds.oneKill), \(bind: stats.killRounds.twoKills), \(bind: stats.killRounds.threeKills),
          \(bind: stats.killRounds.fourKills), \(bind: stats.killRounds.fiveKills),
          \(bind: trueKillRounds.oneKill), \(bind: trueKillRounds.twoKills), \(bind: trueKillRounds.threeKills),
          \(bind: trueKillRounds.fourKills), \(bind: trueKillRounds.fiveKills)
        )
        """).run()

    for weapon in stats.weapons {
        try await sql.raw("""
            INSERT INTO weapon_side_stats
              (match_player_id, side, weapon, kills, shots, hits, damage, rounds_used)
            VALUES (
              \(bind: actorID), \(bind: side.rawValue), \(bind: weapon.weapon), \(bind: weapon.kills),
              \(bind: weapon.shots), \(bind: weapon.hits), \(bind: weapon.damage), \(bind: weapon.roundsUsed)
            )
            """).run()
    }
    for row in stats.duels {
        try await sql.raw("""
            INSERT INTO duel_side_stats
              (match_id, killer_match_player_id, victim_match_player_id, killer_side, kills)
            VALUES (
              \(bind: matchID), \(bind: actorID), \(bind: playerIDs[row.opponentPlayerIndex]),
              \(bind: side.rawValue), \(bind: row.kills)
            )
            """).run()
    }
    for row in stats.trades {
        try await sql.raw("""
            INSERT INTO trade_side_stats
              (match_id, trader_match_player_id, teammate_match_player_id, trader_side,
               opportunities, attempts, successes, opening_successes)
            VALUES (
              \(bind: matchID), \(bind: actorID), \(bind: playerIDs[row.teammatePlayerIndex]), \(bind: side.rawValue),
              \(bind: row.opportunities), \(bind: row.attempts), \(bind: row.successes), \(bind: row.openingSuccesses)
            )
            """).run()
    }
    for row in stats.contexts {
        try await sql.raw("""
            INSERT INTO kill_context_side_stats (
              match_id, killer_match_player_id, victim_match_player_id, killer_side,
              victim_blinded_kills, attacker_blind_kills, wallbang_kills, penetration_total,
              smoke_kills, airborne_kills, moving_kills, still_kills, running_kills,
              victim_grenade_out_kills, victim_knife_out_kills,
              equipment_disadvantage_kills, unfair_kills
            ) VALUES (
              \(bind: matchID), \(bind: actorID), \(bind: playerIDs[row.victimPlayerIndex]), \(bind: side.rawValue),
              \(bind: row.victimBlindedKills), \(bind: row.attackerBlindKills),
              \(bind: row.wallbangKills), \(bind: row.penetrationTotal),
              \(bind: row.smokeKills), \(bind: row.airborneKills), \(bind: row.movingKills),
              \(bind: row.stillKills), \(bind: row.runningKills), \(bind: row.victimGrenadeOutKills),
              \(bind: row.victimKnifeOutKills), \(bind: row.equipmentDisadvantageKills), \(bind: row.unfairKills)
            )
            """).run()
    }
    for row in stats.assistedBy {
        try await sql.raw("""
            INSERT INTO assisted_kill_side_stats (
              match_id, beneficiary_match_player_id, assister_match_player_id, beneficiary_side,
              damage_assisted_kills, teammate_flash_assisted_kills, own_flash_kills,
              opening_assists, opening_damage_assists, opening_flash_assists
            ) VALUES (
              \(bind: matchID), \(bind: actorID), \(bind: playerIDs[row.assisterPlayerIndex]), \(bind: side.rawValue),
              \(bind: row.damageAssistedKills), \(bind: row.teammateFlashAssistedKills), \(bind: row.ownFlashKills),
              \(bind: row.openingAssists), \(bind: row.openingDamageAssists), \(bind: row.openingFlashAssists)
            )
            """).run()
    }
    for row in stats.flashes {
        try await sql.raw("""
            INSERT INTO flash_side_stats (
              match_id, thrower_match_player_id, victim_match_player_id, thrower_side,
              flash_effects, blind_duration_ms
            ) VALUES (
              \(bind: matchID), \(bind: actorID), \(bind: playerIDs[row.victimPlayerIndex]), \(bind: side.rawValue),
              \(bind: row.effects), \(bind: row.blindDurationMilliseconds)
            )
            """).run()
    }
}
