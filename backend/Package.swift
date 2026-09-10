// swift-tools-version:6.3
import PackageDescription

let package = Package(
    name: "NickStatsAPI",
    platforms: [.macOS(.v13)],
    products: [
        .executable(name: "NickStatsAPI", targets: ["NickStatsAPI"])
    ],
    dependencies: [
        .package(url: "https://github.com/vapor/vapor.git", from: "4.122.1"),
        .package(url: "https://github.com/vapor/fluent.git", from: "4.13.0"),
        .package(url: "https://github.com/vapor/fluent-mysql-driver.git", from: "4.8.0"),
        .package(url: "https://github.com/vapor/sql-kit.git", from: "3.36.0"),
        .package(url: "https://github.com/apple/swift-crypto.git", from: "4.5.2")
    ],
    targets: [
        .executableTarget(
            name: "NickStatsAPI",
            dependencies: [
                .product(name: "Vapor", package: "vapor"),
                .product(name: "Fluent", package: "fluent"),
                .product(name: "FluentMySQLDriver", package: "fluent-mysql-driver"),
                .product(name: "SQLKit", package: "sql-kit"),
                .product(name: "Crypto", package: "swift-crypto")
            ]
        ),
        .testTarget(
            name: "NickStatsAPITests",
            dependencies: [
                .target(name: "NickStatsAPI"),
                .product(name: "VaporTesting", package: "vapor")
            ]
        )
    ]
)

