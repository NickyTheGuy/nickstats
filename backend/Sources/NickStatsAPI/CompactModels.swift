import Foundation

func rejectExtraValues(
    in values: UnkeyedDecodingContainer,
    description: String
) throws {
    guard values.isAtEnd else {
        throw DecodingError.dataCorruptedError(
            in: values,
            debugDescription: "\(description) contains too many values."
        )
    }
}

struct TradeRules: Codable, Sendable {
    var windowSeconds: Double
    var proximityUnits: Double
    var engagementLullSeconds: Double
    var bulletPathToleranceUnits: Double
    var unarmoredHEDamageCap: Double
    var armoredHEDamageCap: Double

    init(
        windowSeconds: Double,
        proximityUnits: Double,
        engagementLullSeconds: Double,
        bulletPathToleranceUnits: Double,
        unarmoredHEDamageCap: Double,
        armoredHEDamageCap: Double
    ) {
        self.windowSeconds = windowSeconds
        self.proximityUnits = proximityUnits
        self.engagementLullSeconds = engagementLullSeconds
        self.bulletPathToleranceUnits = bulletPathToleranceUnits
        self.unarmoredHEDamageCap = unarmoredHEDamageCap
        self.armoredHEDamageCap = armoredHEDamageCap
    }

    init(from decoder: any Decoder) throws {
        var values = try decoder.unkeyedContainer()
        windowSeconds = try values.decode(Double.self)
        proximityUnits = try values.decode(Double.self)
        engagementLullSeconds = try values.decode(Double.self)
        bulletPathToleranceUnits = try values.decode(Double.self)
        unarmoredHEDamageCap = try values.decode(Double.self)
        armoredHEDamageCap = try values.decode(Double.self)
        try rejectExtraValues(in: values, description: "Trade rules")
    }

    func encode(to encoder: any Encoder) throws {
        var values = encoder.unkeyedContainer()
        try values.encode(windowSeconds)
        try values.encode(proximityUnits)
        try values.encode(engagementLullSeconds)
        try values.encode(bulletPathToleranceUnits)
        try values.encode(unarmoredHEDamageCap)
        try values.encode(armoredHEDamageCap)
    }
}

struct MovementRules: Codable, Sendable {
    var stillSpeedToleranceUnitsPerSecond: Double
    var runningThresholdPercentOfWeaponMax: Double

    init(stillSpeedToleranceUnitsPerSecond: Double, runningThresholdPercentOfWeaponMax: Double) {
        self.stillSpeedToleranceUnitsPerSecond = stillSpeedToleranceUnitsPerSecond
        self.runningThresholdPercentOfWeaponMax = runningThresholdPercentOfWeaponMax
    }

    init(from decoder: any Decoder) throws {
        var values = try decoder.unkeyedContainer()
        stillSpeedToleranceUnitsPerSecond = try values.decode(Double.self)
        runningThresholdPercentOfWeaponMax = try values.decode(Double.self)
        try rejectExtraValues(in: values, description: "Movement rules")
    }

    func encode(to encoder: any Encoder) throws {
        var values = encoder.unkeyedContainer()
        try values.encode(stillSpeedToleranceUnitsPerSecond)
        try values.encode(runningThresholdPercentOfWeaponMax)
    }
}

struct SideScores: Codable, Sendable {
    var terrorist: Int
    var counterTerrorist: Int

    init(terrorist: Int, counterTerrorist: Int) {
        self.terrorist = terrorist
        self.counterTerrorist = counterTerrorist
    }

    var total: Int { terrorist + counterTerrorist }

    init(from decoder: any Decoder) throws {
        var values = try decoder.unkeyedContainer()
        terrorist = try values.decode(Int.self)
        counterTerrorist = try values.decode(Int.self)
        try rejectExtraValues(in: values, description: "Side scores")
    }

    func encode(to encoder: any Encoder) throws {
        var values = encoder.unkeyedContainer()
        try values.encode(terrorist)
        try values.encode(counterTerrorist)
    }
}

struct RoundTimingPayload: Codable, Sendable {
    var round: Int
    var liveStartTick: Int64
    var endTick: Int64
    var durationMilliseconds: Int
    var winnerSide: PlayerSide?
    var bombPlantElapsedMilliseconds: Int?

    init(round: Int, liveStartTick: Int64, endTick: Int64, durationMilliseconds: Int, winnerSide: PlayerSide?, bombPlantElapsedMilliseconds: Int?) {
        self.round = round
        self.liveStartTick = liveStartTick
        self.endTick = endTick
        self.durationMilliseconds = durationMilliseconds
        self.winnerSide = winnerSide
        self.bombPlantElapsedMilliseconds = bombPlantElapsedMilliseconds
    }

