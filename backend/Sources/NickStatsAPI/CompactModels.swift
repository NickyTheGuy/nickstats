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

struct OpeningStats: Codable, Sendable {
    var kills: Int
    var deaths: Int

    init(kills: Int, deaths: Int) {
        self.kills = kills
        self.deaths = deaths
    }

    init(from decoder: any Decoder) throws {
        var values = try decoder.unkeyedContainer()
        kills = try values.decode(Int.self)
        deaths = try values.decode(Int.self)
        try rejectExtraValues(in: values, description: "Opening statistics")
    }

    func encode(to encoder: any Encoder) throws {
        var values = encoder.unkeyedContainer()
        try values.encode(kills)
        try values.encode(deaths)
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

    init(teammatePlayerIndex: Int, opportunities: Int, attempts: Int, successes: Int) {
        self.teammatePlayerIndex = teammatePlayerIndex
        self.opportunities = opportunities
        self.attempts = attempts
        self.successes = successes
    }

    init(from decoder: any Decoder) throws {
        var values = try decoder.unkeyedContainer()
        teammatePlayerIndex = try values.decode(Int.self)
        opportunities = try values.decode(Int.self)
        attempts = try values.decode(Int.self)
        successes = try values.decode(Int.self)
        try rejectExtraValues(in: values, description: "Trade statistics")
    }

    func encode(to encoder: any Encoder) throws {
        var values = encoder.unkeyedContainer()
        try values.encode(teammatePlayerIndex)
        try values.encode(opportunities)
        try values.encode(attempts)
        try values.encode(successes)
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

    init(assisterPlayerIndex: Int, damageAssistedKills: Int, teammateFlashAssistedKills: Int, ownFlashKills: Int) {
        self.assisterPlayerIndex = assisterPlayerIndex
        self.damageAssistedKills = damageAssistedKills
        self.teammateFlashAssistedKills = teammateFlashAssistedKills
        self.ownFlashKills = ownFlashKills
    }

    init(from decoder: any Decoder) throws {
        var values = try decoder.unkeyedContainer()
        assisterPlayerIndex = try values.decode(Int.self)
        damageAssistedKills = try values.decode(Int.self)
        teammateFlashAssistedKills = try values.decode(Int.self)
        ownFlashKills = try values.decode(Int.self)
        try rejectExtraValues(in: values, description: "Assisted-kill statistics")
    }

    func encode(to encoder: any Encoder) throws {
        var values = encoder.unkeyedContainer()
        try values.encode(assisterPlayerIndex)
        try values.encode(damageAssistedKills)
        try values.encode(teammateFlashAssistedKills)
        try values.encode(ownFlashKills)
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
