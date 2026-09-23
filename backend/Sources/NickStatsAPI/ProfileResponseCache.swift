import Foundation

struct ProfileMatchChange: Sendable {
    var matchID: Int64
    var playerIDs: [Int64]
}

actor ProfileResponseCache {
    struct Lookup: Sendable {
        var data: Data?
        var profile: DensePlayerProfileDataResponse?
        var staleMatchIDs: [Int64]
        var version: UInt64
    }

    private struct Key: Hashable {
        var playerID: Int64
        var wireVersion: Int
    }

    private struct Entry {
        var data: Data
        var profile: DensePlayerProfileDataResponse
        var staleMatchIDs: Set<Int64>
        var lastAccess: UInt64
    }

    private let maximumEntries: Int
    private var accessSequence: UInt64 = 0
    private var entries: [Key: Entry] = [:]
    private var versions: [Key: UInt64] = [:]

    init(maximumEntries: Int) {
        self.maximumEntries = maximumEntries
    }

    func lookup(playerID: Int64, wireVersion: Int) -> Lookup {
        let key = Key(playerID: playerID, wireVersion: wireVersion)
        let version = versions[key, default: 0]
        guard var entry = entries[key] else {
            return Lookup(data: nil, profile: nil, staleMatchIDs: [], version: version)
        }
        accessSequence &+= 1
        entry.lastAccess = accessSequence
        entries[key] = entry
        return Lookup(
            data: entry.data,
            profile: entry.profile,
            staleMatchIDs: entry.staleMatchIDs.sorted(),
            version: version
        )
    }

    func insert(
        _ data: Data, profile: DensePlayerProfileDataResponse,
        playerID: Int64, wireVersion: Int, version: UInt64
    ) {
        let key = Key(playerID: playerID, wireVersion: wireVersion)
        guard version == versions[key, default: 0] else { return }
        accessSequence &+= 1
        entries[key] = Entry(
            data: data, profile: profile, staleMatchIDs: [], lastAccess: accessSequence
        )
        guard entries.count > maximumEntries,
              let oldest = entries.min(by: { $0.value.lastAccess < $1.value.lastAccess })?.key else { return }
        entries.removeValue(forKey: oldest)
    }

    func markChanged(_ changes: [ProfileMatchChange], wireVersion: Int = 2) {
        for change in changes {
            for playerID in change.playerIDs {
                let key = Key(playerID: playerID, wireVersion: wireVersion)
                versions[key, default: 0] &+= 1
                if var entry = entries[key] {
                    entry.staleMatchIDs.insert(change.matchID)
                    entries[key] = entry
                }
            }
        }
    }
}

let profileResponseCache = ProfileResponseCache(maximumEntries: 16)