    init(from decoder: any Decoder) throws {
        var values = try decoder.unkeyedContainer()
        round = try values.decode(Int.self)
        liveStartTick = try values.decode(Int64.self)
        endTick = try values.decode(Int64.self)
        durationMilliseconds = try values.decode(Int.self)
        winnerSide = try values.decodeIfPresent(PlayerSide.self)
        bombPlantElapsedMilliseconds = try values.decodeIfPresent(Int.self)
        try rejectExtraValues(in: values, description: "Round timing row")
    }

    func encode(to encoder: any Encoder) throws {
        var values = encoder.unkeyedContainer()
        try values.encode(round)
        try values.encode(liveStartTick)
        try values.encode(endTick)
        try values.encode(durationMilliseconds)
        try values.encode(winnerSide)
        try values.encode(bombPlantElapsedMilliseconds)
    }
}

struct RoundSurvivorPayload: Codable, Sendable {
    var round: Int
    var terroristAlive: Int
    var counterTerroristAlive: Int

    init(round: Int, terroristAlive: Int, counterTerroristAlive: Int) {
        self.round = round
        self.terroristAlive = terroristAlive
        self.counterTerroristAlive = counterTerroristAlive
    }

    init(from decoder: any Decoder) throws {
        var values = try decoder.unkeyedContainer()
        round = try values.decode(Int.self)
        terroristAlive = try values.decode(Int.self)
        counterTerroristAlive = try values.decode(Int.self)
        try rejectExtraValues(in: values, description: "Round survivor row")
    }

    func encode(to encoder: any Encoder) throws {
        var values = encoder.unkeyedContainer()
        try values.encode(round)
        try values.encode(terroristAlive)
        try values.encode(counterTerroristAlive)
    }
}

struct RoundEconomyPayload: Codable, Sendable {
    var round: Int
    var terroristEquipmentValue: Int
    var counterTerroristEquipmentValue: Int
    var terroristPlayers: Int
    var counterTerroristPlayers: Int
    var pistolRound: Bool
    var terroristTeamIndex: Int
    var counterTerroristTeamIndex: Int

    init(
        round: Int, terroristEquipmentValue: Int, counterTerroristEquipmentValue: Int,
        terroristPlayers: Int, counterTerroristPlayers: Int, pistolRound: Bool,
        terroristTeamIndex: Int, counterTerroristTeamIndex: Int
    ) {
        self.round = round
        self.terroristEquipmentValue = terroristEquipmentValue
        self.counterTerroristEquipmentValue = counterTerroristEquipmentValue
        self.terroristPlayers = terroristPlayers
        self.counterTerroristPlayers = counterTerroristPlayers
        self.pistolRound = pistolRound
        self.terroristTeamIndex = terroristTeamIndex
        self.counterTerroristTeamIndex = counterTerroristTeamIndex
    }

    init(from decoder: any Decoder) throws {
        var values = try decoder.unkeyedContainer()
        round = try values.decode(Int.self)
        terroristEquipmentValue = try values.decode(Int.self)
        counterTerroristEquipmentValue = try values.decode(Int.self)
        terroristPlayers = try values.decode(Int.self)
        counterTerroristPlayers = try values.decode(Int.self)
        pistolRound = try values.decode(Bool.self)
        terroristTeamIndex = try values.decode(Int.self)
        counterTerroristTeamIndex = try values.decode(Int.self)
        try rejectExtraValues(in: values, description: "Round economy row")
    }

    func encode(to encoder: any Encoder) throws {
        var values = encoder.unkeyedContainer()
        try values.encode(round)
        try values.encode(terroristEquipmentValue)
        try values.encode(counterTerroristEquipmentValue)
        try values.encode(terroristPlayers)
        try values.encode(counterTerroristPlayers)
        try values.encode(pistolRound)
        try values.encode(terroristTeamIndex)
        try values.encode(counterTerroristTeamIndex)
    }
}

struct DeathEventPayload: Codable, Sendable {
    var round: Int
    var sequence: Int
    var tick: Int64
    var elapsedMilliseconds: Int
    var killerPlayerIndex: Int?
    var victimPlayerIndex: Int
    var killerSide: PlayerSide?
    var victimSide: PlayerSide
    var weapon: String
    var enemyKill: Bool
    var flags: Int
    var terroristAliveBefore: Int
    var counterTerroristAliveBefore: Int
    var sincePlantMilliseconds: Int?

