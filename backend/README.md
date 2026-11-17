# NickStats API

The API imports compact `nickstats.match/27` files into the normalized MySQL schema and exposes read-only match/player endpoints. Schemas 9 through 26 remain readable for existing stored matches; the browser still parses demos locally and uploads only the compact result. Run database migrations through 020 before deploying this backend. Hero flags are stored in existing round statistics JSON, so this change needs no new database migration.

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

Schema 24 adds `clutch_economics` counters to statistic JSON slices. Deploy the updated API before uploading schema-24 reparses. Existing migration 017 stores the per-round counters; no additional migration is required. Unfiltered profile and match side totals reconstruct these counters from the round JSON.

Schema 25 adds validated `initiation` counters to each statistic JSON slice. Deploy the updated API before uploading schema-25 reparses. Profile and match side totals reconstruct these fields from existing per-round JSON; no migration beyond 017 is needed.

Schema 26 adds signed `*_save_impact` and `*_save_measured` counters to `clutch_economics`. These compare actual outcomes with modeled losses retaining the starting equipment. Schemas 24–25 keep their observed swing counters, but the frontend excludes them from the new comparison. Deploy this API before uploading schema-26 reparses; no new migration is required.

Schema 27 adds per-side/per-1vX historical outcome counts, T post-timeout death counts, forecast coverage, and signed entry payoffs to `clutch_economics`. Predicted values are aggregated in the frontend using the selected history. Schemas through 26 remain readable but do not contribute substitute prediction inputs. Deploy this API before uploading schema-27 reparses; no new migration is required.

## Manual filters

Apply `database/migrations/018_manual_filters.sql` before deploying this API. Signed-in accounts can create private labels with `POST /auth/manual-filters`, read their definitions and explicit assignments with `GET /auth/manual-filters`, set a match to `true`, `false`, or `unknown` with `PUT /auth/manual-filters/:filter/matches/:match`, and remove a label with `DELETE /auth/manual-filters/:filter`. Ownership always comes from the signed session; upload bearer tokens do not grant access.

Each definition captures the database’s latest uploaded match ID at creation. Earlier IDs default to Unknown and later IDs to False, independently of played dates, reparses, or which profiles were loaded. Explicit states override either default. Unknown games are excluded whenever that label is selected, including when selecting False. Filtering and statistics aggregation happen in the browser over the already-loaded compact profiles, including comparisons, graphs, and Groups. No demo reparse is needed.

Reparsing/replacing a stored match preserves its existing valid played date and date source, including dates synchronized by the Chrome extension. Incoming demo/ZIP date metadata only fills a missing date. The preserved date also feeds player first/last-seen updates. FACEIT date synchronization remains able to correct inferred dates through its dedicated endpoint. No database migration or demo reparse is needed for this importer fix; deploy the updated API.

## Numeric Tags

Apply `database/migrations/019_numeric_tags.sql` after 018, then rebuild/restart the API. Existing definitions and states are preserved as `kind: "boolean"`. The existing private `/auth/manual-filters` routes retain their URLs for compatibility. POST accepts `kind: "boolean" | "number"` (omitted means boolean); definitions return kind. For numeric assignments PUT accepts `{ "state": "true", "value": 8.5 }` or `{ "state": "unknown" }` to clear. Numeric tags reject False, missing/nonfinite numeric values, and numbers on boolean tags. GET returns each assignment's optional value and `supports_numeric: true`. Unassigned numeric tags default to Unknown on every match; the upload cutoff still applies only to boolean tags. No public API changes or demo reparse are needed; profiles and graph axes evaluate private tags locally.

## Shared Tags

Apply `database/migrations/020_shared_tags.sql` after 019, then rebuild/restart the API. Owners grant live read-only access to an existing account with `PUT /auth/manual-filters/:filter/shares` and `{ "username": "recipient" }`, and revoke with `DELETE /auth/manual-filters/:filter/shares/:recipient`. Both return the owner's current tag payload. GET includes owned and explicitly shared tags and their current assignments, returning `owner`, owner-only `shared_with`, and `supports_sharing: true`. Recipients can use both boolean and numeric tags in filters and graphs but cannot assign, delete, grant, or revoke. All write routes still lock and require the signed session's ownership. Recipient lists are visible only to the owner. Reads use one database transaction so definitions, permissions, and assignments stay consistent. Grants cascade away when a tag or recipient account is deleted. Each tag can be shared with up to 100 existing accounts. Updates and revocations appear on reload/window focus. Frontends hide sharing controls until the API advertises support. No demo reparse needed.


