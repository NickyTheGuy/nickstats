import Vapor

/// Groups wire version 3. Row values contain
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
