# NickStats API

The API imports compact `nickstats.match/9` files into the normalized MySQL schema and exposes read-only match/player endpoints. The browser still parses demos locally; only the much smaller compact result is uploaded.

The compact format intentionally uses fixed-position arrays to keep uploads small. Inside the Swift service, those arrays decode into named domain types such as `TradeStats`, `KillContextStats`, `RoundRecord`, and `SpeedSummary`; database and validation code never rely on unexplained numeric indexes. Encoding those types reconstructs the same `nickstats.match/9` wire format.

## Routes

| Method | Route | Authentication | Purpose |
|---|---|---|---|
| `GET` | `/health` | Public | Database health check |
| `POST` | `/matches` | Bearer token | Validate and atomically import one compact match |
| `GET` | `/matches` | Public | Match list and filters |
| `GET` | `/matches/<id>` | Public | Reconstruct compact match JSON from normalized rows |
| `GET` | `/players` | Public | Player search/list |
| `GET` | `/players/<id>` | Public | Aggregated player profile, weapons, and map splits |
| `GET` | `/compare?players=<ids>` | Public | Per-match teammate data for group and lineup comparisons |

`POST /matches` is idempotent by demo SHA-256 and FACEIT match ID. A repeated upload returns the existing ID with `created: false`. Validation occurs before a transaction; all database rows then commit together or roll back together.

Match-list query parameters are `steam_id`, `map`, `maps`, `from`, `to`, `limit`, and `offset`. `maps` accepts comma-separated map names for an OR filter; the singular `map` remains supported. Match-list responses include every available map name for filter controls. Dates are ISO-8601; `to` is exclusive. Player-list parameters are `q`, `limit`, and `offset`.

## Local/container setup

1. Apply `database/schema.sql` and then each numbered `database/migrations/*.sql` file to MySQL 8 or 9.
2. Copy `.env.example` to `.env` and replace every placeholder.
3. Create `nickstats_app` restricted to the `172.20.%` MySQL network with `SELECT`, `INSERT`, `UPDATE`, and `DELETE` on `nickstats.*`.
4. Run `docker compose -f compose.example.yml up -d --build`.
5. Proxy `/nickstats/api/` from the existing Nginx service to `http://nickstats-api:8000/`.

The API joins the server's existing external `web_default` and `mysql_default` Docker networks. It reaches MySQL through the private `mysql` network alias and Nginx reaches the API through `nickstats-api`. The API container is not published directly to the internet; Nginx is the only intended entry point. Do not publish MySQL port 3306.

Generate the upload token on the server, for example:

```bash
openssl rand -hex 32
```

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
