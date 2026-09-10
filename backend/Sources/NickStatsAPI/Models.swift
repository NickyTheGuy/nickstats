import Vapor

let compactSchema = "nickstats.match/9"
let sideNames = ["T", "CT"]

struct MatchPayload: Content, Sendable {
    var schema: String
    var nickstatsBuild: String
    var parser: [String]
    var id: MatchIdentity
    var map: String
    var playedAt: Int64?
    var playedAtSource: String?
    var rounds: Int
    var rules: ParserRules
    var teams: [TeamPayload]
    var players: [PlayerPayload]

    enum CodingKeys: String, CodingKey {
        case schema, parser, id, map, rounds, rules, teams, players
        case nickstatsBuild = "nickstats_build"
        case playedAt = "played_at"
        case playedAtSource = "played_at_source"
    }
}

struct MatchIdentity: Content, Sendable {
    var faceit: String?
    var sha256: String
}

struct ParserRules: Content, Sendable {
    var trade: [Double]
    var movement: [Double]
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
    var sideScores: [Int]
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
    var sides: [SideStatsPayload]

    enum CodingKeys: String, CodingKey {
        case name, bot, sides
        case steamID = "steam_id"
    }
}

struct SideStatsPayload: Content, Sendable {
    var rounds: [Int]
    var kda: [Int]
    var kastRounds: Int
    var opening: [Int]
    var tradeKills: Int
    var tradeD: [Int]
    var utility: [Int]
    var speed: [Double?]
    var clutches: [Int]
    var killRounds: [Int]
    var weapons: [WeaponPayload]
    var duels: [[Int]]
    var trades: [[Int]]
    var contexts: [[Int]]
    var assistedBy: [[Int]]
    var flashes: [[Int]]

    enum CodingKeys: String, CodingKey {
        case rounds, kda, opening, utility, speed, clutches, weapons, duels, trades, contexts, flashes
        case kastRounds = "kast_rounds"
        case tradeKills = "trade_kills"
        case tradeD = "trade_d"
        case killRounds = "kill_rounds"
        case assistedBy = "assisted_by"
    }
}

struct WeaponPayload: Codable, Sendable {
    var weapon: String
    var kills: Int
    var shots: Int
    var damage: Int
    var roundsUsed: Int

    init(weapon: String, kills: Int, shots: Int, damage: Int, roundsUsed: Int) {
        self.weapon = weapon
        self.kills = kills
        self.shots = shots
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
        guard values.isAtEnd else {
            throw DecodingError.dataCorruptedError(in: values, debugDescription: "Weapon rows contain exactly five values.")
        }
    }

    func encode(to encoder: any Encoder) throws {
        var values = encoder.unkeyedContainer()
        try values.encode(weapon)
        try values.encode(kills)
        try values.encode(shots)
        try values.encode(damage)
        try values.encode(roundsUsed)
    }
}

struct UploadResponse: Content {
    var id: Int64
    var created: Bool
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

    enum CodingKeys: String, CodingKey {
        case id, provider, sha256, map, rounds, teams
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
    var limit: Int
    var offset: Int
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

