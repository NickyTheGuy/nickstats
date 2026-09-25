import Vapor

let compactSchema = "nickstats.match/23"
let acceptedCompactSchemas = Set(["nickstats.match/9", "nickstats.match/10", "nickstats.match/11", "nickstats.match/12", "nickstats.match/13", "nickstats.match/14", "nickstats.match/15", "nickstats.match/16", "nickstats.match/17", "nickstats.match/18", "nickstats.match/19", "nickstats.match/20", "nickstats.match/21", "nickstats.match/22", compactSchema])
let timingCompactSchemas = Set(["nickstats.match/10", "nickstats.match/11", "nickstats.match/12", "nickstats.match/13", "nickstats.match/14", "nickstats.match/15", "nickstats.match/16", "nickstats.match/17", "nickstats.match/18", "nickstats.match/19", "nickstats.match/20", "nickstats.match/21", "nickstats.match/22", compactSchema])

enum PlayerSide: String, CaseIterable, Codable, Sendable {
    case terrorist = "T"
    case counterTerrorist = "CT"
}

struct MatchPayload: Content, Sendable {
    var schema: String
    var nickstatsBuild: String
    var parser: ParserMetadata
    var id: MatchIdentity
    var map: String
    var playedAt: Int64?
    var playedAtSource: String?
    var rounds: Int
    var roundTiming: [RoundTimingPayload]? = nil
    var roundSurvivors: [RoundSurvivorPayload]? = nil
    var roundEconomy: [RoundEconomyPayload]? = nil
    var deathEvents: [DeathEventPayload]? = nil
    var rules: ParserRules
    var teams: [TeamPayload]
    var players: [PlayerPayload]

    enum CodingKeys: String, CodingKey {
        case schema, parser, id, map, rounds, rules, teams, players
        case roundTiming = "round_timing"
        case roundSurvivors = "round_survivors"
        case roundEconomy = "round_economy"
        case deathEvents = "death_events"
        case nickstatsBuild = "nickstats_build"
        case playedAt = "played_at"
        case playedAtSource = "played_at_source"
    }
}

struct ParserMetadata: Codable, Sendable {
    var name: String
    var version: String

    init(name: String, version: String) {
        self.name = name
        self.version = version
    }

    init(from decoder: any Decoder) throws {
        var values = try decoder.unkeyedContainer()
        name = try values.decode(String.self)
        version = try values.decode(String.self)
        try rejectExtraValues(in: values, description: "Parser metadata")
    }

    func encode(to encoder: any Encoder) throws {
        var values = encoder.unkeyedContainer()
        try values.encode(name)
        try values.encode(version)
    }
}

struct MatchIdentity: Content, Sendable {
    var faceit: String?
    var sha256: String
}

struct ParserRules: Content, Sendable {
    var trade: TradeRules
    var movement: MovementRules
    var equipmentDisadvantageSeconds: Double

    enum CodingKeys: String, CodingKey {
        case trade, movement
        case equipmentDisadvantageSeconds = "equipment_disadvantage_seconds"
    }
}

struct TeamPayload: Content, Sendable {
    var id: String
    var name: String
    var score: Int?
    var sideScores: SideScores
    var players: [Int]

    enum CodingKeys: String, CodingKey {
        case id, name, score, players
        case sideScores = "side_scores"
    }
}

struct PlayerPayload: Content, Sendable {
    var name: String
    var steamID: String?
    var bot: Bool?
    var sides: PlayerSideStats
    var buys: [SideStatsPayload]? = nil
    var roundResults: [SideStatsPayload]? = nil
    var economyMatchups: [EconomyMatchupStats]? = nil
    var roundSlices: [PlayerRoundSlice]? = nil

    enum CodingKeys: String, CodingKey {
        case name, bot, sides, buys
        case roundResults = "round_results"
        case economyMatchups = "economy_matchups"
        case roundSlices = "round_slices"
        case steamID = "steam_id"
    }
}

struct PlayerRoundSlice: Content, Sendable {
    var round: Int
    var side: PlayerSide
    var buy: String?
    var opponentBuy: String?
    var result: String?
    var stats: SideStatsPayload
    var hero: Bool? = nil

    enum CodingKeys: String, CodingKey {
        case round, side, buy, result, stats, hero
        case opponentBuy = "opponent_buy"
    }
}

