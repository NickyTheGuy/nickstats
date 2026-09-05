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

The Demo Parser tab uses [`@deademx/cs2` 4.0.0](https://github.com/Igor-Losev/deadem/tree/v4.0.0/packages/cs2) in a Web Worker. It reads kills, deaths, assists, headshots, damage, trade kills and deaths, trade opportunities and attempts, damage- and flash-assisted kills, enemies flashed, flash assists, HE and fire grenade damage, openings, exact 1K–5K rounds, 1v1–1v5 clutch wins, team assignments, the map, and round winners from the demo event stream.

The first trade-opportunity model is intentionally simple and transparent. A living teammate receives an opportunity when they are within 750 Source 2 game units of a teammate at the moment that teammate dies. Damaging the killer within five seconds is an attempt; killing that player within five seconds is a success. A death is “tradeable” if at least one living teammate met the proximity rule, and it is counted only once regardless of how many teammates were nearby. Its death-side attempt and success also count once even if multiple nearby teammates act. The proximity test is straight-line 3D distance and does not yet account for walls, sightlines, weapons, or movement paths. The parsed JSON includes the active thresholds and definitions under `trade_definition`.

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
