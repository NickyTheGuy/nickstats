# NickStats

A static, browser-only Counter-Strike stats analyzer. It currently supports two data sources:

- **CSStats Files** — compare saved CSStats profile exports in a group matrix or include/exclude lineup conditions.
- **Demo Parser (experimental)** — select one CS2 `.dem` or `.dem.gz` and build a local match scoreboard.

The selected HTML and demo files are processed in the browser. NickStats does not upload them or require a server.

The visible date-based build number beside **Local browser prototype** is bumped with parser and interface deployments, making it easy to tell when GitHub Pages has published the newest version.

Demo statistics use the roster present when each round goes live as the denominator, so transient pre-freeze spawns do not count. Bots that enter live play remain separate, visibly labeled rows and are identified in JSON so future aggregate analysis can exclude them by default.

The Demo Parser's **ALL / CT / T** selector applies to the scoreboard, rating, KAST, trades, utility, kill context, clutches, multikills, weapon ledger, duel matrix, player round counts, and side wins. Side attribution uses each player's live team assignment for every completed round rather than splitting the match in half, so regulation and FACEIT overtime side swaps are handled directly. The demo is parsed once; changing the selector only switches among the stored aggregates.

The large demo outputs share a local **Scoreboard / Duels / Trades / Weapons** tab bar beneath the side selector. Changing result tabs does not discard the selected side or reparse the demo.

Parsed results include a FACEIT match ID extracted from an original FACEIT filename when available, plus a SHA-256 fingerprint of the uncompressed demo. `match_uid` prefers the provider ID and falls back to the fingerprint, while `demo_sha256` can always be used for exact duplicate detection.

## Run it

Open the published GitHub Pages site, or clone/download the repository and serve the folder with any static web server. The CSStats file analyzer also works when `index.html` is opened directly. The demo parser is intended for the HTTPS GitHub Pages version because its parser library is loaded from a pinned CDN URL.

## Demo prototype