struct SideStatsPayload: Content, Sendable {
    var rounds: RoundRecord
    var combat: CombatStats
    var kastRounds: Int
    var opening: OpeningStats
    var tradeKills: Int
    var tradeDeaths: TradeDeathStats
    var utility: UtilityDamage
    var damageReceived: Int? = nil
    var utilityThrown: UtilityThrown? = nil
    var objectives: ObjectiveStats? = nil
    var speed: SpeedStats
    var clutches: ClutchWins
    var clutchAttempts: ClutchWins? = nil
    var killRounds: KillRoundCounts
    var trueKillRounds: KillRoundCounts? = nil
    var trueMultikillRounds: Int? = nil
    var weapons: [WeaponPayload]
    var duels: [DuelStats]
    var trades: [TradeStats]
    var contexts: [KillContextStats]
    var assistedBy: [AssistedKillStats]
    var flashes: [FlashStats]
    var profile: [Int]? = nil
    var hero: Bool? = nil

    enum CodingKeys: String, CodingKey {
        case rounds, opening, utility, objectives, speed, clutches, weapons, duels, trades, contexts, flashes, profile, hero
        case combat = "kda"
        case kastRounds = "kast_rounds"
        case tradeKills = "trade_kills"
        case tradeDeaths = "trade_d"
        case damageReceived = "damage_received"
        case utilityThrown = "utility_thrown"
        case clutchAttempts = "clutch_attempts"
        case killRounds = "kill_rounds"
        case trueKillRounds = "true_kill_rounds"
        case trueMultikillRounds = "true_multikill_rounds"
        case assistedBy = "assisted_by"
    }
}

struct WeaponPayload: Codable, Sendable {
    var weapon: String
    var kills: Int
    var shots: Int
    var hits: Int
    var damage: Int
    var roundsUsed: Int

    init(weapon: String, kills: Int, shots: Int, hits: Int, damage: Int, roundsUsed: Int) {
        self.weapon = weapon
        self.kills = kills
        self.shots = shots
        self.hits = hits
        self.damage = damage
        self.roundsUsed = roundsUsed
    }

    init(from decoder: any Decoder) throws {
        var values = try decoder.unkeyedContainer()
        weapon = try values.decode(String.self)
        kills = try values.decode(Int.self)
        shots = try values.decode(Int.self)
        damage = try values.decode(Int.self)
        roundsUsed = try values.decode(Int.self)
        hits = values.isAtEnd ? 0 : try values.decode(Int.self)
        try rejectExtraValues(in: values, description: "Weapon row")
    }

    func encode(to encoder: any Encoder) throws {
        var values = encoder.unkeyedContainer()
        try values.encode(weapon)
        try values.encode(kills)
        try values.encode(shots)
        try values.encode(damage)
        try values.encode(roundsUsed)
        try values.encode(hits)
    }
}

struct UploadResponse: Content {
    var id: Int64
    var created: Bool
    var replaced: Bool
}

struct HealthResponse: Content {
    var status: String
}

struct MatchSummary: Content {
    var id: Int64
    var provider: String?
    var providerMatchID: String?
    var sha256: String
    var map: String
    var playedAt: Int64?
    var rounds: Int
    var nickstatsBuild: String
    var teams: [TeamSummary]
    var viewerTeamSlot: Int?

    enum CodingKeys: String, CodingKey {
        case id, provider, sha256, map, rounds, teams
        case viewerTeamSlot = "viewer_team_slot"
        case providerMatchID = "provider_match_id"
        case playedAt = "played_at"
        case nickstatsBuild = "nickstats_build"
    }
}

struct TeamSummary: Content {
    var name: String
    var score: Int?
}

struct MatchListResponse: Content {
    var matches: [MatchSummary]
    var maps: [String]
    var earliestPlayedAt: Int64?
    var limit: Int
    var offset: Int

    enum CodingKeys: String, CodingKey {
        case matches, maps, limit, offset
        case earliestPlayedAt = "earliest_played_at"
    }
}

struct PlayerSummary: Content {
    var id: Int64
    var steamID: String
    var name: String
    var firstSeenAt: Int64?
    var lastSeenAt: Int64?
    var matchCount: Int

    enum CodingKeys: String, CodingKey {
        case id, name
        case steamID = "steam_id"
        case firstSeenAt = "first_seen_at"
        case lastSeenAt = "last_seen_at"
        case matchCount = "match_count"
    }
}

struct PlayerListResponse: Content {
    var players: [PlayerSummary]
    var limit: Int
    var offset: Int
}