    init(round: Int, sequence: Int, tick: Int64, elapsedMilliseconds: Int, killerPlayerIndex: Int?, victimPlayerIndex: Int, killerSide: PlayerSide?, victimSide: PlayerSide, weapon: String, enemyKill: Bool, flags: Int, terroristAliveBefore: Int, counterTerroristAliveBefore: Int, sincePlantMilliseconds: Int?) {
        self.round = round
        self.sequence = sequence
        self.tick = tick
        self.elapsedMilliseconds = elapsedMilliseconds
        self.killerPlayerIndex = killerPlayerIndex
        self.victimPlayerIndex = victimPlayerIndex
        self.killerSide = killerSide
        self.victimSide = victimSide
        self.weapon = weapon
        self.enemyKill = enemyKill
        self.flags = flags
        self.terroristAliveBefore = terroristAliveBefore
        self.counterTerroristAliveBefore = counterTerroristAliveBefore
        self.sincePlantMilliseconds = sincePlantMilliseconds
    }

    init(from decoder: any Decoder) throws {
        var values = try decoder.unkeyedContainer()
        round = try values.decode(Int.self)
        sequence = try values.decode(Int.self)
        tick = try values.decode(Int64.self)
        elapsedMilliseconds = try values.decode(Int.self)
        killerPlayerIndex = try values.decodeIfPresent(Int.self)
        victimPlayerIndex = try values.decode(Int.self)
        killerSide = try values.decodeIfPresent(PlayerSide.self)
        victimSide = try values.decode(PlayerSide.self)
        weapon = try values.decode(String.self)
        enemyKill = try values.decode(Bool.self)
        flags = try values.decode(Int.self)
        terroristAliveBefore = try values.decode(Int.self)
        counterTerroristAliveBefore = try values.decode(Int.self)
        sincePlantMilliseconds = try values.decodeIfPresent(Int.self)
        try rejectExtraValues(in: values, description: "Death event row")
    }

    func encode(to encoder: any Encoder) throws {
        var values = encoder.unkeyedContainer()
        try values.encode(round)
        try values.encode(sequence)
        try values.encode(tick)
        try values.encode(elapsedMilliseconds)
        try values.encode(killerPlayerIndex)
        try values.encode(victimPlayerIndex)
        try values.encode(killerSide)
        try values.encode(victimSide)
        try values.encode(weapon)
        try values.encode(enemyKill)
        try values.encode(flags)
        try values.encode(terroristAliveBefore)
        try values.encode(counterTerroristAliveBefore)
        try values.encode(sincePlantMilliseconds)
    }
}

struct PlayerSideStats: Codable, Sendable {
    var terrorist: SideStatsPayload
    var counterTerrorist: SideStatsPayload

    init(terrorist: SideStatsPayload, counterTerrorist: SideStatsPayload) {
        self.terrorist = terrorist
        self.counterTerrorist = counterTerrorist
    }

    subscript(side: PlayerSide) -> SideStatsPayload {
        get {
            switch side {
            case .terrorist: terrorist
            case .counterTerrorist: counterTerrorist
            }
        }
        set {
            switch side {
            case .terrorist: terrorist = newValue
            case .counterTerrorist: counterTerrorist = newValue
            }
        }
    }

    init(from decoder: any Decoder) throws {
        var values = try decoder.unkeyedContainer()
        terrorist = try values.decode(SideStatsPayload.self)
        counterTerrorist = try values.decode(SideStatsPayload.self)
        try rejectExtraValues(in: values, description: "Player side statistics")
    }

    func encode(to encoder: any Encoder) throws {
        var values = encoder.unkeyedContainer()
        try values.encode(terrorist)
        try values.encode(counterTerrorist)
    }
}

struct RoundRecord: Codable, Sendable {
    var played: Int
    var won: Int

    init(played: Int, won: Int) {
        self.played = played
        self.won = won
    }

    init(from decoder: any Decoder) throws {
        var values = try decoder.unkeyedContainer()
        played = try values.decode(Int.self)
        won = try values.decode(Int.self)
        try rejectExtraValues(in: values, description: "Round record")
    }

    func encode(to encoder: any Encoder) throws {
        var values = encoder.unkeyedContainer()
        try values.encode(played)
        try values.encode(won)
    }
}

struct CombatStats: Codable, Sendable {
    var kills: Int
    var deaths: Int
    var assists: Int
    var headshots: Int
    var damage: Int

    init(kills: Int, deaths: Int, assists: Int, headshots: Int, damage: Int) {
        self.kills = kills
        self.deaths = deaths
        self.assists = assists
        self.headshots = headshots
        self.damage = damage
    }

    init(from decoder: any Decoder) throws {
        var values = try decoder.unkeyedContainer()
        kills = try values.decode(Int.self)
        deaths = try values.decode(Int.self)
        assists = try values.decode(Int.self)
        headshots = try values.decode(Int.self)
        damage = try values.decode(Int.self)
        try rejectExtraValues(in: values, description: "Combat statistics")
    }

