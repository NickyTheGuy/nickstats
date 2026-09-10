import Fluent
import FluentMySQLDriver
import Vapor

private func requiredEnvironment(_ name: String) throws -> String {
    guard let value = Environment.get(name), !value.isEmpty else {
        throw Abort(.internalServerError, reason: "Missing required environment variable: \(name)")
    }
    return value
}

func configure(_ app: Application) async throws {
    let host = try requiredEnvironment("MYSQL_HOST")
    let username = try requiredEnvironment("MYSQL_USER")
    let password = try requiredEnvironment("MYSQL_PASSWORD")
    let database = Environment.get("MYSQL_DATABASE") ?? "nickstats"
    let port = Environment.get("MYSQL_PORT").flatMap(Int.init) ?? 3306

    app.databases.use(DatabaseConfigurationFactory.mysql(
        hostname: host,
        port: port,
        username: username,
        password: password,
        database: database,
        tlsConfiguration: nil
    ), as: .mysql)
    app.routes.defaultMaxBodySize = "2mb"
    try routes(app)
}
