import Crypto
import Foundation
import Vapor

// Replay payloads evolve independently of the statistics schema. This bounded,
// Sendable JSON type preserves optional capture fields without using Any across awaits.
indirect enum ReplayJSON: Codable, Sendable, Equatable {
    case object([String: ReplayJSON]), array([ReplayJSON]), string(String), number(Double), bool(Bool), null
    init(from decoder: any Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        // Position arrays dominate these files. Decode numbers first rather
        // than throwing two type mismatches for every coordinate and timestamp.
        else if let v = try? c.decode(Double.self) { self = .number(v) }
        else if let v = try? c.decode(Bool.self) { self = .bool(v) }
        else if let v = try? c.decode(String.self) { self = .string(v) }
        else if let v = try? c.decode([ReplayJSON].self) { self = .array(v) }
        else { self = .object(try c.decode([String: ReplayJSON].self)) }
    }
    func encode(to encoder: any Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .object(let v): try c.encode(v)
        case .array(let v): try c.encode(v)
        case .string(let v): try c.encode(v)
        case .number(let v): try c.encode(v)
        case .bool(let v): try c.encode(v)
        case .null: try c.encodeNil()
        }
    }
    subscript(_ key: String) -> ReplayJSON { object?[key] ?? .null }
    var object: [String: ReplayJSON]? { if case .object(let v) = self { return v }; return nil }
    var array: [ReplayJSON]? { if case .array(let v) = self { return v }; return nil }
    var string: String? { if case .string(let v) = self { return v }; return nil }
    var number: Double? { if case .number(let v) = self { return v }; return nil }
    var integer: Int? { guard let n = number, n.isFinite, n.rounded() == n, abs(n) < 1e9 else { return nil }; return Int(n) }
}
struct ReplayRoundManifest: Content, Equatable {
    var number: Int
    var parts: Int
    var bytes: Int
    var sha256: String
    var summary: ReplayJSON
}
struct ReplayUpload: Content {
    var header: ReplayJSON
    var rounds: [ReplayRoundManifest]
}
func replayBad(_ reason: String) -> Abort { Abort(.badRequest, reason: "Invalid replay: \(reason)") }
func replayDigest(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }
func replayText<T: Encodable>(_ value: T) throws -> String { String(decoding: try JSONEncoder().encode(value), as: UTF8.self) }
func replayDecode<T: Decodable>(_ text: String, as: T.Type) throws -> T { try JSONDecoder().decode(T.self, from: Data(text.utf8)) }
func replaySHA(_ value: String) -> Bool { value.count == 64 && value.allSatisfy { "0123456789abcdef".contains($0) } }

func validateReplayUpload(_ upload: ReplayUpload) throws {
    let h = upload.header
    guard h["format"].string == "nickstats.replay", h["version"].integer == 4,
          h["coordinate_system"].string == "source2-world", h["rounds"] == .null,
          let uid = h["match_uid"].string, !uid.isEmpty, uid.count <= 200,
          let map = h["map"].string, !map.isEmpty, map.count <= 64,
          let source = h["source_file"].string, !source.isEmpty, source.count <= 500,
          let sha = h["demo_sha256"].string, replaySHA(sha),
          let hz = h["sample_hz"].number, hz > 0, hz <= 64,
          let projectileHz = h["projectile_hz"].number, projectileHz > 0, projectileHz <= 64,
          let regulation = h["rules"]["regulation_rounds"].integer, regulation > 0,
          let overtime = h["rules"]["overtime_rounds"].integer, overtime > 0,
          let players = h["players"].array, (1...64).contains(players.count),
          !upload.rounds.isEmpty, upload.rounds.count <= 65535 else { throw replayBad("unsupported header or roster.") }
    var ids = Set<String>()
    for player in players {
        guard let id = player["id"].string, !id.isEmpty, id.count <= 200, ids.insert(id).inserted,
              let name = player["name"].string, !name.isEmpty, name.count <= 200 else { throw replayBad("invalid player.") }
        if player["steam_id"] != .null {
            guard let steam = player["steam_id"].string, !steam.isEmpty, steam.count <= 20,
                  steam.allSatisfy({ $0.isASCII && $0.isNumber }), id == "steam:\(steam)" else { throw replayBad("invalid Steam identity.") }
        }
    }
    var numbers = Set<Int>(), total = 0
    for r in upload.rounds {
        guard (1...65535).contains(r.number), numbers.insert(r.number).inserted,
              (1...128).contains(r.parts), (1...16*1024*1024).contains(r.bytes), replaySHA(r.sha256),
              r.summary["number"].integer == r.number else { throw replayBad("invalid round manifest.") }
        total += r.bytes
    }
    guard total <= 128*1024*1024, try JSONEncoder().encode(upload).count <= 1024*1024 else { throw replayBad("capture is too large.") }
}

