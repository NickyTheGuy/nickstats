# NickStats API

The API imports compact `nickstats.match/27` files into the normalized MySQL schema and exposes read-only match/player endpoints. Schemas 9 through 26 remain readable for existing stored matches; the browser still parses demos locally and uploads compact statistics and a separate movement capture. Run database migrations through 022 before deploying this backend. Movement is isolated from the existing statistics, dates and tag tables; see [Analyzer deployment and backfill](../docs/analyzer.md).

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

## Per-player assembly benchmark

`/groups?players=...&benchmark=2` adds a second, logged-in diagnostic. It does
**not** change normal Groups responses, frontend files, or production caches.
After pulling/rebuilding the backend, reload nginx so it resolves the recreated
backend container's current address. From the nginx compose directory:

```sh
docker compose exec nginx nginx -t && docker compose exec nginx nginx -s reload
```

Log in, build the desired group, then run this in the browser console:

```js
(async () => {
  const entry = performance.getEntriesByType("resource").slice().reverse()
    .find(entry => new URL(entry.name).pathname.endsWith("/api/groups"));
  if (!entry) throw new Error("Build a group first.");
  const url = new URL(entry.name);
  url.searchParams.set("benchmark", "2");
  const response = await fetch(url, { cache: "no-store", credentials: "same-origin" });
  if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
  console.log(JSON.stringify(await response.json(), null, 2));
})();
```

Use three or more players to include a changed-roster subset trial. Two-player
samples still compare the current format, cold per-player encoding, warm assembly,
and reordered assembly. The different-roster sample drops the last player and
reverses the rest, retaining Groups' minimum of two players.

The proposed envelope is `players: [<complete wire-3 profile object>, ...]`, each
with its own `player`, `stat_keys`, `stat_layouts` and `matches`. This allows the
same encoded individual-profile objects to be joined without decoding, counter
encoding, or remapping layouts to a group-wide dictionary. The cold candidate
encodes each player once with Foundation, as normal wire-3 profiles do; the
baseline uses the current Groups Vapor encoder. Prior measurements showed little
difference between those encoders. Benchmark identity dates are absent because
the Groups source has only ID, Steam ID and name; real cached profiles can also
contain first/last-seen identity dates.

Each trial reports conversion, encoding, assembly, total milliseconds and
uncompressed bytes, plus the number of encoded/reused players. Warm trials reuse
request-local fragments to isolate assembly cost; they do not prove production
cache hit rates or account for expiry, eviction or concurrent invalidation.
Database work, cache lookup, compression, transfer, browser decoding and counter
verification are outside trial timings. The benchmark decodes each fragment and
checks every available statistic against the source, including zero values;
`verified_counters` reports the count. This is one sample in fixed order; repeat
on an idle server to assess variability. A copy is logged under `Groups assembly
benchmark`, including if the proxy times out before the report arrives.

## Encoded per-player Groups assembly (Build 2026.11.17.4)

The Groups frontend now requests `wire=4`. Its response contains complete wire-3
profile envelopes in `players`, each with its own identity, statistic keys, layouts,
and matches. The frontend expands each player using that player's dictionaries,
then normalizes it to the existing Groups structure. Wire-3, wire-2 and verbose
responses remain supported for staggered deployments and older clients.

Unscoped Groups requests retrieve the same encoded JSON used by normal wire-3
profiles. Only missing or stale players are built/encoded. The response joins the
fragments into one JSON body, without decoding or re-encoding their counters.
No group-combination cache is stored. Requests with a `matches` scope bypass full
history reuse and encode only that scoped data; a scope must never expose an
unfiltered history. Both logged-in benchmarks retain their uncached behavior.

Raw histories and encoded responses now have **independent** LRU budgets: at most
8 raw histories / 4 million populated counters, and at most 8 encoded responses /
64 MiB of JSON. Evicting raw dictionaries does not evict encoded fragments. These
are bounded caches, so not every requested player is guaranteed to remain cached.
Counter count remains a memory proxy, not an exact RAM limit. Both stores expire
entries after five minutes; hits do not extend expiry. No data is persisted across
backend restarts. Normal profiles and Groups warm the same encoded store.