    func encode(to encoder: any Encoder) throws {
        var values = encoder.unkeyedContainer()
        try values.encode(kills)
        try values.encode(deaths)
        try values.encode(assists)
        try values.encode(headshots)
        try values.encode(damage)
    }
}

struct EconomyMatchupStats: Codable, Sendable {
    var ownBuyIndex: Int
    var opponentBuyIndex: Int
    var resultIndex: Int
    var sideIndex: Int
    var stats: SideStatsPayload

    init(ownBuyIndex: Int, opponentBuyIndex: Int, resultIndex: Int, sideIndex: Int, stats: SideStatsPayload) {
        self.ownBuyIndex = ownBuyIndex
        self.opponentBuyIndex = opponentBuyIndex
        self.resultIndex = resultIndex
        self.sideIndex = sideIndex
        self.stats = stats
    }

    init(from decoder: any Decoder) throws {
        var values = try decoder.unkeyedContainer()
        ownBuyIndex = try values.decode(Int.self)
        opponentBuyIndex = try values.decode(Int.self)
        resultIndex = try values.decode(Int.self)
        sideIndex = try values.decode(Int.self)
        stats = try values.decode(SideStatsPayload.self)
        try rejectExtraValues(in: values, description: "Economy matchup statistics")
    }

    func encode(to encoder: any Encoder) throws {
        var values = encoder.unkeyedContainer()
        try values.encode(ownBuyIndex)
        try values.encode(opponentBuyIndex)
        try values.encode(resultIndex)
        try values.encode(sideIndex)
        try values.encode(stats)
    }
}

struct OpeningStats: Codable, Sendable {
    var kills: Int
    var deaths: Int
    var assistedKills: Int
    var damageAssistedKills: Int
    var flashAssistedKills: Int
    var tradedDeaths: Int
    var tradeKills: Int
    var assists: Int
    var damageAssists: Int
    var flashAssists: Int
    var blindedEnemyKills: Int
    var blindKills: Int
    var deathsWhileBlind: Int
    var deathsToBlindKiller: Int
    var enemyAssistedDeaths: Int
    var enemyDamageAssistedDeaths: Int
    var enemyFlashAssistedDeaths: Int
    var ownFlashKills: Int
    var victimSideFlashKills: Int
    var blindSourceUnknownKills: Int
    var deathsToKillerFlash: Int
    var deathsToOwnSideFlash: Int
    var deathsBlindSourceUnknown: Int

    init(kills: Int, deaths: Int, assistedKills: Int = 0, damageAssistedKills: Int = 0, flashAssistedKills: Int = 0, tradedDeaths: Int = 0, tradeKills: Int = 0, assists: Int = 0, damageAssists: Int = 0, flashAssists: Int = 0, blindedEnemyKills: Int = 0, blindKills: Int = 0, deathsWhileBlind: Int = 0, deathsToBlindKiller: Int = 0, enemyAssistedDeaths: Int = 0, enemyDamageAssistedDeaths: Int = 0, enemyFlashAssistedDeaths: Int = 0, ownFlashKills: Int = 0, victimSideFlashKills: Int = 0, blindSourceUnknownKills: Int = 0, deathsToKillerFlash: Int = 0, deathsToOwnSideFlash: Int = 0, deathsBlindSourceUnknown: Int = 0) {
        self.kills = kills
        self.deaths = deaths
        self.assistedKills = assistedKills
        self.damageAssistedKills = damageAssistedKills
        self.flashAssistedKills = flashAssistedKills
        self.tradedDeaths = tradedDeaths
        self.tradeKills = tradeKills
        self.assists = assists
        self.damageAssists = damageAssists
        self.flashAssists = flashAssists
        self.blindedEnemyKills = blindedEnemyKills
        self.blindKills = blindKills
        self.deathsWhileBlind = deathsWhileBlind
        self.deathsToBlindKiller = deathsToBlindKiller
        self.enemyAssistedDeaths = enemyAssistedDeaths
        self.enemyDamageAssistedDeaths = enemyDamageAssistedDeaths
        self.enemyFlashAssistedDeaths = enemyFlashAssistedDeaths
        self.ownFlashKills = ownFlashKills
        self.victimSideFlashKills = victimSideFlashKills
        self.blindSourceUnknownKills = blindSourceUnknownKills
        self.deathsToKillerFlash = deathsToKillerFlash
        self.deathsToOwnSideFlash = deathsToOwnSideFlash
        self.deathsBlindSourceUnknown = deathsBlindSourceUnknown
    }

