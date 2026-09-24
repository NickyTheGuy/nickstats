# NickStats API

The API imports compact `nickstats.match/21` files into the normalized MySQL schema and exposes read-only match/player endpoints. Schemas 9 through 20 remain readable for existing stored matches; the browser still parses demos locally and uploads only the compact result. Run database migration 016 before deploying this backend.

The compact format intentionally uses fixed-position arrays to keep uploads small. Inside the Swift service, those arrays decode into named domain types such as `TradeStats`, `KillContextStats`, `RoundTimingPayload`, and `DeathEventPayload`; database and validation code never rely on unexplained numeric indexes. Encoding those types reconstructs the same versioned wire format.

## Routes

| Method | Route | Authentication | Purpose |
|---|---|---|---|
| `GET` | `/health` | Public | Database health check |
| `POST` | `/auth/login` | Username/password | Create a persistent browser session |
| `GET` | `/auth/session` | Session cookie | Report the current login |
| `POST` | `/auth/logout` | Session cookie | Clear the current login |
| `POST` | `/auth/password` | Session cookie | Change the logged-in user's password |
| `POST` | `/auth/player` | Session cookie | Select the database player represented by the account |
| `POST` | `/matches` | Session cookie or bearer token | Validate and atomically import one compact match |
| `POST` | `/matches/faceit-dates` | Scoped bearer token | Update FACEIT match start times in batches |
| `GET` | `/matches` | Public | Match list and filters |
| `GET` | `/matches/<id>` | Public | Reconstruct compact match JSON from normalized rows |
| `GET` | `/players` | Public | Player search/list |
| `GET` | `/players/<id>` | Public | Aggregated player profile, weapons, and map splits |
| `GET` | `/groups?players=<ids>` | Public | Per-match teammate data for conditional groups |

`POST /matches` is idempotent by demo SHA-256 and FACEIT match ID. A repeated upload returns the existing ID with `created: false`. Validation occurs before a transaction; all database rows then commit together or roll back together.

`POST /matches/faceit-dates` accepts up to 100 FACEIT match IDs and Unix start timestamps using the `nickstats.faceit-dates/1` schema. It updates only `played_at`, `played_at_source`, and the affected players' first/last-seen bounds; match statistics are untouched. The response reports updated, unchanged, and not-yet-imported IDs.

Match-list query parameters are `steam_id`, `map`, `maps`, `from`, `to`, `limit`, and `offset`. `maps` accepts comma-separated map names for an OR filter; the singular `map` remains supported. Match-list responses include every available map name for filter controls. Dates are ISO-8601; `to` is exclusive. Player-list parameters are `q`, `limit`, and `offset`.
The optional `viewer_player_id` adds `viewer_team_slot` to each match summary for displaying the selected account player's team first. It does not filter results. Requests without a selected account player omit it and skip the team lookup.

## Local/container setup

1. For a new database, apply the current `database/schema.sql`. For an existing database, apply only the unapplied numbered files in `database/migrations/`.
2. Copy `.env.example` to `.env` and replace every placeholder.
3. Create `nickstats_app` restricted to the `172.20.%` MySQL network with `SELECT`, `INSERT`, `UPDATE`, and `DELETE` on `nickstats.*`.
4. Run `docker compose -f compose.example.yml up -d --build`.
5. Proxy `/nickstats/api/` from the existing Nginx service to `http://nickstats-api:8000/`.

The API joins the server's existing external `web_default` and `mysql_default` Docker networks. It reaches MySQL through the private `mysql` network alias and Nginx reaches the API through `nickstats-api`. The API container is not published directly to the internet; Nginx is the only intended entry point. Do not publish MySQL port 3306.

Compact player-profile responses include a `Server-Timing` header with each database query group, total side-data construction, response construction, JSON encoding, and total API time. The same header value is written to the API log as `Compact player profile timing`, together with the player ID. In browser developer tools, select the profile request and inspect its **Timing** or **Headers** panel. On the server, use `docker logs nickstats-api` to compare requests over time. The browser requests `wire=2`, which sends one shared `stat_keys` list and dense value arrays instead of repeating every statistic name in every side row; omitting it preserves the object-based API response for older clients. Up to 16 encoded dense responses and their structured equivalents are retained in a process-local LRU cache. Match uploads, replacements, and FACEIT date updates mark only affected cached players and accumulate changed match IDs. The next request lazily rebuilds those matches together and merges them into the cached profile; uncached and unaffected players require no work. Cache state appears as `cache_hit`, `cache_miss`, or `cache_stale` in `Server-Timing`.

Generate separate upload and FACEIT date-sync tokens on the server, for example:

```bash
openssl rand -hex 32
```

Set the second value as `NICKSTATS_FACEIT_SYNC_TOKEN`. It grants access only to the date-sync route and is the token stored by the private browser extension.

Initial browser accounts are bootstrapped from `.env` with a JSON username/password map and an independent signing secret:

```dotenv
NICKSTATS_LOGIN_USERS={"nick":"use-a-long-random-password","friend":"another-long-random-password"}
NICKSTATS_SESSION_SECRET=replace-with-output-from-openssl-rand-hex-32
NICKSTATS_COOKIE_SECURE=true
```

Apply `database/migrations/014_auth_users.sql` and `database/migrations/015_account_player.sql` before deploying this backend. On each username's first successful login, the server verifies the bootstrap password and stores a salted PBKDF2-HMAC-SHA256 hash in `auth_users`. From that point onward the database hash is authoritative, the original `.env` password no longer works, and the user can change their password and representative player from Account settings. The plaintext password itself is never stored in the database.

Usernames are case-insensitive. Successful logins receive a signed, HttpOnly, SameSite=Strict cookie that lasts 30 days and survives browser restarts. `NICKSTATS_COOKIE_SECURE` should remain `true` on the HTTPS production site; set it to `false` only for plain-HTTP local development. Keep `NICKSTATS_LOGIN_USERS` as the bootstrap list until every intended account has logged in once; afterward it can be removed, although it will still be needed to bootstrap any later additions. The existing `NICKSTATS_UPLOAD_TOKEN` remains accepted for command-line imports and compatibility.

Keep `.env` out of Git. Upload a compact file with:

```bash
curl -X POST https://nickykenney.com/nickstats/api/matches \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @match-nickstats.json
```

The token protects writes, not reads. Do not embed it in the public frontend. Initially, imports should be performed from an administrator machine or server-side command.

## Development check

From `backend/`:

```bash
swift test
```

The service is written in Swift 6.3 with Vapor 4. The Docker build compiles it in a Swift build image and copies only the release executable and runtime libraries into the final container, so Swift does not need to be installed on the Ubuntu host.