// Derive query metadata from the verified round, rather than trusting a separate
// filter index. All sample and event identities are checked before publication.
func replayRoundSummary(_ round: ReplayJSON, players: Set<String>) throws -> (ReplayJSON, Int) {
    guard let number = round["number"].integer, (1...65535).contains(number),
          let duration = round["duration"].number, duration.isFinite, (0...600000).contains(duration),
          [.null,.string("T"),.string("CT")].contains(round["winner"]),
          let tracks = round["tracks"].array, !tracks.isEmpty, tracks.count <= players.count,
          let firing = round["firing"].array, firing.count <= players.count,
          let projectiles = round["projectiles"].array, projectiles.count <= 100000,
          let utility = round["utility"].array, let deaths = round["deaths"].array,
          utility.count + deaths.count <= 100000,
          let context = round["context"].array, context.count <= players.count else { throw replayBad("invalid round.") }
    func owner(_ value: ReplayJSON, optional: Bool = false) -> Bool {
        (optional && value == .null) || value.string.map { players.contains($0) } == true
    }
    func finite(_ v: ReplayJSON, _ maximum: Double = 32768) -> Bool { v.number.map { $0.isFinite && abs($0) <= maximum } == true }
    var sampleCount = 0
    func samples(_ value: ReplayJSON, width: Int, end: Double, yaw: Int? = nil, side: Int? = nil, health: Bool = false) throws {
        guard let rows = value.array, !rows.isEmpty else { throw replayBad("empty samples.") }
        var previous: Double = -1
        for row in rows {
            guard let s = row.array, s.count == width, let time = s[0].number,
                  time >= 0, time > previous, time <= end,
                  s[1...3].allSatisfy({ finite($0) }) else { throw replayBad("invalid or unordered samples.") }
            if let yaw, s[yaw] != .null, !finite(s[yaw],180) { throw replayBad("invalid aim.") }
            if let side, ![2,3].contains(s[side].integer ?? 0) { throw replayBad("invalid side.") }
            if health, !(s[4].number.map { (0...100).contains($0) } ?? false) { throw replayBad("invalid health.") }
            previous = time; sampleCount += 1
            guard sampleCount <= 1000000 else { throw replayBad("too many samples.") }
        }
    }
    var trackIDs = Set<String>()
    for track in tracks {
        guard owner(track["player"]), let id = track["player"].string, trackIDs.insert(id).inserted else { throw replayBad("invalid track owner.") }
        try samples(track["samples"],width:7,end:duration,yaw:6,side:5,health:true)
    }
    var shooters = Set<String>()
    for track in firing {
        guard owner(track["player"]), let id = track["player"].string, shooters.insert(id).inserted else { throw replayBad("invalid shooter.") }
        try samples(track["samples"],width:6,end:duration,yaw:4,side:5)
    }
    var projectileIDs = Set<String>()
    let types = ["Smoke","Fire","HE","Flash","Decoy"], icons = ["hegrenade","smokegrenade","molotov","incgrenade","flashbang","decoy"]
    for projectile in projectiles {
        guard let id = projectile["id"].string, !id.isEmpty, id.count <= 200, projectileIDs.insert(id).inserted,
              owner(projectile["player"],optional:true), types.contains(projectile["type"].string ?? ""),
              icons.contains(projectile["icon"].string ?? ""), [0,2,3].contains(projectile["side"].integer ?? -1),
              let end = projectile["end"].number, (0...duration).contains(end) else { throw replayBad("invalid projectile.") }
        try samples(projectile["samples"],width:4,end:end)
    }
    for (events, isDeath) in [(utility,false),(deaths,true)] {
        var previous: Double = -1
        for e in events {
            guard let time = e["time"].number, time >= previous, (0...duration).contains(time),
                  ["x","y","z"].allSatisfy({ finite(e[$0]) }) else { throw replayBad("invalid event position or timing.") }
            previous = time
            if isDeath {
                guard owner(e["victim"]), owner(e["killer"],optional:true),
                      [2,3].contains(e["victim_side"].integer ?? 0), [0,2,3].contains(e["killer_side"].integer ?? -1),
                      let weapon = e["weapon"].string, !weapon.isEmpty, weapon.count <= 100,
                      [.bool(true),.bool(false)].contains(e["headshot"]),
                      e["from"] == .null || (e["from"].array?.count == 3 && e["from"].array!.allSatisfy({ finite($0) })) else { throw replayBad("invalid death.") }
            } else {
                if e["effectiveness"] != .null {
                    guard let metrics = e["effectiveness"].object,["enemies_flashed","enemy_damage","enemy_blind_ms"].allSatisfy({ metrics[$0] != nil && (e["effectiveness"][$0] == .null || e["effectiveness"][$0].integer.map { $0 >= 0 } == true) }) else { throw replayBad("invalid grenade effectiveness.") }
                }
                guard owner(e["player"],optional:true), types.contains(e["type"].string ?? ""), icons.contains(e["icon"].string ?? ""),
                      [0,2,3].contains(e["side"].integer ?? -1), let end = e["end"].number, (time...duration).contains(end),
                      let radius = e["radius"].number, (0...512).contains(radius),
                      [.bool(true),.bool(false)].contains(e["estimated"]) else { throw replayBad("invalid utility.") }
            }
        }
    }
    var contexts = Set<String>()
    for c in context {
        guard owner(c["player"]), let id = c["player"].string, contexts.insert(id).inserted,
              [2,3].contains(c["side"].integer ?? 0), [.null,.string("win"),.string("loss")].contains(c["result"]),
              ["buy","enemy_buy"].allSatisfy({ [.null,.string("full"),.string("force"),.string("eco"),.string("pistol")].contains(c[$0]) }),
              [.bool(true),.bool(false)].contains(c["hero"]) else { throw replayBad("invalid round context.") }
    }
    if round["performance"] != .null {
        guard let values = round["performance"].array, values.count <= players.count else { throw replayBad("invalid round performance.") }
        var seen = Set<String>()
        for p in values {
            if p["grenades"] != .null {
                guard p["grenades"].object != nil,["he_thrown","flash_thrown","fire_thrown","he_damage","fire_damage","enemies_flashed","blind_ms"].allSatisfy({ p["grenades"][$0] == .null || p["grenades"][$0].integer.map { $0 >= 0 } == true }) else { throw replayBad("invalid grenade round totals.") }
            }
            guard owner(p["player"]),let id = p["player"].string,seen.insert(id).inserted,
                  ["kills","deaths","assists","damage","kast"].allSatisfy({ p[$0].integer.map { $0 >= 0 } == true }),
                  (p["kast"].integer ?? 2) <= 1 else { throw replayBad("invalid player round performance.") }
        }
    }
    return (.object(["number":.number(Double(number)),"duration":.number(duration),"winner":round["winner"],
                     "context":.array(context),"player_ids":.array(trackIDs.sorted().map(ReplayJSON.string))]),sampleCount)
}
func projectReplayRound(_ round: ReplayJSON, players: Set<String>?) -> ReplayJSON {
    guard let players, var output = round.object else { return round }
    for key in ["tracks","firing","utility","projectiles","context","performance"] {
        output[key] = .array((round[key].array ?? []).filter { players.contains($0["player"].string ?? "") })
    }
    output["deaths"] = .array((round["deaths"].array ?? []).filter { players.contains($0["victim"].string ?? "") || players.contains($0["killer"].string ?? "") })
    return .object(output)
}


struct ReplayStoredChunk: Sendable { var part: Int; var body: String }
func assembleReplayRound(_ chunks: [ReplayStoredChunk], manifest: ReplayRoundManifest, verifyChecksum: Bool) throws -> Data {
    guard chunks.count == manifest.parts else { throw Abort(.conflict,reason:"Replay upload is incomplete. Retry the upload.") }
    var data = Data()
    data.reserveCapacity(manifest.bytes)
    for (index,chunk) in chunks.enumerated() {
        guard chunk.part == index else { throw replayBad("missing chunk.") }
        data.append(contentsOf:chunk.body.utf8)
        guard data.count <= manifest.bytes else { throw replayBad("round exceeds declared size.") }
    }
    guard data.count == manifest.bytes else { throw replayBad("round size mismatch.") }
    if verifyChecksum, replayDigest(data) != manifest.sha256 { throw replayBad("round checksum mismatch.") }
    return data
}
