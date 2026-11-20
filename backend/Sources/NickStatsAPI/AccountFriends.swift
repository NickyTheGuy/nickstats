import Fluent
import SQLKit
import Vapor

struct AccountFriend: Content { var id: Int64;var name: String;var steam_id: String? }
struct AccountFriends: Content { var friends: [AccountFriend] }
struct AccountFriendChange: Content { var player_id: Int64;var friend: Bool }
func accountFriends(_ username: String,on database: any Database) async throws -> AccountFriends {
    guard let sql = database as? any SQLDatabase else { throw Abort(.internalServerError) }
    let rows = try await sql.raw("""
      SELECT CAST(p.id AS SIGNED) AS id,p.current_name AS name,CAST(p.steam_id AS CHAR) AS steam_id
      FROM account_friends f JOIN auth_users a ON a.id=f.account_id JOIN players p ON p.id=f.player_id
      WHERE a.username=\(bind:username) ORDER BY p.current_name,p.id
      """).all()
    return AccountFriends(friends:try rows.map { AccountFriend(id:try $0.decode(column:"id",as:Int64.self),name:try $0.decode(column:"name",as:String.self),steam_id:try $0.decode(column:"steam_id",as:String?.self)) })
}
func changeAccountFriend(_ username: String,change: AccountFriendChange,on database: any Database) async throws -> AccountFriends {
    guard change.player_id > 0 else { throw Abort(.badRequest,reason:"Invalid player.") }
    try await database.transaction { db in
        guard let sql = db as? any SQLDatabase else { throw Abort(.internalServerError) }
        guard let account = try await sql.raw("SELECT CAST(id AS SIGNED) AS id FROM auth_users WHERE username=\(bind:username) FOR UPDATE").first() else { throw Abort(.unauthorized) }
        let accountID = try account.decode(column:"id",as:Int64.self)
        if change.friend {
            guard try await sql.raw("SELECT id FROM players WHERE id=\(bind:change.player_id)").first() != nil else { throw Abort(.notFound,reason:"That player no longer exists.") }
            let existing = try await sql.raw("SELECT player_id FROM account_friends WHERE account_id=\(bind:accountID)").all()
            guard existing.count < 500 || existing.contains(where:{ (try? $0.decode(column:"player_id",as:Int64.self)) == change.player_id }) else { throw Abort(.badRequest,reason:"Your friends list is full.") }
            try await sql.raw("INSERT IGNORE INTO account_friends(account_id,player_id) VALUES(\(bind:accountID),\(bind:change.player_id))").run()
        } else {
            try await sql.raw("DELETE FROM account_friends WHERE account_id=\(bind:accountID) AND player_id=\(bind:change.player_id)").run()
        }
    }
    return try await accountFriends(username,on:database)
}
func accountFriendsRoutes(_ app: Application) {
    app.get("auth","friends") { request async throws -> Response in
        guard let username = authenticatedUsername(request) else { throw Abort(.unauthorized,reason:"Log in to manage friends.") }
        let response = Response(status:.ok)
        try response.content.encode(try await accountFriends(username,on:request.db))
        response.headers.replaceOrAdd(name:"Cache-Control",value:"private, no-store")
        return response
    }
    app.post("auth","friends") { request async throws -> Response in
        guard let username = authenticatedUsername(request) else { throw Abort(.unauthorized,reason:"Log in to manage friends.") }
        let change = try request.content.decode(AccountFriendChange.self),response = Response(status:.ok)
        try response.content.encode(try await changeAccountFriend(username,change:change,on:request.db))
        response.headers.replaceOrAdd(name:"Cache-Control",value:"private, no-store")
        return response
    }
}
