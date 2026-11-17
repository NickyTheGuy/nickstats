import Foundation
import Fluent
import Vapor

/// Shared by Groups and wire-3 profiles. Limits cover entries, stored counters
/// and encoded bytes; counter count is a memory proxy, not a precise RAM limit.
actor PlayerHistoryCache {
    struct Lookup: Sendable {
        var profile: PlayerProfileDataResponse?
        var data: Data?
        var staleMatchIDs: [Int64]
        var generation: UInt64
    }
    private struct Entry {
        var profile: PlayerProfileDataResponse
        var stale: Set<Int64> = []
        var created: Date
        var access: UInt64
        var counters: Int
    }
    private struct EncodedEntry {
        var data: Data
        var created: Date
        var access: UInt64
    }
    private var entries: [Int64: Entry] = [:]
    private var encoded: [Int64: EncodedEntry] = [:]
    private var generation: UInt64 = 0
    private var sequence: UInt64 = 0
    private let maximumEntries: Int
    private let maximumCounters: Int
    private let maximumBytes: Int
    private let lifetime: TimeInterval

    init(maximumEntries: Int = 8, maximumCounters: Int = 4_000_000,
         maximumBytes: Int = 64 * 1024 * 1024, lifetime: TimeInterval = 300) {
        self.maximumEntries = maximumEntries
        self.maximumCounters = maximumCounters
        self.maximumBytes = maximumBytes
        self.lifetime = lifetime
    }

    func lookup(_ id: Int64, now: Date = Date()) -> Lookup {
        sequence &+= 1
        if let entry = entries[id], now.timeIntervalSince(entry.created) >= lifetime {
            entries.removeValue(forKey: id)
        }
        if let entry = encoded[id], now.timeIntervalSince(entry.created) >= lifetime {
            encoded.removeValue(forKey: id)
        }
        if var entry = entries[id] { entry.access = sequence; entries[id] = entry }
        if var entry = encoded[id] { entry.access = sequence; encoded[id] = entry }
        return Lookup(profile: entries[id]?.profile, data: encoded[id]?.data,
            staleMatchIDs: entries[id]?.stale.sorted() ?? [], generation: generation)
    }

    func insert(_ profile: PlayerProfileDataResponse, generation expected: UInt64, now: Date = Date()) {
        guard expected == generation else { return }
        let counters = profile.matches.reduce(0) { total, match in
            total + match.sides.reduce(0) { $0 + $1.stats.count }
        }
        guard counters <= maximumCounters else { entries.removeValue(forKey: profile.player.id); return }
        encoded.removeValue(forKey: profile.player.id)
        sequence &+= 1
        entries[profile.player.id] = Entry(profile: profile, created: now, access: sequence, counters: counters)
        trim()
    }

    func storeEncoded(_ data: Data, playerID: Int64, generation expected: UInt64, now: Date = Date()) {
        guard expected == generation, data.count <= maximumBytes else { return }
        if let entry = entries[playerID], !entry.stale.isEmpty { return }
        sequence &+= 1
        encoded[playerID] = EncodedEntry(data: data, created: entries[playerID]?.created ?? now, access: sequence)
        trim()
    }

    func markChanged(_ changes: [ProfileMatchChange]) {
        guard !changes.isEmpty else { return }
        // One bounded global generation rejects fills racing with a mutation,
        // without an unbounded map of every player ever requested.
        generation &+= 1
        for change in changes {
            for id in change.playerIDs {
                encoded.removeValue(forKey: id)
                guard var entry = entries[id] else { continue }
                entry.stale.insert(change.matchID)
                entries[id] = entry
            }
        }
    }

    private func trim() {
        // Raw histories and encoded fragments have independent budgets. Evicting
        // an expensive dictionary history must not throw away reusable JSON.
        while entries.count > maximumEntries || entries.values.reduce(0, { $0 + $1.counters }) > maximumCounters {
            guard let oldest = entries.min(by: { $0.value.access < $1.value.access })?.key else { break }
            entries.removeValue(forKey: oldest)
        }
        while encoded.count > maximumEntries || encoded.values.reduce(0, { $0 + $1.data.count }) > maximumBytes {
            guard let oldest = encoded.min(by: { $0.value.access < $1.value.access })?.key else { break }
            encoded.removeValue(forKey: oldest)
        }
    }
}

let playerHistoryCache = PlayerHistoryCache()

func refreshedPlayerHistory(_ cached: PlayerProfileDataResponse, identity: PlayerProfileIdentity,
                            replacing ids: [Int64], with matches: [ComparisonMatch]) -> PlayerProfileDataResponse {
    let replaced = Set(ids)
    var history = cached.matches.filter { !replaced.contains($0.id) } + matches
    history.sort {
        switch ($0.playedAt, $1.playedAt) {
        case let (left?, right?) where left != right: return left > right
        case (nil, .some(_)): return false
        case (.some(_), nil): return true
        default: return $0.id > $1.id
        }
    }
    return PlayerProfileDataResponse(player: identity, matches: history)
}

func loadPlayerHistory(_ playerID: Int64, on database: any Database,
                       timing: ProfileTimingRecorder? = nil) async throws -> PlayerHistoryCache.Lookup {
    let start = timing?.start()
    let lookup = await playerHistoryCache.lookup(playerID)
    if lookup.profile != nil && lookup.staleMatchIDs.isEmpty {
        timing?.record("history_hit", since: start)
        return lookup
    }
    let profile: PlayerProfileDataResponse
    if let cached = lookup.profile {
        let identity = try await getPlayerProfileIdentity(playerID, on: database, timing: timing)
        let matches = try await getPlayerProfileMatches(playerID, matchIDs: lookup.staleMatchIDs, on: database, timing: timing)
        profile = refreshedPlayerHistory(cached, identity: identity, replacing: lookup.staleMatchIDs, with: matches)
        timing?.record("history_refresh", since: start)
    } else {
        profile = try await getPlayerProfileData(playerID, on: database, timing: timing)
        timing?.record("history_miss", since: start)
    }
    await playerHistoryCache.insert(profile, generation: lookup.generation)
    return .init(profile: profile, data: nil, staleMatchIDs: [], generation: lookup.generation)
}

func encodeLayoutHistory(_ profile: PlayerProfileDataResponse, timing: ProfileTimingRecorder? = nil) throws -> Data {
    let layoutStart = timing?.start()
    let layout = LayoutPlayerProfileDataResponse(profile)
    timing?.record("layouts", since: layoutStart)
    let encodeStart = timing?.start()
    let data = try JSONEncoder().encode(layout)
    timing?.record("encode", since: encodeStart)
    return data
}

func encodedPlayerHistory(_ playerID: Int64, on database: any Database,
                          timing: ProfileTimingRecorder? = nil) async throws -> Data {
    let cacheStart = timing?.start()
    let cached = await playerHistoryCache.lookup(playerID)
    if let data = cached.data {
        timing?.record("encoded_hit", since: cacheStart)
        return data
    }
    let buildStart = timing?.start()
    let history = try await loadPlayerHistory(playerID, on: database, timing: timing)
    timing?.record("history_build", since: buildStart)
    guard let profile = history.profile else {
        throw Abort(.internalServerError, reason: "Missing player history after loading.")
    }
    let data = try encodeLayoutHistory(profile, timing: timing)
    await playerHistoryCache.storeEncoded(data, playerID: playerID, generation: history.generation)
    return data
}