struct PlayerProfileResponse: Content {
    var player: PlayerProfileIdentity
    var headline: PlayerHeadlineStats
    var totals: PlayerCareerTotals
    var utility: PlayerUtilityStats
    var trades: PlayerTradeProfileStats
    var openings: PlayerOpeningProfileStats
    var weapons: [PlayerWeaponProfileStats]
    var maps: [PlayerMapProfileStats]
    var matches: [ComparisonMatch]
}

/// The data the interactive profile UI actually needs. The full response remains
/// available for API clients that consume the precomputed career summaries.
struct PlayerProfileDataResponse: Content {
    var player: PlayerProfileIdentity
    var matches: [ComparisonMatch]
}

/// A wire-efficient profile response. Statistic names are sent once and each
/// side row carries only an aligned value array; null preserves unavailable
/// statistics without repeating hundreds of JSON object keys per row.
struct DensePlayerProfileDataResponse: Content, Sendable {
    var player: PlayerProfileIdentity
    var statKeys: [String]
    var matches: [DenseComparisonMatch]

    enum CodingKeys: String, CodingKey {
        case player, matches
        case statKeys = "stat_keys"
    }

    init(_ value: PlayerProfileDataResponse) {
        player = value.player
        let keys = Array(Set(value.matches.flatMap { match in
            match.sides.flatMap { $0.stats.keys }
        })).sorted()
        statKeys = keys
        matches = value.matches.map { DenseComparisonMatch($0, statKeys: keys) }
    }

    init(
        refreshing cached: DensePlayerProfileDataResponse,
        player: PlayerProfileIdentity,
        replacingMatchIDs: [Int64],
        with refreshedMatches: [ComparisonMatch]
    ) {
        self.player = player
        let refreshedKeys = refreshedMatches.flatMap { match in
            match.sides.flatMap { $0.stats.keys }
        }
        let keys = Array(Set(cached.statKeys).union(refreshedKeys)).sorted()
        statKeys = keys
        let replaced = Set(replacingMatchIDs)
        let retained = cached.matches
            .filter { !replaced.contains($0.id) }
            .map { $0.remappingStatKeys(from: cached.statKeys, to: keys) }
        matches = retained + refreshedMatches.map { DenseComparisonMatch($0, statKeys: keys) }
        matches.sort {
            switch ($0.playedAt, $1.playedAt) {
            case let (left?, right?) where left != right: return left > right
            case (nil, .some(_)): return false
            case (.some(_), nil): return true
            default: return $0.id > $1.id
            }
        }
    }
}

struct DenseComparisonMatch: Content, Sendable {
    var id: Int64
    var schema: String
    var playedAt: Int64?
    var map: String
    var result: String
    var scoreFor: Int?
    var scoreAgainst: Int?
    var teammateIDs: [Int64]
    var rounds: Int
    var kills: Int
    var deaths: Int
    var assists: Int
    var headshots: Int
    var damage: Int
    var kastRounds: Int
    var sides: [DenseComparisonSideStats]
    var roundKills: [ComparisonRoundKill]

    enum CodingKeys: String, CodingKey {
        case id, schema, map, result, rounds, kills, deaths, assists, headshots, damage, sides
        case playedAt = "played_at"
        case scoreFor = "score_for"
        case scoreAgainst = "score_against"
        case teammateIDs = "teammate_ids"
        case kastRounds = "kast_rounds"
        case roundKills = "round_kills"
    }

    init(_ value: ComparisonMatch, statKeys: [String]) {
        id = value.id
        schema = value.schema
        playedAt = value.playedAt
        map = value.map
        result = value.result
        scoreFor = value.scoreFor
        scoreAgainst = value.scoreAgainst
        teammateIDs = value.teammateIDs
        rounds = value.rounds
        kills = value.kills
        deaths = value.deaths
        assists = value.assists
        headshots = value.headshots
        damage = value.damage
        kastRounds = value.kastRounds
        sides = value.sides.map { DenseComparisonSideStats($0, statKeys: statKeys) }
        roundKills = value.roundKills
    }

    func remappingStatKeys(from oldKeys: [String], to newKeys: [String]) -> DenseComparisonMatch {
        guard oldKeys != newKeys else { return self }
        var value = self
        value.sides = sides.map { $0.remappingStatKeys(from: oldKeys, to: newKeys) }
        return value
    }
}

struct DenseComparisonSideStats: Content, Sendable {
    var side: PlayerSide
    var buyType: String
    var opponentBuyType: String
    var roundResult: String
    var roundPhase: String? = nil
    var hero: Bool = false
    var stats: [Double?]
    var weapons: [ComparisonWeaponStats]