    init(from decoder: any Decoder) throws {
        var values = try decoder.unkeyedContainer()
        kills = try values.decode(Int.self)
        deaths = try values.decode(Int.self)
        assistedKills = values.isAtEnd ? 0 : try values.decode(Int.self)
        damageAssistedKills = values.isAtEnd ? 0 : try values.decode(Int.self)
        flashAssistedKills = values.isAtEnd ? 0 : try values.decode(Int.self)
        tradedDeaths = values.isAtEnd ? 0 : try values.decode(Int.self)
        tradeKills = values.isAtEnd ? 0 : try values.decode(Int.self)
        assists = values.isAtEnd ? 0 : try values.decode(Int.self)
        damageAssists = values.isAtEnd ? 0 : try values.decode(Int.self)
        flashAssists = values.isAtEnd ? 0 : try values.decode(Int.self)
        blindedEnemyKills = values.isAtEnd ? 0 : try values.decode(Int.self)
        blindKills = values.isAtEnd ? 0 : try values.decode(Int.self)
        deathsWhileBlind = values.isAtEnd ? 0 : try values.decode(Int.self)
        deathsToBlindKiller = values.isAtEnd ? 0 : try values.decode(Int.self)
        enemyAssistedDeaths = values.isAtEnd ? 0 : try values.decode(Int.self)
        enemyDamageAssistedDeaths = values.isAtEnd ? 0 : try values.decode(Int.self)
        enemyFlashAssistedDeaths = values.isAtEnd ? 0 : try values.decode(Int.self)
        ownFlashKills = values.isAtEnd ? 0 : try values.decode(Int.self)
        victimSideFlashKills = values.isAtEnd ? 0 : try values.decode(Int.self)
        blindSourceUnknownKills = values.isAtEnd ? 0 : try values.decode(Int.self)
        deathsToKillerFlash = values.isAtEnd ? 0 : try values.decode(Int.self)
        deathsToOwnSideFlash = values.isAtEnd ? 0 : try values.decode(Int.self)
        deathsBlindSourceUnknown = values.isAtEnd ? 0 : try values.decode(Int.self)
        try rejectExtraValues(in: values, description: "Opening statistics")
    }

    func encode(to encoder: any Encoder) throws {
        var values = encoder.unkeyedContainer()
        try values.encode(kills)
        try values.encode(deaths)
        try values.encode(assistedKills)
        try values.encode(damageAssistedKills)
        try values.encode(flashAssistedKills)
        try values.encode(tradedDeaths)
        try values.encode(tradeKills)
        try values.encode(assists)
        try values.encode(damageAssists)
        try values.encode(flashAssists)
        try values.encode(blindedEnemyKills)
        try values.encode(blindKills)
        try values.encode(deathsWhileBlind)
        try values.encode(deathsToBlindKiller)
        try values.encode(enemyAssistedDeaths)
        try values.encode(enemyDamageAssistedDeaths)
        try values.encode(enemyFlashAssistedDeaths)
        try values.encode(ownFlashKills)
        try values.encode(victimSideFlashKills)
        try values.encode(blindSourceUnknownKills)
        try values.encode(deathsToKillerFlash)
        try values.encode(deathsToOwnSideFlash)
        try values.encode(deathsBlindSourceUnknown)
    }
}

struct TradeDeathStats: Codable, Sendable {
    var tradeable: Int
    var attempted: Int
    var traded: Int

    init(tradeable: Int, attempted: Int, traded: Int) {
        self.tradeable = tradeable
        self.attempted = attempted
        self.traded = traded
    }

    init(from decoder: any Decoder) throws {
        var values = try decoder.unkeyedContainer()
        tradeable = try values.decode(Int.self)
        attempted = try values.decode(Int.self)
        traded = try values.decode(Int.self)
        try rejectExtraValues(in: values, description: "Trade-death statistics")
    }

    func encode(to encoder: any Encoder) throws {
        var values = encoder.unkeyedContainer()
        try values.encode(tradeable)
        try values.encode(attempted)
        try values.encode(traded)
    }
}

struct UtilityDamage: Codable, Sendable {
    var highExplosive: Int
    var fire: Int

    init(highExplosive: Int, fire: Int) {
        self.highExplosive = highExplosive
        self.fire = fire
    }

    init(from decoder: any Decoder) throws {
        var values = try decoder.unkeyedContainer()
        highExplosive = try values.decode(Int.self)
        fire = try values.decode(Int.self)
        try rejectExtraValues(in: values, description: "Utility damage")
    }

    func encode(to encoder: any Encoder) throws {
        var values = encoder.unkeyedContainer()
        try values.encode(highExplosive)
        try values.encode(fire)
    }
}

struct UtilityThrown: Codable, Sendable {
    var highExplosive: Int
    var flashbang: Int
    var smoke: Int
    var fire: Int
    var decoy: Int

    static var zero: UtilityThrown {
        UtilityThrown(highExplosive: 0, flashbang: 0, smoke: 0, fire: 0, decoy: 0)
    }