Example: after a cached group of two players plays one new match, nothing changes
on the site until that match is uploaded. A successful upload marks that match ID
stale for both players and immediately removes both encoded responses. On the next
request, each retained raw history reloads only that match and current identity,
keeps its older matches, merges/sorts the result, and re-encodes the full player
response. An unaffected player's encoding remains reusable. If a raw history has
expired or been evicted, that player's history must be rebuilt in full instead.
Reparses/replacements and extension date updates use the same invalidation path.
Generation guards prevent fills racing with a write from repopulating stale data.
The cache preserves canonical data; it does not alter tags or match dates.

Deploy **both backend and frontend**: update `index.html`, `js/players.js` and
`js/groups.js`, and rebuild the backend. No React rebuild, migration or reparse is
required. Reload nginx after recreating the backend so it resolves the current
Docker address. From the nginx compose directory:

```sh
docker compose exec nginx nginx -t && docker compose exec nginx nginx -s reload
```

For verification, request the same group twice, then a different combination of
already requested players. Expect `wire=4` and `assembly` in `Server-Timing`.
A fully warm request shows `encoded_hit` and no `layouts`/`encode` phases. Cold or
changed players show `history_miss`/`history_refresh`, `history_build`, `layouts`
and `encode`. These phases are aggregated across players and overlap per-player
and `build` totals. `build` for wire-4 means obtaining all fragments, including any
needed history building and encoding. Assembly still copies bytes into a combined
response; compression, transfer, JSON parsing and browser rendering are additional
costs. Use the existing browser measurements to assess those stages.

## Friendly/enemy Groups rules (Build 2026.11.17.5)

Groups now has two nested expression trees, Friendly and Enemy. Each group can
require All (AND), Any (OR), Exactly one (XOR), or None of its child conditions.
Player conditions Include or Exclude that player on that side. Excluding a player
from Friendly does not exclude them from Enemy or from the match as a whole.
XOR means exactly one true child condition, not odd parity. Empty branches impose
no restriction and are ignored inside other groups. Expressions are bounded to
80 nodes and five nesting levels; up to 20 players can be selected.

For example, Friendly can be Me AND (Alex OR Sam), while Enemy can be John OR Tim.
Both team orientations are tested independently for every match, without a fixed
anchor player. The union of loaded players' histories defines the search universe;
a match must involve at least one selected player. Matches satisfying multiple
alternatives or both orientations are counted once. Existing date, map, tag and
statistic filters still apply. Result filters remain relative to each displayed
player's own result.

Show stats is separate from rule membership. A player can be used only in a rule,
only as a displayed profile, or both. Only actual match rows contribute statistics;
matching a player's roster presence does not fabricate zero rows when their stats
are absent. Matching profiles, Quick Comparison, graphs and the match list share
one qualifying cohort. The old With/Without split is replaced by explicit rules.

Rules run in the browser against the existing per-player cached histories.
Editing conditions or changing displayed profiles recomputes the results without
fetching those histories again. Adding/removing selected players still requires
building the new selection. Wire-4 Groups now permits one selected player;
legacy comparison endpoints retain their minimum of two. Scoped wire-4 requests
also permit one player and still bypass unfiltered history caches.

Profile match metadata now includes optional `opponent_ids`, populated from
`match_players` independently of opponent stat rows. Together with `teammate_ids`
this identifies both teams reliably even if an opponent has no usable profile row.
Older responses without this field fall back to the selected players' observed
team rows. No demo reparse or database migration is required. Normal import/date
cache invalidation and cache budgets are unchanged.

The browser saves the roster, expressions, and displayed players in
`nickstats.groupQuery.v2`. Existing `nickstats.groupSelection.v1` Include/Exclude
selections migrate to friendly AND rules; only formerly included players are
shown by default. New players start as friendly Include conditions with Show stats
selected, and can then be changed or used only for display. Clear removes both
saved formats. Rules do not create per-combination backend caches.

