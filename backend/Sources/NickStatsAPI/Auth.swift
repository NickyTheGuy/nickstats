import Crypto
import Foundation
import Vapor

private let sessionCookieName = "nickstats_session"
private let sessionLifetime: Int64 = 60 * 60 * 24 * 30

struct LoginRequest: Content {
    var username: String
    var password: String
}

struct AuthSessionResponse: Content {
    var authenticated: Bool
    var username: String?
}

private struct SessionPayload: Codable {
    var username: String
    var expiresAt: Int64
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
          session.expiresAt > Int64(Date().timeIntervalSince1970),
          let users = try? loginUsers(), users[session.username] != nil else { return nil }
    return session.username
}

func authenticateLogin(_ login: LoginRequest) throws -> (username: String, token: String, expiresAt: Int64) {
    let username = login.username.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    let users = try loginUsers()
    guard let expected = users[username], constantTimeEqual(login.password, expected) else {
        throw Abort(.unauthorized, reason: "Incorrect username or password.")
    }
    let expiresAt = Int64(Date().timeIntervalSince1970) + sessionLifetime
    return (username, try sessionToken(username: username, expiresAt: expiresAt, secret: sessionSecret()), expiresAt)
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