    init(highExplosive: Int, flashbang: Int, smoke: Int, fire: Int, decoy: Int) {
        self.highExplosive = highExplosive
        self.flashbang = flashbang
        self.smoke = smoke
        self.fire = fire
        self.decoy = decoy
    }

    init(from decoder: any Decoder) throws {
        var values = try decoder.unkeyedContainer()
        highExplosive = try values.decode(Int.self)
        flashbang = try values.decode(Int.self)
        smoke = try values.decode(Int.self)
        fire = try values.decode(Int.self)
        decoy = try values.decode(Int.self)
        try rejectExtraValues(in: values, description: "Utility thrown")
    }

    func encode(to encoder: any Encoder) throws {
        var values = encoder.unkeyedContainer()
        for count in [highExplosive, flashbang, smoke, fire, decoy] { try values.encode(count) }
    }
}

struct ObjectiveStats: Codable, Sendable {
    var plants: Int
    var defuses: Int

    static var zero: ObjectiveStats { ObjectiveStats(plants: 0, defuses: 0) }

    init(plants: Int, defuses: Int) {
        self.plants = plants
        self.defuses = defuses
    }

    init(from decoder: any Decoder) throws {
        var values = try decoder.unkeyedContainer()
        plants = try values.decode(Int.self)
        defuses = try values.decode(Int.self)
        try rejectExtraValues(in: values, description: "Objective statistics")
    }

    func encode(to encoder: any Encoder) throws {
        var values = encoder.unkeyedContainer()
        try values.encode(plants)
        try values.encode(defuses)
    }
}

struct SpeedSummary: Sendable {
    var total: Double
    var samples: Int
    var maximum: Double?
    var percentOfMaximumTotal: Double
    var percentOfMaximumSamples: Int
    var percentOfMaximumPeak: Double?
}

struct SpeedStats: Codable, Sendable {
    var kills: SpeedSummary
    var deaths: SpeedSummary

    init(kills: SpeedSummary, deaths: SpeedSummary) {
        self.kills = kills
        self.deaths = deaths
    }

    init(from decoder: any Decoder) throws {
        var values = try decoder.unkeyedContainer()
        kills = try Self.decodeSummary(from: &values)
        deaths = try Self.decodeSummary(from: &values)
        try rejectExtraValues(in: values, description: "Speed statistics")
    }

    func encode(to encoder: any Encoder) throws {
        var values = encoder.unkeyedContainer()
        try Self.encode(kills, to: &values)
        try Self.encode(deaths, to: &values)
    }

    private static func decodeSummary(from values: inout UnkeyedDecodingContainer) throws -> SpeedSummary {
        SpeedSummary(
            total: try values.decode(Double.self),
            samples: try values.decode(Int.self),
            maximum: try values.decodeIfPresent(Double.self),
            percentOfMaximumTotal: try values.decode(Double.self),
            percentOfMaximumSamples: try values.decode(Int.self),
            percentOfMaximumPeak: try values.decodeIfPresent(Double.self)
        )
    }

    private static func encode(_ summary: SpeedSummary, to values: inout UnkeyedEncodingContainer) throws {
        try values.encode(summary.total)
        try values.encode(summary.samples)
        try values.encode(summary.maximum)
        try values.encode(summary.percentOfMaximumTotal)
        try values.encode(summary.percentOfMaximumSamples)
        try values.encode(summary.percentOfMaximumPeak)
    }
}

struct ClutchWins: Codable, Sendable {
    var oneVersusOne: Int
    var oneVersusTwo: Int
    var oneVersusThree: Int
    var oneVersusFour: Int
    var oneVersusFive: Int

    init(oneVersusOne: Int, oneVersusTwo: Int, oneVersusThree: Int, oneVersusFour: Int, oneVersusFive: Int) {
        self.oneVersusOne = oneVersusOne
        self.oneVersusTwo = oneVersusTwo
        self.oneVersusThree = oneVersusThree
        self.oneVersusFour = oneVersusFour
        self.oneVersusFive = oneVersusFive
    }

    var values: [Int] { [oneVersusOne, oneVersusTwo, oneVersusThree, oneVersusFour, oneVersusFive] }

    static var zero: ClutchWins {
        ClutchWins(oneVersusOne: 0, oneVersusTwo: 0, oneVersusThree: 0, oneVersusFour: 0, oneVersusFive: 0)
    }

    init(from decoder: any Decoder) throws {
        var values = try decoder.unkeyedContainer()
        oneVersusOne = try values.decode(Int.self)
        oneVersusTwo = try values.decode(Int.self)
        oneVersusThree = try values.decode(Int.self)
        oneVersusFour = try values.decode(Int.self)
        oneVersusFive = try values.decode(Int.self)
        try rejectExtraValues(in: values, description: "Clutch wins")
    }

