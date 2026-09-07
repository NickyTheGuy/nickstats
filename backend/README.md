# NickStats API

The API imports compact `nickstats.match/9` files into the normalized MySQL schema and exposes read-only match/player endpoints. The browser still parses demos locally; only the much smaller compact result is uploaded.

## Routes

| Method | Route | Authentication | Purpose |
|---|---|---|---|
| `GET` | `/health` | Public | Database health check |
| `POST` | `/matches` | Bearer token | Validate and atomically import one compact match |
| `GET` | `/matches` | Public | Match list and filters |
| `GET` | `/matches/<id>` | Public | Reconstruct compact match JSON from normalized rows |
| `GET` | `/players` | Public | Player search/list |

`POST /matches` is idempotent by demo SHA-256 and FACEIT match ID. A repeated upload returns the existing ID with `created: false`. Validation occurs before a transaction; all database rows then commit together or roll back together.

Match-list query parameters are `steam_id`, `map`, `from`, `to`, `limit`, and `offset`. Dates are ISO-8601; `to` is exclusive. Player-list parameters are `q`, `limit`, and `offset`.

## Local/container setup

1. Apply `database/schema.sql` to MySQL 8.
2. Copy `.env.example` to `.env` and replace every placeholder.
3. Create a restricted MySQL application user after confirming the Docker network/subnet and MySQL bind address.
4. Run `docker compose -f compose.example.yml up -d --build`.
5. Connect the existing Nginx container to the `nickstats` network and proxy `/nickstats/api/` to `http://nickstats-api:8000/`.

The example uses `host.docker.internal:host-gateway` because MySQL currently runs on the Ubuntu host. It does not publish the API container directly to the internet; Nginx is the intended entry point. Do not publish MySQL port 3306.

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
PYTHONPATH=. python3 -m unittest discover -s tests
```

