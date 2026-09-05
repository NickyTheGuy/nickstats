# NickStats

A static, browser-only Counter-Strike stats analyzer. It currently supports two data sources:

- **CSStats Files** — compare saved CSStats profile exports in a group matrix or include/exclude lineup conditions.
- **Demo Parser (experimental)** — select one CS2 `.dem` or `.dem.gz` and build a local match scoreboard.

The selected HTML and demo files are processed in the browser. NickStats does not upload them or require a server.

Demo statistics use the roster present when each round goes live as the denominator, so transient pre-freeze spawns do not count. Bots that enter live play remain separate, visibly labeled rows and are identified in JSON so future aggregate analysis can exclude them by default.

Parsed results include a FACEIT match ID extracted from an original FACEIT filename when available, plus a SHA-256 fingerprint of the uncompressed demo. `match_uid` prefers the provider ID and falls back to the fingerprint, while `demo_sha256` can always be used for exact duplicate detection.

## Run it

Open the published GitHub Pages site, or clone/download the repository and serve the folder with any static web server. The CSStats file analyzer also works when `index.html` is opened directly. The demo parser is intended for the HTTPS GitHub Pages version because its parser library is loaded from a pinned CDN URL.

## Demo prototype

The Demo Parser tab uses [`@deademx/cs2` 4.0.0](https://github.com/Igor-Losev/deadem/tree/v4.0.0/packages/cs2) in a Web Worker. It reads kills, deaths, assists, headshots, damage, trade kills and deaths, trade opportunities and attempts, damage- and flash-assisted kills, enemies flashed, flash assists, HE and fire grenade damage, openings, exact 1K–5K rounds, 1v1–1v5 clutch wins, team assignments, the map, and round winners from the demo event stream. It also tracks mirrored kill context: kills against blinded enemies and deaths while blind, wallbang and through-smoke kills/deaths, airborne kills and deaths to airborne killers, and average horizontal killer speed. Speed uses the pawn's networked velocity when present and otherwise derives it from horizontal position changes between demo packets. The scoreboard displays speed as a percentage of the held weapon's maximum movement speed, including scoped limits; values may exceed 100% after boosts or air movement. Grenade, lingering-fire, C4, and world kills are excluded because the killing weapon need not still be held. Raw units-per-second values remain in the JSON export. The JSON also records kills made while the attacker was blind and deaths to a blind attacker.

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