Session scoreboards request `GET /groups?players=...&matches=...` with the session's exact match IDs. The optional `matches` parameter accepts 1–100 unique positive IDs and scopes all comparison queries before stats are built. Omitting it preserves full-history comparisons. Rebuild/restart the API to enable this optimization; no migration or demo reparse is needed. Older APIs ignore the new parameter and remain correct, but retain the slower full-history behavior.

## Profile teammate trade tables

`POST /players/:id/trade-teammates` is a public read-only aggregate. The JSON body
contains `match_ids` (up to 20,000 positive IDs) and `side` (`ALL`, `T`, or `CT`).
It returns `outgoing` and `incoming` teammate rows with player ID, current name,
opportunities, attempts and completed trades. Both directions are read in one
transaction using the existing trader/teammate ledger indexes. SQL aggregates
the selected matches; no full match payloads are downloaded. The endpoint does
not modify matches, tags or dates. Rebuild/restart the API to enable it; there
is no migration or reparse requirement.

The frontend requests these tables only when the Player profile Trades section
is open, caches up to eight selections for one minute, invalidates on match
changes, and aborts requests on selection/view changes. Tables paginate at 50
rows after sorting the complete result set. Match filters and player side are
exact; buy, opponent buy, round result, phase and hero filters are unavailable
for this breakdown because the persisted pairing ledger has side-level totals.
The UI explains that restriction instead of presenting unfiltered pairings as
filtered results. Bots without global player identities remain plain-text names.

## Measuring slow Groups loads

Groups and `/players/:id/teammate-ratings` now return `Server-Timing` headers
and log the same measurements as `Group profile timing` and `Teammate ratings
timing`. Rebuild/restart the backend to enable these; no frontend update or
migration is needed. In browser Network tools, select the `groups?players=...`
request and copy its Response Headers → `Server-Timing`. Also note response size,
waiting/TTFB and download time. Inspect the subsequent `teammate-ratings` requests
separately because Groups currently waits for those before showing results.

Groups exposes `build`, `encode`, `total`, `player_1`, `player_2`, etc. Player
ordinals follow the IDs in the request's `players` parameter. Detailed phase
measurements (for example `side_stats`, `weapons`, `event_kills`, `buy_slices`)
are summed across players to keep the header short. Metrics are nested and
overlap: do not add `side_data`, individual query phases, player totals and
`build` together. `total` measures API work before sending the response, not VPN
latency, proxy waiting or body transfer time. Teammate-rating requests expose
`ratings` (query and result construction), `encode` and `total`.

## Compact Groups responses

The Groups frontend requests `/groups?players=...&wire=3`. This returns one
shared `stat_keys` list and a `stat_layouts` table. Each side row identifies its
layout with `stat_layout`; its `stats` values align with the statistic indexes in
that layout. Only available counters are sent. Zero is a real counter, while an
absent key remains unavailable. Empty statistic rows use an empty layout.
Player identities, match metadata, teammate IDs, weapons, round rows and filter
dimensions are unchanged.

Older clients can still request the padded-array format with `wire=2`, or omit
`wire` for verbose objects. The updated frontend accepts all three formats,
including verbose responses from older backends. Individual profiles continue
using their existing format.

**Deploy both the updated backend and frontend** (`index.html`,
`js/players.js`, and `js/groups.js`) to obtain the benefit. No React build,
database migration or demo reparse is needed. Build 2026.11.17.2 versions the
controller URLs to invalidate cached JavaScript. Check for `wire=3` in the
Groups request and `layouts` conversion timing alongside `build`, `encode` and
`total` in `Server-Timing`.

A real-data benchmark of two players, 309 player-match entries and 24,430 side
rows measured 23.11 MB and 5.31 seconds for shared-layout conversion plus encoding,
compared with 53.45 MB / 12.31 seconds for padded arrays and 101.36 MB / 7.40
seconds for verbose objects. These are single-run uncompressed sizes and server
serialization times, not total request times or predicted compressed savings.
This changes representation only; it does not cache Groups or reduce database
work. Compare the same roster/filters after deployment and record resource size,
transferred bytes, and timings.

## Real-data Groups encoding benchmark

After updating/rebuilding **only the backend**, log in to Nick Stats and build
one group normally. Run this in the browser console to request a diagnostic report
for the same selected players (no frontend deployment is required):

