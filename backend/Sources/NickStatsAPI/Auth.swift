import Crypto
import Fluent
import Foundation
import SQLKit
import Vapor

private let sessionCookieName = "nickstats_session"
private let sessionLifetime: Int64 = 60 * 60 * 24 * 30
private let passwordIterations = 210_000

struct LoginRequest: Content {
    var username: String
    var password: String
}

struct AuthSessionResponse: Content {
    var authenticated: Bool
    var username: String?
}

struct ChangePasswordRequest: Content {
    var currentPassword: String
    var newPassword: String

    enum CodingKeys: String, CodingKey {
        case currentPassword = "current_password"
        case newPassword = "new_password"
    }
}

private struct SessionPayload: Codable {
    var username: String
    var expiresAt: Int64
}

private struct StoredUser {
    var salt: Data
    var hash: Data
    var iterations: Int
}

func constantTimeEqual(_ supplied: String, _ expected: String) -> Bool {
    let left = Array(supplied.utf8)
    let right = Array(expected.utf8)
    guard left.count == right.count else { return false }
    var difference: UInt8 = 0
    for index in left.indices { difference |= left[index] ^ right[index] }
    return difference == 0
}

private func loginUsers() throws -> [String: String] {
    guard let raw = Environment.get("NICKSTATS_LOGIN_USERS"), !raw.isEmpty,
          let data = raw.data(using: .utf8) else {
        throw Abort(.serviceUnavailable, reason: "Login is not configured.")
    }
    do {
        let users = try JSONDecoder().decode([String: String].self, from: data)
        var normalized: [String: String] = [:]
        for (username, password) in users {
            normalized[username.lowercased()] = password
        }
        return normalized
    } catch {
        throw Abort(.serviceUnavailable, reason: "NICKSTATS_LOGIN_USERS is not valid JSON.")
    }
}

private func sessionSecret() throws -> String {
    guard let secret = Environment.get("NICKSTATS_SESSION_SECRET"), secret.utf8.count >= 32 else {
        throw Abort(.serviceUnavailable, reason: "Login sessions are not configured.")
    }
    return secret
}

private func base64URL(_ data: Data) -> String {
    data.base64EncodedString()
        .replacingOccurrences(of: "+", with: "-")
        .replacingOccurrences(of: "/", with: "_")
        .replacingOccurrences(of: "=", with: "")
}

private func decodeBase64URL(_ value: String) -> Data? {
    var base64 = value.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
    base64 += String(repeating: "=", count: (4 - base64.count % 4) % 4)
    return Data(base64Encoded: base64)
}

private func sign(_ payload: Data, secret: String) -> Data {
    let key = SymmetricKey(data: Data(secret.utf8))
    return Data(HMAC<SHA256>.authenticationCode(for: payload, using: key))
}

private func passwordHash(_ password: String, salt: Data, iterations: Int) -> Data {
    let key = SymmetricKey(data: Data(password.utf8))
    var block = salt
    block.append(contentsOf: [0, 0, 0, 1])
    var previous = Data(HMAC<SHA256>.authenticationCode(for: block, using: key))
    var derived = previous
    if iterations > 1 {
        for _ in 1..<iterations {
            previous = Data(HMAC<SHA256>.authenticationCode(for: previous, using: key))
            for index in derived.indices { derived[index] ^= previous[index] }
        }
    }
    return derived
}

private func randomSalt() -> Data {
    var generator = SystemRandomNumberGenerator()
    return Data((0..<16).map { _ in UInt8.random(in: .min ... .max, using: &generator) })
}

private func normalizedUsername(_ value: String) throws -> String {
    let username = value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyz0123456789._-")
    guard (1...64).contains(username.count), username.unicodeScalars.allSatisfy(allowed.contains) else {
        throw Abort(.badRequest, reason: "Username may contain lowercase letters, numbers, dots, underscores, and hyphens.")
    }
    return username
}

private func storedUser(_ username: String, on database: any Database) async throws -> StoredUser? {
    guard let sql = database as? any SQLDatabase else { throw Abort(.internalServerError) }
    guard let row = try await sql.raw("""
        SELECT password_salt, password_hash, password_iterations
        FROM auth_users
        WHERE username = \(bind: username)
        """).first() else { return nil }
    return StoredUser(
        salt: try row.decode(column: "password_salt", as: Data.self),
        hash: try row.decode(column: "password_hash", as: Data.self),
        iterations: try row.decode(column: "password_iterations", as: Int.self)
    )
}