    enum CodingKeys: String, CodingKey {
        case side, stats, weapons, hero
        case buyType = "buy_type"
        case opponentBuyType = "opponent_buy_type"
        case roundResult = "round_result"
        case roundPhase = "round_phase"
    }

    init(_ value: ComparisonSideStats, statKeys: [String]) {
        side = value.side
        buyType = value.buyType
        opponentBuyType = value.opponentBuyType
        roundResult = value.roundResult
        roundPhase = value.roundPhase
        hero = value.hero
        stats = statKeys.map { value.stats[$0] }
        weapons = value.weapons
    }

    func remappingStatKeys(from oldKeys: [String], to newKeys: [String]) -> DenseComparisonSideStats {
        let oldIndexes = Dictionary(uniqueKeysWithValues: oldKeys.enumerated().map { ($0.element, $0.offset) })
        var value = self
        value.stats = newKeys.map { key in
            guard let index = oldIndexes[key], index < stats.count else { return nil }
            return stats[index]
        }
        return value
    }
}

struct PlayerProfileIdentity: Content, Sendable {
    var id: Int64
    var steamID: String
    var name: String
    var firstSeenAt: Int64?
    var lastSeenAt: Int64?

    enum CodingKeys: String, CodingKey {
        case id, name
        case steamID = "steam_id"
        case firstSeenAt = "first_seen_at"
        case lastSeenAt = "last_seen_at"
    }
}

struct PlayerHeadlineStats: Content {
    var rating: Double
    var killDeathRatio: Double
    var averageDamagePerRound: Double
    var kastPercent: Double
    var winRate: Double

    enum CodingKeys: String, CodingKey {
        case rating
        case killDeathRatio = "kd"
        case averageDamagePerRound = "adr"
        case kastPercent = "kast"
        case winRate = "win_rate"
    }
}

struct PlayerCareerTotals: Content {
    var matches: Int
    var wins: Int
    var losses: Int
    var draws: Int
    var rounds: Int
    var roundWins: Int
    var kills: Int
    var deaths: Int
    var assists: Int
    var headshots: Int
    var damage: Int
    var damageReceived: Int
    var kastRounds: Int
    var bombPlants: Int
    var bombDefuses: Int

    enum CodingKeys: String, CodingKey {
        case matches, wins, losses, draws, rounds, kills, deaths, assists, headshots, damage
        case damageReceived = "damage_received"
        case roundWins = "round_wins"
        case kastRounds = "kast_rounds"
        case bombPlants = "bomb_plants"
        case bombDefuses = "bomb_defuses"
    }
}

struct PlayerUtilityStats: Content {
    var highExplosiveDamage: Int
    var fireDamage: Int
    var enemiesFlashed: Int
    var blindDurationSeconds: Double
    var teammatesFlashed: Int
    var teammateBlindDurationSeconds: Double
    var selfFlashes: Int
    var selfBlindDurationSeconds: Double
    var flashAssists: Int
    var highExplosiveThrown: Int
    var flashbangsThrown: Int
    var smokesThrown: Int
    var fireGrenadesThrown: Int
    var decoysThrown: Int

    enum CodingKeys: String, CodingKey {
        case highExplosiveDamage = "he_damage"
        case fireDamage = "fire_damage"
        case enemiesFlashed = "enemies_flashed"
        case blindDurationSeconds = "blind_duration_seconds"
        case teammatesFlashed = "teammates_flashed"
        case teammateBlindDurationSeconds = "teammate_blind_duration_seconds"
        case selfFlashes = "self_flashes"
        case selfBlindDurationSeconds = "self_blind_duration_seconds"
        case flashAssists = "flash_assists"
        case highExplosiveThrown = "he_grenades_thrown"
        case flashbangsThrown = "flashbangs_thrown"
        case smokesThrown = "smokes_thrown"
        case fireGrenadesThrown = "fire_grenades_thrown"
        case decoysThrown = "decoys_thrown"
    }
}

struct PlayerTradeProfileStats: Content {
    var kills: Int
    var opportunities: Int
    var attempts: Int
    var successes: Int
    var tradeableDeaths: Int
    var attemptedTradeableDeaths: Int
    var tradedDeaths: Int

    enum CodingKeys: String, CodingKey {
        case kills, opportunities, attempts, successes
        case tradeableDeaths = "tradeable_deaths"
        case attemptedTradeableDeaths = "attempted_tradeable_deaths"
        case tradedDeaths = "traded_deaths"
    }
}

struct PlayerOpeningProfileStats: Content {
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