    func encode(to encoder: any Encoder) throws {
        var values = encoder.unkeyedContainer()
        for count in self.values { try values.encode(count) }
    }
}

struct KillRoundCounts: Codable, Sendable {
    var oneKill: Int
    var twoKills: Int
    var threeKills: Int
    var fourKills: Int
    var fiveKills: Int

    init(oneKill: Int, twoKills: Int, threeKills: Int, fourKills: Int, fiveKills: Int) {
        self.oneKill = oneKill
        self.twoKills = twoKills
        self.threeKills = threeKills
        self.fourKills = fourKills
        self.fiveKills = fiveKills
    }

    var values: [Int] { [oneKill, twoKills, threeKills, fourKills, fiveKills] }

    init(from decoder: any Decoder) throws {
        var values = try decoder.unkeyedContainer()
        oneKill = try values.decode(Int.self)
        twoKills = try values.decode(Int.self)
        threeKills = try values.decode(Int.self)
        fourKills = try values.decode(Int.self)
        fiveKills = try values.decode(Int.self)
        try rejectExtraValues(in: values, description: "Kill-round counts")
    }

    func encode(to encoder: any Encoder) throws {
        var values = encoder.unkeyedContainer()
        for count in self.values { try values.encode(count) }
    }
}

struct DuelStats: Codable, Sendable {
    var opponentPlayerIndex: Int
    var kills: Int

    init(opponentPlayerIndex: Int, kills: Int) {
        self.opponentPlayerIndex = opponentPlayerIndex
        self.kills = kills
    }

    init(from decoder: any Decoder) throws {
        var values = try decoder.unkeyedContainer()
        opponentPlayerIndex = try values.decode(Int.self)
        kills = try values.decode(Int.self)
        try rejectExtraValues(in: values, description: "Duel statistics")
    }

    func encode(to encoder: any Encoder) throws {
        var values = encoder.unkeyedContainer()
        try values.encode(opponentPlayerIndex)
        try values.encode(kills)
    }
}

struct TradeStats: Codable, Sendable {
    var teammatePlayerIndex: Int
    var opportunities: Int
    var attempts: Int
    var successes: Int
    var openingSuccesses: Int

    init(teammatePlayerIndex: Int, opportunities: Int, attempts: Int, successes: Int, openingSuccesses: Int = 0) {
        self.teammatePlayerIndex = teammatePlayerIndex
        self.opportunities = opportunities
        self.attempts = attempts
        self.successes = successes
        self.openingSuccesses = openingSuccesses
    }

    init(from decoder: any Decoder) throws {
        var values = try decoder.unkeyedContainer()
        teammatePlayerIndex = try values.decode(Int.self)
        opportunities = try values.decode(Int.self)
        attempts = try values.decode(Int.self)
        successes = try values.decode(Int.self)
        openingSuccesses = values.isAtEnd ? 0 : try values.decode(Int.self)
        try rejectExtraValues(in: values, description: "Trade statistics")
    }

    func encode(to encoder: any Encoder) throws {
        var values = encoder.unkeyedContainer()
        try values.encode(teammatePlayerIndex)
        try values.encode(opportunities)
        try values.encode(attempts)
        try values.encode(successes)
        try values.encode(openingSuccesses)
    }
}

struct KillContextStats: Codable, Sendable {
    var victimPlayerIndex: Int
    var victimBlindedKills: Int
    var attackerBlindKills: Int
    var wallbangKills: Int
    var penetrationTotal: Int
    var smokeKills: Int
    var airborneKills: Int
    var movingKills: Int
    var stillKills: Int
    var runningKills: Int
    var victimGrenadeOutKills: Int
    var victimKnifeOutKills: Int
    var equipmentDisadvantageKills: Int
    var unfairKills: Int

    init(
        victimPlayerIndex: Int,
        victimBlindedKills: Int,
        attackerBlindKills: Int,
        wallbangKills: Int,
        penetrationTotal: Int,
        smokeKills: Int,
        airborneKills: Int,
        movingKills: Int,
        stillKills: Int,
        runningKills: Int,
        victimGrenadeOutKills: Int,
        victimKnifeOutKills: Int,
        equipmentDisadvantageKills: Int,
        unfairKills: Int
    ) {
        self.victimPlayerIndex = victimPlayerIndex
        self.victimBlindedKills = victimBlindedKills
        self.attackerBlindKills = attackerBlindKills
        self.wallbangKills = wallbangKills
        self.penetrationTotal = penetrationTotal
        self.smokeKills = smokeKills
        self.airborneKills = airborneKills
        self.movingKills = movingKills
        self.stillKills = stillKills
        self.runningKills = runningKills
        self.victimGrenadeOutKills = victimGrenadeOutKills
        self.victimKnifeOutKills = victimKnifeOutKills
        self.equipmentDisadvantageKills = equipmentDisadvantageKills
        self.unfairKills = unfairKills
    }