```js
(async () => {
  const entry = performance.getEntriesByType("resource").slice().reverse()
    .find(entry => new URL(entry.name).pathname.endsWith("/api/groups"));
  if (!entry) throw new Error("Build a group first.");
  const url = new URL(entry.name);
  url.searchParams.set("benchmark", "1");
  const response = await fetch(url, { cache: "no-store", credentials: "same-origin" });
  if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
  console.log(JSON.stringify({
    serverTiming: response.headers.get("Server-Timing"),
    report: await response.json()
  }, null, 2));
})();
```

This requires a valid login and explicitly opting in with `benchmark=1`. The
normal Groups route and wire format are unchanged. The benchmark builds group
data once and sequentially compares verbose objects, padded arrays, and a
candidate shared-layout representation. Each is encoded with both the configured
Vapor response encoder and Foundation's `JSONEncoder`. Each trial reports
conversion milliseconds, encoding milliseconds, their sum, and uncompressed
bytes. The same conversion duration is included in both encoder totals; it is
performed once per format, not twice. Buffers are discarded between trials.

The small report also includes row, layout, key, populated-slot, and padded-slot
counts. A copy is written to backend logs under `Groups wire benchmark`. No match
payloads or statistic values are logged. The shared-layout format is also served to normal clients requesting `wire=3`. Nothing is stored in the database.

Expect this diagnostic request to take substantially longer than a regular group
request: it deliberately encodes the history six times. If the proxy times out,
check backend logs for the report after the work completes. Database build and
network compression are excluded from the individual trial timings. This is one
sample in fixed order, not a statistically controlled benchmark; repeat on an idle
server to assess variability. Changing groups between samples changes the input.

## Shared player histories and profile layouts (Build 2026.11.17.3)

Both Groups and compact individual profiles now reuse a process-local player
history cache. Groups with a scoped `matches` query bypass it; the encoding
benchmark also bypasses it so it continues to measure real construction work.
The first load after a restart, expiry, or eviction still builds the full history.
Opening a profile can warm its Groups history and vice versa. Group combinations
are not cached, so filters and roster choices are evaluated as before.

The cache keeps at most 8 histories, 4 million populated counters in total, and
64 MiB of encoded profile responses, using LRU eviction. Counter count is a memory
proxy, not an exact RAM limit; raw dictionaries and metadata consume additional
memory. Individual entries expire after five minutes even when frequently read.
No cache state is persisted and no database migration is needed.

Uploads/replacements and extension date synchronization mark affected players'
match IDs stale and discard their encoded profile response. The next read loads
only those matches plus current identity information, preserves the other matches,
and sorts the merged history by date. A generation guard rejects cache fills that
race with mutations. Expired entries are fully rebuilt; oversized histories are
served normally without being cached. Database edits made outside the API are
picked up on expiry or restart.

The frontend now requests individual profiles with `compact=true&wire=3`, using
the same shared-layout representation as Groups while retaining the profile's
`player` identity envelope. Warm profiles reuse encoded JSON too. Older wire-2
profile clients retain their existing cache and incremental refresh behavior.
The decoder accepts wire-3, padded wire-2, and verbose responses, so staggered
deployment remains compatible. Deploy **both backend and frontend** to activate
all changes: copy `index.html`, `js/players.js`, and `js/groups.js`, and rebuild the
backend and your nginx service as usual. No React bundle rebuild is required.

Groups starts teammate-rating requests alongside the main history request instead
of waiting for it to finish. Results still wait for complete ratings before being
rendered, preserving rating and graph values and existing error handling.

For validation, load the same group twice within five minutes. In `Server-Timing`,
`history_miss` means full construction, `history_hit` means history reuse, and
`history_refresh` means changed-match construction. These overlap `build` and
per-player totals. Groups still converts/encodes the combined response on each
request. For individual profiles, the second actual network request should show
`cache_hit` and no `layouts`/`encode`. Simply switching an already-open frontend
profile tab may not make a network request.

After a successful Groups load, this browser-console command shows the latest
client measurements (milliseconds):

```js
console.table(performance.getEntriesByType("measure")
  .filter(entry => entry.name.startsWith("NickStats Groups:"))
  .map(entry => ({ phase: entry.name, ms: +entry.duration.toFixed(1) })));
```

The history phase includes transfer and JSON parsing; layout expansion is separate.
Ratings overlap the history request. Prepare/render measures synchronous JavaScript
preparation and render calls, not browser paint. Total includes the whole successful
load. Timings can include browser scheduling delays; do not add overlapping phases.