    enum CodingKeys: String, CodingKey {
        case kills, deaths
        case assistedKills = "assisted_kills"
        case damageAssistedKills = "damage_assisted_kills"
        case flashAssistedKills = "flash_assisted_kills"
        case tradedDeaths = "traded_deaths"
        case tradeKills = "trade_kills"
        case assists
        case damageAssists = "damage_assists"
        case flashAssists = "flash_assists"
        case blindedEnemyKills = "blinded_enemy_kills"
        case blindKills = "blind_kills"
        case deathsWhileBlind = "deaths_while_blind"
        case deathsToBlindKiller = "deaths_to_blind_killer"
        case enemyAssistedDeaths = "enemy_assisted_deaths"
        case enemyDamageAssistedDeaths = "enemy_damage_assisted_deaths"
        case enemyFlashAssistedDeaths = "enemy_flash_assisted_deaths"
        case ownFlashKills = "own_flash_kills"
        case victimSideFlashKills = "victim_side_flash_kills"
        case blindSourceUnknownKills = "blind_source_unknown_kills"
        case deathsToKillerFlash = "deaths_to_killer_flash"
        case deathsToOwnSideFlash = "deaths_to_own_side_flash"
        case deathsBlindSourceUnknown = "deaths_blind_source_unknown"
    }
}

struct PlayerWeaponProfileStats: Content {
    var weapon: String
    var kills: Int
    var shots: Int
    var hits: Int
    var damage: Int
    var roundsUsed: Int

    enum CodingKeys: String, CodingKey {
        case weapon, kills, shots, hits, damage
        case roundsUsed = "rounds_used"
    }
}

struct PlayerMapProfileStats: Content {
    var map: String
    var matches: Int
    var wins: Int
    var losses: Int
    var draws: Int
    var rounds: Int
    var rating: Double
    var killDeathRatio: Double
    var averageDamagePerRound: Double
    var kastPercent: Double
    var winRate: Double

    enum CodingKeys: String, CodingKey {
        case map, matches, wins, losses, draws, rounds, rating
        case killDeathRatio = "kd"
        case averageDamagePerRound = "adr"
        case kastPercent = "kast"
        case winRate = "win_rate"
    }
}

struct ComparisonResponse: Content {
    var players: [ComparisonPlayer]
}

struct ComparisonPlayer: Content {
    var id: Int64
    var steamID: String
    var name: String
    var matches: [ComparisonMatch]

    enum CodingKeys: String, CodingKey {
        case id, name, matches
        case steamID = "steam_id"
    }
}

struct ComparisonMatch: Content {
    var id: Int64
    var schema: String
    var playedAt: Int64?
    var map: String
    var result: String
    var scoreFor: Int?
    var scoreAgainst: Int?
    var teammateIDs: [Int64]
    var rounds: Int
    var kills: Int
    var deaths: Int
    var assists: Int
    var headshots: Int
    var damage: Int
    var kastRounds: Int
    var sides: [ComparisonSideStats]
    var roundKills: [ComparisonRoundKill]

    enum CodingKeys: String, CodingKey {
        case id, schema, map, result, rounds, kills, deaths, assists, headshots, damage
        case playedAt = "played_at"
        case scoreFor = "score_for"
        case scoreAgainst = "score_against"
        case teammateIDs = "teammate_ids"
        case kastRounds = "kast_rounds"
        case sides
        case roundKills = "round_kills"
    }
}

struct ComparisonRoundKill: Content, Sendable {
    var round: Int
    var kills: Int
    var side: PlayerSide
    var buy: String?
    var opponentBuy: String?
    var result: String?
    var hero: Bool? = nil

    enum CodingKeys: String, CodingKey {
        case round, kills, side, buy, result, hero
        case opponentBuy = "opponent_buy"
    }
}

struct ComparisonSideStats: Content {
    var side: PlayerSide
    var buyType: String
    var opponentBuyType: String
    var roundResult: String
    var roundPhase: String? = nil
    var hero: Bool = false
    var stats: [String: Double]
    var weapons: [ComparisonWeaponStats]

    enum CodingKeys: String, CodingKey {
        case side, stats, weapons, hero
        case buyType = "buy_type"
        case opponentBuyType = "opponent_buy_type"
        case roundResult = "round_result"
        case roundPhase = "round_phase"
    }
}

struct ComparisonWeaponStats: Content, Sendable {
    var weapon: String
    var kills: Int
    var shots: Int
    var hits: Int
    var damage: Int
    var roundsUsed: Int

    enum CodingKeys: String, CodingKey {
        case weapon, kills, shots, hits, damage
        case roundsUsed = "rounds_used"
    }
}