This release changes **backend and the React UI**. Deploy the rebuilt backend and
copy `index.html`, `styles.css`, `js/`, and `assets/` to the nginx static directory.
The updated React bundle is committed; no npm build is needed on the server.
Reload nginx after recreating the backend. Check Build 2026.11.17.5; Groups keeps
using `wire=4` with the existing `encoded_hit` and `assembly` timings.

## Compact Groups editor (Build 2026.11.17.6)

This is a **frontend-only** update to the rule builder. The green/red player cells
return with Include/Exclude toggles and ×. Drag a cell or whole outlined condition
group by its handle into Friendly, Enemy, another condition group, or Available
players. The destination highlights and the item snaps there on release. Moving
preserves conditions; it does not copy or duplicate them. A cell's × returns it to
Available; × there removes that player from the selection. Show stats remains a
separate compact checkbox row and is unchanged by moving/unassigning conditions.

Drag a rectangle from blank team space across cells to create an AND group on
release, then use its compact operator selector to choose AND, OR, XOR, or NONE.
Existing groups are selected as whole units. Selecting one existing group (or its
inner cells) again cannot add another wrapper. An ungrouped single player can get
one outline; meaningful nesting requires selecting separate cells/groups. Group
creation cannot cross teams, create empty groups, exceed the existing limits or
move a group into itself/its descendants. An outlined group's × ungroups its
children without deleting their cells. Only empty groups are pruned during moves;
explicit single-player groups and NONE negation are preserved.

Touch users can drag using handles, or tap handles to select and use Group
selected / Move to. Keyboard users can focus handles and press Space/Enter to
select multiple items, then use those actions. Shift-click adds mouse selections;
Escape cancels dragging/selection. Touch scrolling is preserved outside handles.
Rule changes still reuse loaded histories and the saved query format is unchanged.

Deploy `index.html`, `styles.css`, and `assets/` (including the committed rebuilt
React bundle) along with your usual frontend files. No backend rebuild, database
migration, or demo reparse is needed for this release.

## Simplified Groups controls (Build 2026.11.17.7)

Frontend-only update: instructional text, the Available players area, Show stats
controls, and per-cell Include/Exclude switches are removed. Players are added to
Friendly and all selected players get profile/comparison views automatically.
Cell × removes that player from the selection and all conditions. Group × still
ungroups its children. Dragging, marquee grouping, touch and keyboard actions
remain available.

The group selector now reads AND, OR, XOR, Exclude. Exclude retains the internal
`none` Boolean meaning: none of that group's child conditions may match. It is
scoped to that team and has a red outline, with cell colors reflecting negation.
An optional-player outline can switch between AND and Exclude for with/without
comparisons, including in separate browser tabs. No separate quick toggle is
added.

Saved per-player exclusions are upgraded to explicit Exclude outlines, including
nested/double negations, preserving existing matching semantics. Formerly
unassigned players are returned to Friendly; saved Show stats preferences no
longer hide selected profiles. Empty nested outlines are removed. The editor's
bounded capacity is now 200 nodes / six levels, allowing room to represent
previously valid per-player exclusions as outlines. Grouping still cannot wrap a
single existing group again or create cycles.

Update the frontend copy of `index.html`, `styles.css`, `js/`, and `assets/`.
The React bundle is already built and committed. No backend rebuild, database
migration, cache change or demo reparse is required.


## Nested selection gestures (Build 2026.11.17.9)

Frontend-only: the temporary Group selected / Move to / Clear selection toolbar
has been removed. Marquee selection now starts inside any group and targets its
direct child cells/groups. Proper subsets can form nested condition groups while
whole-outline rewrapping, cross-parent grouping and cycles remain disallowed.

Dragging one selected item carries the full selected set, including mixed player
cells and subgroups. The destination is validated for every moved item before
changing the tree; an invalid/cyclic/over-depth drop moves nothing. Selecting a
group and its descendants does not duplicate them. Empty source groups are
removed; remaining group operators and explicit unary outlines are preserved.
The selection remains highlighted after a drop and the preview reports the count.

