import Foundation

/// Join complete, already encoded profile JSON objects. No decoding, layout
/// remapping or counter encoding is needed when a different roster reuses them.
/// Groups wire version 4 reuses the same wire-3 individual profile fragments.
func assembleProfileGroup(_ profiles: [Data]) -> Data {
    var data = Data()
    data.reserveCapacity(profiles.reduce(14) { $0 + $1.count + 1 })
    data.append(contentsOf: "{\"players\":[".utf8)
    for (index, profile) in profiles.enumerated() {
        if index > 0 { data.append(0x2c) }
        data.append(profile)
    }
    data.append(contentsOf: "]}".utf8)
    return data
}