    init(from decoder: any Decoder) throws {
        var values = try decoder.unkeyedContainer()
        victimPlayerIndex = try values.decode(Int.self)
        victimBlindedKills = try values.decode(Int.self)
        attackerBlindKills = try values.decode(Int.self)
        wallbangKills = try values.decode(Int.self)
        penetrationTotal = try values.decode(Int.self)
        smokeKills = try values.decode(Int.self)
        airborneKills = try values.decode(Int.self)
        movingKills = try values.decode(Int.self)
        stillKills = try values.decode(Int.self)
        runningKills = try values.decode(Int.self)
        victimGrenadeOutKills = try values.decode(Int.self)
        victimKnifeOutKills = try values.decode(Int.self)
        equipmentDisadvantageKills = try values.decode(Int.self)
        unfairKills = try values.decode(Int.self)
        try rejectExtraValues(in: values, description: "Kill-context statistics")
    }

    func encode(to encoder: any Encoder) throws {
        var values = encoder.unkeyedContainer()
        try values.encode(victimPlayerIndex)
        try values.encode(victimBlindedKills)
        try values.encode(attackerBlindKills)
        try values.encode(wallbangKills)
        try values.encode(penetrationTotal)
        try values.encode(smokeKills)
        try values.encode(airborneKills)
        try values.encode(movingKills)
        try values.encode(stillKills)
        try values.encode(runningKills)
        try values.encode(victimGrenadeOutKills)
        try values.encode(victimKnifeOutKills)
        try values.encode(equipmentDisadvantageKills)
        try values.encode(unfairKills)
    }
}

struct AssistedKillStats: Codable, Sendable {
    var assisterPlayerIndex: Int
    var damageAssistedKills: Int
    var teammateFlashAssistedKills: Int
    var ownFlashKills: Int
    var openingAssists: Int
    var openingDamageAssists: Int
    var openingFlashAssists: Int

    init(assisterPlayerIndex: Int, damageAssistedKills: Int, teammateFlashAssistedKills: Int, ownFlashKills: Int, openingAssists: Int = 0, openingDamageAssists: Int = 0, openingFlashAssists: Int = 0) {
        self.assisterPlayerIndex = assisterPlayerIndex
        self.damageAssistedKills = damageAssistedKills
        self.teammateFlashAssistedKills = teammateFlashAssistedKills
        self.ownFlashKills = ownFlashKills
        self.openingAssists = openingAssists
        self.openingDamageAssists = openingDamageAssists
        self.openingFlashAssists = openingFlashAssists
    }

    init(from decoder: any Decoder) throws {
        var values = try decoder.unkeyedContainer()
        assisterPlayerIndex = try values.decode(Int.self)
        damageAssistedKills = try values.decode(Int.self)
        teammateFlashAssistedKills = try values.decode(Int.self)
        ownFlashKills = try values.decode(Int.self)
        openingAssists = values.isAtEnd ? 0 : try values.decode(Int.self)
        openingDamageAssists = values.isAtEnd ? 0 : try values.decode(Int.self)
        openingFlashAssists = values.isAtEnd ? 0 : try values.decode(Int.self)
        try rejectExtraValues(in: values, description: "Assisted-kill statistics")
    }

    func encode(to encoder: any Encoder) throws {
        var values = encoder.unkeyedContainer()
        try values.encode(assisterPlayerIndex)
        try values.encode(damageAssistedKills)
        try values.encode(teammateFlashAssistedKills)
        try values.encode(ownFlashKills)
        try values.encode(openingAssists)
        try values.encode(openingDamageAssists)
        try values.encode(openingFlashAssists)
    }
}

struct FlashStats: Codable, Sendable {
    var victimPlayerIndex: Int
    var effects: Int
    var blindDurationMilliseconds: Int

    init(victimPlayerIndex: Int, effects: Int, blindDurationMilliseconds: Int) {
        self.victimPlayerIndex = victimPlayerIndex
        self.effects = effects
        self.blindDurationMilliseconds = blindDurationMilliseconds
    }

    init(from decoder: any Decoder) throws {
        var values = try decoder.unkeyedContainer()
        victimPlayerIndex = try values.decode(Int.self)
        effects = try values.decode(Int.self)
        blindDurationMilliseconds = try values.decode(Int.self)
        try rejectExtraValues(in: values, description: "Flash statistics")
    }

    func encode(to encoder: any Encoder) throws {
        var values = encoder.unkeyedContainer()
        try values.encode(victimPlayerIndex)
        try values.encode(effects)
        try values.encode(blindDurationMilliseconds)
    }
}