Shift-click or touch-select handles for multiple selections, then drag one of
those handles. Ctrl/Cmd+G groups, Ctrl/Cmd+Shift+G ungroups, and
Ctrl/Cmd+Shift+Left/Right moves the selection to Friendly/Enemy. Escape clears or
cancels. Existing colors, exclusions, player-first layout, query semantics and
history caching are unchanged.

Deploy updated `index.html` and `assets/`, including the rebuilt React bundle.
No backend rebuild, migration or demo reparse is needed.

## Analyzer replay API

Apply migration 021 before using these routes. All paths below are relative to
`/nickstats/api` at nginx, like the existing API.

| Method | Route | Authentication | Purpose |
|---|---|---|---|
| GET | `/analyzer/matches?players=1,2&limit=100&offset=0` | Public | Lightweight candidate rosters, dates, maps and available capture IDs |
| GET | `/analyzer/matches?match=123` | Public | Resolve a single stored match |
| POST | `/analyzer/matches/<id>/captures` | Existing upload authorization | Begin an immutable capture with header and checksummed round manifest |
| PUT | `/analyzer/captures/<uuid>/rounds/<number>/parts/<index>` | Existing upload authorization | Save one bounded UTF-8 chunk |
| POST | `/analyzer/captures/<uuid>/complete` | Existing upload authorization | Verify all chunks, samples and round indexes, then publish atomically |
| GET | `/analyzer/captures/<uuid>` | Public | Read lightweight replay header and round indexes |
| POST | `/analyzer/indexes` | Public, read-only | Batch lightweight replay indexes for up to 100 capture IDs |
| POST | `/analyzer/captures/<uuid>/selection` | Public, read-only | Read selected round numbers and player tracks in one response per match |

A selection body is `{ "rounds": [1, 3], "players": ["steam:765..."] }`.
Private tag filtering uses the existing authenticated tag API in the browser;
these public replay endpoints never return private tags. No replay work is added
to the existing statistical read routes. Storage, backfill and memory limits are
explained in [the Analyzer guide](../docs/analyzer.md).


## Utility effectiveness search

Apply `database/migrations/022_analyzer_utility_search.sql` before deploying this
backend. It adds capture-owned effectiveness rows and an index-completion marker;
match statistics, dates, tags and replay chunks are preserved.

`POST /analyzer/utility/search` is public and searches the compact utility index.
It accepts eligible capture/round scopes, selected replay player IDs, HE/Flash/Fire,
a metric and minimum, and bounded pagination. Fire covers both Molotov and
incendiary grenades. Group/date/tag/buy/side filters choose eligible scopes using
the existing Analyzer rules before searching. Unknown metrics and unowned throws
are reported separately and excluded from numeric matches. A stale capture list
returns 409 rather than silently searching superseded captures.

New captures are indexed atomically at publication. Search automatically prepares
one unindexed capture per request under its publication lock. Pending capture IDs
let the client continue until preparation finishes; partial results are not
published. This derived public cache needs no separate login or indexing button.
It reads already-saved chunks on the server, without parsing or downloading a
demo. `POST /analyzer/utility/index` remains an authenticated, idempotent
administrative endpoint. Effectiveness is taken from capture metrics, with existing round totals
used only when exactly one recorded throw and one captured effect prove the total
belongs to that grenade. Ambiguous attribution remains NULL. Replacing statistics
invalidates the fallback index; publishing a new capture creates a new index, and
capture deletion cascades its index entries.

Utility search backfill (2026.11.19.8) skips decoding movement fields and batches
up to 100 grenade inserts per database write. Completed capture indexes are
persistent, shared across searches and independent of player/group combinations.
Search responses include `Server-Timing`: `captures`, `prepare` (with
`index_totals`, `index_read`, `index_decode`, `index_write`), `count`, `query`,
`encode`, `total`. Preparation phases appear only on a cold search. These timings
are also logged as "Utility search timing". Deploy both backend and frontend;
no migration or reparse is required for this change.
