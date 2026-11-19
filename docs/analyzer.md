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
for kill/death tooltips. A changed selection cancels obsolete work. Already downloaded player/round slices
are retained in a bounded in-memory LRU cache keyed by immutable capture UUID.
Narrowing side, buy, result, round, date, tag or player selections reuses those
slices locally; widening a selection fetches only missing rounds/players. Changing
map or returning to earlier matches can reuse retained slices too. Old inactive
slices are evicted first when space is needed. Reload selection explicitly
invalidates movement for the current captures; opening local files clears the
remote movement cache. Browser refresh starts with an empty cache. There is no eight-match cap; the active selection retains the existing
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

### Movement read timing

Movement reads now fetch all requested round chunks in one database query per
match. The JSON decoder tries numbers first, avoiding repeated failed type
decodes for each coordinate. Upload completion still verifies checksums and every sample before
publication; immutable published reads check chunk order and sizes without
rehashing the upload. Each selection response supplies `Server-Timing` phases
`index`, `chunks`, `assemble`, `decode`, `project`, `encode` and `total`, so slow
first loads can be measured separately from transfer/browser work. This update
requires the new frontend bundle and a backend rebuild, with no new migration or
demo reparse.

## Area selection

Drag on the map to select the player and event markers inside a rectangular
radar area; selection pauses playback. Click selects the owning player-round of
a marker. The outcome panel counts distinct selected rounds out of all currently
filtered rounds and shows their percentage. Selection stores the player-rounds
and grenades captured by the gesture, so playback, scrubbing, zoom and pan do not
change it. Shift/Ctrl/Command adds another click or box to the selection. Use Pan
(available when zoomed), middle-drag or Alt-drag to pan. Empty-map click, Escape
or the panel's close button clears selection. Changing filters preserves playback
time while a selection exists, clamped to the available round duration.

Kills, deaths and rating pool the selected **player rounds**. Each player counts
once per match-round, including when both their living marker and events were
selected. A shared match round counts once in the round percentage. Win
rate counts each qualifying team's result once per round, so several teammates
in the same selection do not multiply a round's weight. Unknown results are excluded. K–D and K/D use the
whole round, including combat after the selected playback time. Rating uses the
same pooled damage/assists/KAST formula as profiles, not an average of individual
rounded ratings. Missing exact round data displays an unavailable rating, never a
zero or an estimate. With an older replay that has no combat data, K–D/K/D are
also unavailable.

The backend attaches small performance records from existing
`player_round_phase_stats` rows to movement selection responses. New local demo
captures include the same counters. The optional replay field remains compatible
with version 4 and is cached with player movement, so changing selection or time
requires no network request. Existing captures can use their saved database round
statistics without being recaptured. Matches imported before per-round statistics
were stored may need their statistics reparsed for a rating; positions and
available win/K–D information still work.

Dates and Tags now live in the Players & rounds panel alongside the other
filters. They continue selecting matches before round filtering and reuse cached
movement. Name tags, immediately after player selection, default to Off. The new
UI and server performance records need the updated frontend and backend; no new
database migration is required.

## Event and grenade cohorts

Selection is shared across living players, kills, deaths and every enabled utility
layer. There is no selection-target mode. A click selects the marker's owning
player-round, rather than querying a small geographic box; grouped coincident
markers retain all their represented player-rounds. A plain click/drag replaces
selection. Shift/Ctrl/Command-click or drag adds to it, including across floors
and playback times. Empty-map click or Escape clears it. Pan uses its explicit
button, middle-drag or Alt-drag, leaving Shift-drag available for selection.

A drag selects the visible marker centers inside its rectangle. Kills use their
drawn killer markers and deaths their drawn victim markers, including their
separation offsets. History icons keep past enabled grenade detonations visible and selectable.
Live effects show grenade flight, trails and temporary smoke/fire areas. These
layers are independent: either, both, or neither can be enabled. A grenade selects
its thrower's player-round and that specific grenade's effectiveness. Choosing a
player and their grenade/kill/death still counts their full-round outcomes once;
repeated boxes/clicks cannot multiply the same grenade's effectiveness. Distinct
grenades and distinct match-rounds remain separate. Selection stores identities,
so scrubbing or moving a player does not silently change the cohort. Utility
identities remain stable when a filtered roster changes array indices.

