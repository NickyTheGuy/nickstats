# 2D Analyzer

## Match and Groups

**Match** opens a stored match by its database ID (or **Analyze** on the match
banner). The original local **Open** option still accepts demos and replay JSON.
Single-match player selection and round controls retain their existing behavior.

**Groups** reuses the normal Friendly/Enemy condition editor, including AND, OR,
exactly-one XOR and Exclude. The candidate set is the union of matches containing
at least one named condition player, matching the normal Groups feature; both
team orientations are evaluated. Only players named in those conditions appear
in the Analyzer player selector, including named players in Exclude conditions.

Dates and private/shared tags choose matches, defaulting to all. Undated matches
are included unless a date range is selected. Each map is viewed separately: the
map control reports counts and initially chooses the map with the most available
captures. Missing captures are counted explicitly; they are never fabricated.
**Analyze** on a player or Group profile carries its players/conditions, date and
tag selections and its map when exactly one is selected. Analyzer round filters
start at All rather than inheriting profile-only aggregation settings.

Groups initially selects all qualifying rounds. Buy choices are a union (Full +
Force), combined with side, result and enemy-buy filters. Halves and round numbers
are independent optional restrictions. For example, numbers 3 + 4 means those
round numbers in every matching match. Category filters never disable the number
buttons. Match mode retains its explicit individual-round selection.

Stored match links use `#analyzer/match/<id>`. Group links encode the query in the
hash and can be refreshed or revisited with browser Back. Tag conditions still
require access through the current account; assignments are never embedded in a
link. Local file contents are not stored in links.

## Deployment

This step changes **both frontend and backend**, and adds MySQL tables:

1. Apply `database/migrations/021_analyzer_replays.sql` once to the existing
   database (after migrations through 020), using the same administrative MySQL
   method as the earlier migrations. A new database can use `database/schema.sql`.
2. Rebuild/restart the backend from the updated repository.
3. Copy the updated static frontend to the nginx-served NickStats directory:
   `index.html`, `styles.css`, `js/` and `assets/`. The React bundle is committed;
   running `npm ci && npm run build` locally is needed only when building source.
4. Run your nginx Compose update and reload nginx's upstream resolution after
   recreating the API container:

   ```sh
   docker compose up -d --build nginx
   docker compose exec nginx nginx -t
   docker compose exec nginx nginx -s reload
   ```

No replay volume, nginx body-limit increase or changes to existing profile routes
are needed. Upload chunks are small enough for the current 2 MB nginx limit.

## Adding movement to existing matches

Existing statistics contain no movement tracks. Parse the original demo again
through the regular **Match → Upload** flow. The worker captures movement and
statistics in one pass. After statistics are saved (or the existing match is
recognized), movement is uploaded to its own tables. For the same demo, choosing
**Replace stored match** is unnecessary merely to add movement. If the demo's
fingerprint differs from the stored one, movement is rejected until the normal
explicit replacement workflow is used.

Replay writes never update match dates, tag definitions or tag assignments. The
existing statistics importer continues to preserve those on replacement. A later
statistics replacement with a different demo SHA makes old movement unavailable
until that new demo has a completed capture. Normal profile/Group/match-stat
responses contain no movement data and do not read these tables.

Capture failures are reported separately from saved statistics. An interrupted
upload remains unpublished and leaves the previous complete capture available.
Starting another capture cleans up abandoned uploads older than a day. Publishing
a replacement removes superseded captures older than a day, allowing active
readers time to finish. Replaying/querying uses no persistent browser cache and
reads current roster metadata on a fresh search; new matches/captures trigger a
refresh in the open page.

## Storage and loading

Movement is larger than ordinary statistics: positions are sampled at 5 Hz,
projectiles at up to 20 Hz, plus utility, deaths, firing and round context. Storage
is the UTF-8 JSON for each round plus small indexes, not the original demo. A
capture is bounded at 128 MiB and one million combined position samples. Actual
size depends on duration, grenades and firing; it should not be described as
negligible. You can measure a completed capture in MySQL:

```sql
SELECT c.match_id, c.id, ROUND(SUM(OCTET_LENGTH(p.body))/1048576,2) AS movement_mb
FROM replay_captures c JOIN replay_chunks p ON p.capture_id=c.id
WHERE c.complete=TRUE
GROUP BY c.match_id,c.id ORDER BY c.match_id DESC;
```

The Groups lookup fetches only lightweight match rosters, not career statistics.
Movement is fetched only for the current map, selected rounds and selected
players, with two matches in flight at a time. All roster names remain available
for kill/death tooltips. A changed selection cancels obsolete work and releases
its data. There is no eight-match cap; the active selection retains the existing
two-million-sample/128 MiB browser memory budget. Exceeding it produces an explicit
error to narrow dates, tags, players or rounds; no partial selection is displayed.

## Validation

`npm test` covers rules, routes, union filters, independent round numbers, paging,
upload chunking/checksums, interrupted uploads, request concurrency, cancellation
and memory-budget failures. Swift tests validate capture samples, context indexes
and projection. Backend CI also runs the real HTTP routes against an isolated
MySQL service, including authentication, atomic publication, exact fingerprints
and preservation of dates/tag assignments. The integration script refuses to run
outside the explicitly named test database.