private func savePassword(_ username: String, password: String, create: Bool, on database: any Database) async throws {
    guard let sql = database as? any SQLDatabase else { throw Abort(.internalServerError) }
    let salt = randomSalt()
    let hash = passwordHash(password, salt: salt, iterations: passwordIterations)
    if create {
        try await sql.raw("""
            INSERT INTO auth_users (username, password_salt, password_hash, password_iterations)
            VALUES (\(bind: username), \(bind: salt), \(bind: hash), \(bind: passwordIterations))
            """).run()
    } else {
        try await sql.raw("""
            UPDATE auth_users
            SET password_salt = \(bind: salt), password_hash = \(bind: hash),
                password_iterations = \(bind: passwordIterations)
            WHERE username = \(bind: username)
            """).run()
    }
}

private func verifyPassword(_ password: String, for user: StoredUser) -> Bool {
    let supplied = passwordHash(password, salt: user.salt, iterations: user.iterations)
    return constantTimeEqual(base64URL(supplied), base64URL(user.hash))
}

private func sessionToken(username: String, expiresAt: Int64, secret: String) throws -> String {
    let payload = try JSONEncoder().encode(SessionPayload(username: username, expiresAt: expiresAt))
    return "\(base64URL(payload)).\(base64URL(sign(payload, secret: secret)))"
}

private func requestCookie(_ request: Request, named name: String) -> String? {
    request.headers[.cookie]
        .joined(separator: ";")
        .split(separator: ";")
        .map { $0.trimmingCharacters(in: .whitespaces) }
        .first { $0.hasPrefix("\(name)=") }
        .map { String($0.dropFirst(name.count + 1)) }
}

func authenticatedUsername(_ request: Request) -> String? {
    guard let token = requestCookie(request, named: sessionCookieName) else { return nil }
    let pieces = token.split(separator: ".", omittingEmptySubsequences: false)
    guard pieces.count == 2,
          let payload = decodeBase64URL(String(pieces[0])),
          let signature = decodeBase64URL(String(pieces[1])),
          let secret = try? sessionSecret(),
          constantTimeEqual(base64URL(signature), base64URL(sign(payload, secret: secret))),
          let session = try? JSONDecoder().decode(SessionPayload.self, from: payload),
          session.expiresAt > Int64(Date().timeIntervalSince1970) else { return nil }
    return session.username
}

func authenticateLogin(_ login: LoginRequest, on database: any Database) async throws -> (username: String, token: String, expiresAt: Int64) {
    let username = try normalizedUsername(login.username)
    if let user = try await storedUser(username, on: database) {
        guard verifyPassword(login.password, for: user) else {
            throw Abort(.unauthorized, reason: "Incorrect username or password.")
        }
    } else {
        let users = try loginUsers()
        guard let expected = users[username], constantTimeEqual(login.password, expected) else {
            throw Abort(.unauthorized, reason: "Incorrect username or password.")
        }
        try await savePassword(username, password: login.password, create: true, on: database)
    }
    let expiresAt = Int64(Date().timeIntervalSince1970) + sessionLifetime
    return (username, try sessionToken(username: username, expiresAt: expiresAt, secret: sessionSecret()), expiresAt)
}

func changePassword(username: String, change: ChangePasswordRequest, on database: any Database) async throws {
    guard change.newPassword.count >= 12 else {
        throw Abort(.badRequest, reason: "New passwords must be at least 12 characters.")
    }
    guard let user = try await storedUser(username, on: database),
          verifyPassword(change.currentPassword, for: user) else {
        throw Abort(.unauthorized, reason: "The current password is incorrect.")
    }
    guard !constantTimeEqual(change.currentPassword, change.newPassword) else {
        throw Abort(.badRequest, reason: "Choose a password different from the current password.")
    }
    try await savePassword(username, password: change.newPassword, create: false, on: database)
}

func setSessionCookie(_ response: Response, token: String, maxAge: Int64) {
    let secure = Environment.get("NICKSTATS_COOKIE_SECURE")?.lowercased() != "false"
    let secureAttribute = secure ? "; Secure" : ""
    response.headers.add(
        name: .setCookie,
        value: "\(sessionCookieName)=\(token); Path=/; Max-Age=\(maxAge); HttpOnly; SameSite=Strict\(secureAttribute)"
    )
}

func clearSessionCookie(_ response: Response) {
    setSessionCookie(response, token: "", maxAge: 0)
}