The outcome card reports grenade count, enemies flashed and enemy blind seconds
per flashbang, or enemy damage per HE/fire grenade. New demo captures correlate
flash events by grenade entity where present, otherwise by an unambiguous
thrower/type/time match. Damage uses the parser's corrected enemy health damage;
self/team damage is excluded. Overlapping fires from the same thrower and other
ambiguous matches remain unavailable instead of being assigned to an arbitrary
grenade. Repeated blind updates for the same victim/flash use one enemy and the
longest recorded duration. True zero-effect grenades remain zero.

Older captures can use existing round utility totals **only** when the saved throw
count and captured effect count both prove there was a single grenade of that
type from that player. Other old effectiveness values display —. Event selection
and focusing work with existing captures; complete per-grenade effectiveness for
multiple throws needs a new movement capture. No database migration is required.

Focus selection freezes the selected **player-round instances**, clears the
marker selection and rewinds playback. A selected player is retained only in the rounds
where that specific instance was selected, even if another selected player was
somewhere else in the same rounds. Enabled enemy context remains visible in
those rounds; focus does not silently hide opponents or their enabled actions. The focused instance count appears in the
control panel. Clear focus removes that restriction; Match mode also restores its
prior explicit round selection. Manual Match round edits replace focus. Focus
uses already cached player/round slices and does not re-download a subset.

Find Matches is left-justified and vertically aligned within its action row.


## Match rounds and display controls

Match has a permanent, single-row round strip centered in the viewer header.
Round numbers and half/overtime presets use the existing compact toggle buttons.
The strip scrolls horizontally through arbitrarily long overtimes; it never
expands. On narrow viewers it occupies a second header row. The Match overlay
contains player and filter controls, without a duplicate round picker. Groups
keeps its phase, half and cross-match round-number controls in the overlay.

Both modes expose player cells, names, held items, blindness, utility types and
combat layers. Live effects (default On) show projectile flight/trails and active
utility areas; History icons (default Off) show permanent detonation markers up
to the scrubbed time, without pretending expired areas are still active. Both
layers can be enabled together. Hiding cells leaves utility/combat controls
independent. Visibility changes reuse movement already loaded.

Groups has an Enemies toggle (default Off), with its own reusable copy of all
display controls. Cells and actions are independent: enemy utility can remain on
with enemy cells off. Opponents are resolved per round from the selected players’
sides, with roster-team fallback for older indexes. CT/T filtering preserves
opponents of that perspective. Focus narrows the primary player-round instances,
then retains enabled opposing context. Enemy display never widens date, tag,
round or group filters. Movement is fetched on demand only for required players
and rounds, then uses the same bounded cache.

## Single-round combat and optional player state

With exactly one replay round in view, kills use a fading six-second kill feed
and crosshair markers on the scrubber, rather than weapon badges on the map.
Click a timeline marker to pause and seek to its exact event time. Feed opacity
is derived from replay time, so scrubbing backwards restores entries. Visible
player cells leave faded skulls at their recorded deaths, including during the
brief gap before the next sampled health update. Multi-round analysis retains
its existing kill/death map markers.

New movement captures optionally contain equipment tracks with change-only
`[time,item|null]` samples and victim blindness events `{player,time,duration}`.
Equipment is read from the active weapon handle at the existing 5 Hz position
cadence, including C4. Unknown handles clear the badge; weapons are never guessed
from later kills. Blindness includes self/team flashes as well as enemy flashes.
Overlapping blindness uses the greatest remaining expiry, not summed durations.
The cell overlay is translucent white with a remaining-time radial meter; five
seconds is its display ceiling, while recorded durations remain unchanged.

These fields are validated, projected by player, budgeted and cached with the
other replay data. Existing captures still support the feed, timeline and display
changes; blindness and held-item badges need a fresh movement capture. Update
both frontend and backend; no database migration is needed.

## Rectangular map viewport

Each canvas now allocates a backing bitmap matching its pane, with a capped
pixel ratio. Radar drawing, panning, marker hit targets and selection share the
same centered radar transform. Zoomed maps can paint into the pane's spare
vertical or horizontal space instead of being clipped by a square bitmap first.
Upper/lower level split resizing and independent map zoom remain supported.


## Round clock, objectives and navigation

The viewer header now separates Filters (players, dates, tags, sides, buys and
round selection/focus) from Visuals (cells, names, equipment, blindness, utility,
combat and enemy display). Both use one reusable overlay menu; opening one
closes the other. Visual changes do not change the selected match/round set.

For a single round in Match mode, a separate countdown sits over the map while
the existing elapsed-time readout stays on the scrubber. An on-time plant resets
the countdown to the bomb timer; a plant strictly after the round timer reached
zero does not restart it. Defuse freezes the remaining bomb time; explosion shows
zero. Scrubbing backwards recomputes the state deterministically.

