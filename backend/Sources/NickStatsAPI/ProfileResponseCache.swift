import Foundation

actor ProfileResponseCache {
    struct Lookup: Sendable {
        var data: Data?
        var generation: UInt64
    }

    private struct Key: Hashable {
        var playerID: Int64
        var wireVersion: Int
    }

    private struct Entry {
        var data: Data
        var lastAccess: UInt64
    }

    private let maximumEntries: Int
    private var accessSequence: UInt64 = 0
    private var generation: UInt64 = 0
    private var entries: [Key: Entry] = [:]

    init(maximumEntries: Int) {
        self.maximumEntries = maximumEntries
    }

    func lookup(playerID: Int64, wireVersion: Int) -> Lookup {
        let key = Key(playerID: playerID, wireVersion: wireVersion)
        guard var entry = entries[key] else {
            return Lookup(data: nil, generation: generation)
        }
        accessSequence &+= 1
        entry.lastAccess = accessSequence
        entries[key] = entry
        return Lookup(data: entry.data, generation: generation)
    }

    func insert(_ data: Data, playerID: Int64, wireVersion: Int, generation: UInt64) {
        guard generation == self.generation else { return }
        let key = Key(playerID: playerID, wireVersion: wireVersion)
        accessSequence &+= 1
        entries[key] = Entry(data: data, lastAccess: accessSequence)
        guard entries.count > maximumEntries,
              let oldest = entries.min(by: { $0.value.lastAccess < $1.value.lastAccess })?.key else { return }
        entries.removeValue(forKey: oldest)
    }

    func removeAll() {
        generation &+= 1
        entries.removeAll(keepingCapacity: true)
    }
}

let profileResponseCache = ProfileResponseCache(maximumEntries: 16)