The Demo Parser tab uses [`@deademx/cs2` 4.0.0](https://github.com/Igor-Losev/deadem/tree/v4.0.0/packages/cs2) in a Web Worker. It reads kills, deaths, assists, headshots, damage, trade kills and deaths, trade opportunities and attempts, damage- and flash-assisted kills, enemies flashed, flash assists, HE and fire grenade damage, openings, exact 1K–5K rounds, 1v1–1v5 clutch wins, team assignments, the map, and round winners from the demo event stream. It also tracks mirrored kill context: kills against blinded enemies and deaths while blind, wallbang and through-smoke kills/deaths, airborne kills and deaths to airborne killers, running kills/deaths, and average horizontal killer speed. Speed uses the pawn's networked velocity when present and otherwise derives it from horizontal position changes between demo packets. The scoreboard displays speed as a percentage of the held weapon's maximum movement speed, including scoped limits; values may exceed 100% after boosts or air movement. Grenade, lingering-fire, C4, and world kills are excluded because the killing weapon need not still be held. Raw units-per-second values remain in the JSON export. The JSON also records kills made while the attacker was blind and deaths to a blind attacker.

A running kill means the killer's horizontal speed exceeded **34% of the held weapon's maximum movement speed**, the point at which movement inaccuracy begins in the convention documented by [Leetify](https://leetify.com/blog/leetify-stats-glossary/). Separately, every speed-measured firearm kill is classified as **Moving** (above 1 Source 2 unit per second) or **Still** (at most 1 unit per second); the tolerance prevents tiny coordinate noise from labeling a stationary player as moving. The collapsed Kill Context column shows **Unfair K-D**: unique kills/deaths involving a blinded victim, penetration, smoke, an airborne killer, or a running killer. A single event matching several conditions counts only once. Expanding the group shows every component, the Moving/Still split, and average killer speed percentage.

Side-specific ADR records each enemy-damage event directly into the attacker's live CT or T bucket. Its numerator and rounds-played denominator therefore cover the same side rather than reconstructing side damage from a later full-match total. Damage is reconstructed from the victim's tracked health before and after each `player_hurt` event, capping lethal overkill at the health actually removed. The corrected amount is also used for weapon and grenade damage. A round stops accepting live combat events immediately at `round_end`, preventing post-round damage from entering CT/T totals after that round's denominator has already been finalized. Raw corrected damage is included in each JSON player aggregate for validation.

Each player also receives a per-weapon ledger containing enemy kills, enemy health damage, `weapon_fire` events, and **Rounds Used**. A weapon counts once per player per completed round when it is picked up, equipped, fired, deals damage, or gets a kill. This includes carried weapons and mid-round pickups without allowing repeated equip/pickup events to inflate the total. A shotgun firing event counts as one shot rather than one per pellet.

Pickup, equip, and even damage events sometimes use the shared `hkp2000` family label for both CT starting pistols. NickStats learns each player's CT pistol choice from the explicit item definition index—USP-S (61), P2000 (32)—or unambiguous combat events, retains it across rounds, and routes ambiguous inventory/damage events to that choice. An unindexed `hkp2000` inventory event cannot create a P2000 statistic by itself.

The duel ledger records every kill/death pairing and its differential. Enemy kills and teamkills are directional player matchups. Explicit suicides and deaths without a player attacker—such as falling or map hazards—are treated as self-kills, matching Counter-Strike's scoreboard convention. The browser renders this as one matrix: rows are players, columns are other players, and each cell is the row player's kills-deaths against that player. A self-kill appears on the diagonal as `0-1`, and team boundaries remain visually separated. Blank cells mean no such event occurred. In CT or T view, each row is filtered to the side played by that row's player when the duel event occurred.

The trade-response matrix breaks the aggregate trade model down by teammate. Rows are potential traders, columns are the teammates whose deaths they could respond to, and same-team cells display `opportunities / attempts / successes`. Opposing-team and self cells are blank. Like the scoreboard and duel matrix, the trade matrix follows the ALL / CT / T selector using the potential trader's side when the response occurred.

Scoreboard headers are sortable within each team. Composite headers cycle through their component statistics and then return to the original neutral order; single-stat headers toggle between that statistic and neutral. Favorable values sort first, so death-based penalty columns use fewer-first ordering.

The first trade-opportunity model is intentionally simple and transparent. A living teammate receives an opportunity when they are within 250 Source 2 game units of a teammate at the moment that teammate dies. This radius was calibrated against a known Leetify match result. A teammate outside that radius also receives a retroactive, proven opportunity if they damage or kill the killer within five seconds. Damaging the killer is an attempt; killing that player is a success. Success percentage uses attempts—not opportunities—as its denominator. A death is “tradeable” if at least one teammate met either rule, and it is counted only once regardless of how many teammates qualify. Its death-side attempt and success also count once even if multiple teammates act.

Nonlethal HE damage proves an attempt only when the target's reconstructed pre-hit health was within the HE's theoretical maximum: 98 damage without armor or 57 with armor. Nonlethal incendiary, Molotov, flash, decoy, and smoke damage does not independently prove a trade attempt; a resulting kill still counts as a success. The initial proximity test is straight-line 3D distance and does not yet account for walls, sightlines, weapons, or movement paths. The parsed JSON includes the active thresholds and definitions under `trade_definition`.

The five-second window determines whether a trade engagement can begin. A bullet path passing within 96 units of the original killer counts as an attempt even if the shot misses. Once established, qualifying fire or damage from either side refreshes the engagement; it expires after a two-second lull. A kill of the original killer during that uninterrupted exchange remains a trade even when the fight lasts longer than five seconds. Bullet paths use the shooter, impact, and player positions recorded in the demo. They are an approximation and can still misidentify unusually aligned players without full map collision geometry.

KAST's traded-round component uses this same qualified trade-success event. It does not maintain a separate looser trade definition.

For calibration, parsed JSON includes a `trade_opportunity_audit`. Each player receives proximity-opportunity counts at 150, 200, 250, 300, 400, and 500 units, their observed proximity distances, and counts of opportunities proven by bullet path, damage, or kill. A match-level death trace records every candidate, trigger, attempt, and success. This audit does not change which opportunities appear on the scoreboard; it exists to tune the model against reference data without repeatedly guessing thresholds.

The displayed preview rating uses the commonly published HLTV Rating 2.0 approximation:

```
Impact = 2.13 × KPR + 0.42 × APR − 0.41
Rating = 0.0073 × KAST + 0.3591 × KPR − 0.5329 × DPR
       + 0.2372 × Impact + 0.0032 × ADR + 0.1587
```

It is not CSStats’ proprietary rating and should be treated as an experimental comparison metric. Parsing support can lag behind Counter-Strike demo format changes.

If a demo contains no recognizable completed rounds, the app offers a small diagnostics JSON download. It contains parser, packet, and event counts—not demo contents or player names.

## CSStats workflow

1. Save every relevant CSStats profile page using the same filters and date range.
2. Choose all saved files in **CSStats Files**.
3. Use **Group Matrix** for all-to-all teammate impact or **Combinations** for lineup conditions.
4. Export the matrix or qualifying matches as CSV.

Classifications use:

```
Impact score = 0.80 × win-rate delta + 0.20 × rating delta
```

ADR and K/D are displayed but do not affect the Lifter/Dragger classification.

## Files

- `index.html` — interface markup
- `styles.css` — presentation
- `js/config.js` — comparison weights and thresholds
- `js/chart.js` — group scatterplot
- `js/combinations.js` — include/exclude analysis
- `js/app.js` — CSStats parsing, matrix analysis, and interface behavior
- `js/demo.js` — demo upload, worker control, and scoreboard rendering
- `js/demo-worker.js` — local CS2 demo parsing and aggregation
- `THIRD_PARTY_NOTICES.md` — parser dependency attribution