New captures optionally store global round `clock` values and `bomb_events`
(plant, defuse, explode with exact elapsed milliseconds and optional actor).
Clocks use recorded server convars and game-rule/planted-C4 fields when available.
Standard fallback values are marked approximate in the clock readout. Older
captures are enriched with existing `match_rounds.bomb_plant_elapsed_ms` when
available, so plant markers can work without recapturing. Defuse/explosion times
are never guessed from the winner or round end; those exact markers need a new
capture. These small global fields survive player projection and movement-cache
subsets. No database migration is required; update frontend and backend.

The single-Match-round scrubber colors normal time grey, planted time red,
post-defuse time blue and post-explosion time dark red. Plant/defuse/explosion
buttons share the kill markers' tooltip/seek behavior. Clicking pauses and seeks
to the exact event. Groups and multi-round Match views retain their existing
elapsed timeline without the bomb countdown/state bands.

Previous/Next buttons remain fixed to the right of the Match round strip. They
select one adjacent eligible round in the same match, clear focus/area selection,
pause and rewind. They skip rounds excluded by current filters, support arbitrary
overtime, and disable at either boundary or when zero/multiple rounds are selected.
The selected round chip scrolls into view when stepping.


## Utility search

The map toolbar's **Utility** overlay contains grenade icon switches, the relevant
effectiveness switch, a minimum input and Search. HE and Fire use enemy HP damage
per grenade; Fire covers Molotovs and incendiaries. Flashbangs use enemies blinded
or total enemy blind seconds. Positive enemies-blinded searches also require
positive recorded blind time. Unknown effectiveness never qualifies as zero.

Search uses the eligible player/group, map, dates, tags, side, buys and round
selection. Each grenade is evaluated separately: two 20-damage HEs never satisfy
a 40-damage threshold. Search automatically collects result pages and puts only
the matching grenades on the map at round end, with persistent icons enabled.
It does not download movement to display results. Hover gives the thrower,
match, round, time and effectiveness. Normal map selection deduplicates actors
and rounds; Focus selection opens those player-round instances in the replay,
reusing cached movement where available. The compact clear control restores the
normal map and its saved visual settings. Changing scope aborts old searches and
clears results. Visual toggles do not change search scope.

To keep the map responsive, searches exceeding 5,000 markers ask for a narrower
filter or higher threshold instead of silently truncating results. Result-only
markers carry round outcomes and grenade metrics; K/D and rating remain unknown
until the full replay is loaded through Focus selection.

Migration **022_analyzer_utility_search.sql** must already be applied; this overlay
update adds no migration. New capture publication indexes atomically. Search
prepares older published captures automatically on the server, one per request,
then completes without a separate indexing step or login. This reads saved
chunks once, without reparsing a demo or downloading movement. Capture metrics
are preferred; round totals fill missing fields only when exactly one recorded
throw and captured effect prove the total belongs to that grenade. Ambiguous
attribution remains unknown. Statistics replacement invalidates indexes that
can depend on round totals. Superseded captures are rejected, and dates and tags
remain untouched.

## Map-first Groups and post-round playback (2026.11.19.2)

Groups requires a map before Find matches. Choosing a map is local: no match
rosters, replay indexes or movement are fetched until Find matches is pressed.
The match lookup is scoped by map in SQL, before pagination and roster loading.
Changing maps clears the old view and waits for another search. A profile/group
handoff without a map also waits; a handoff with an explicit map opens that map.
Dates and tags still filter the matching map locally without downloading new
movement for already-cached rounds.

New captures continue after the live round ends, through the playable transition
period. Player positions, held items, blindness, combat and utility use the same
sampling rates. Replay collection closes at official end, next prestart/start,
or an observed transition to freeze/warmup. The next live round has its own
window; if final transition events are absent, the last recorded demo packet
bounds the final replay. Warmup and the next round's freeze are excluded.

Replay `duration` covers the full playback window; optional `live_duration`
preserves the round-win time. The single-round countdown freezes there, and the
scrubber marks post-round time (while retaining bomb defuse/explosion colors).
Existing live-round statistical definitions and match timing stay unchanged.
This affects only optional movement capture and Analyzer responses; ordinary
profile/Groups statistic payloads do not gain movement data.

Deploy frontend and backend together. No new database migration is required.
Existing captures remain readable, but reparse and save demos with this build to
recover post-round actions; older captures cannot reconstruct omitted samples.
Existing match dates and tags are preserved by the normal reparse path.
