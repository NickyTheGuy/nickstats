# Counter-Strike teammate comparison

A browser-only teammate analysis tool for CS2. It can use either saved CSStats profile pages or the official FACEIT Data API, then sends both sources through the same matrix, lineup-condition, chart, fun-fact, and CSV views.

Open the GitHub Pages site, or open `index.html` directly for the CSStats-file workflow. No build step or server is required.

## Data sources

### CSStats Files

This is the original method:

1. Sign in to CSStats normally.
2. Open each profile’s Matches tab with matching filters.
3. Save each page as HTML.
4. Select all exports in **CSStats Files** and build the matrix.

The app reads those files locally. It does not log into, scrape, or send requests to CSStats.

### FACEIT API (test version)

This method loads FACEIT-only matches directly from FACEIT’s official Data API:

1. Create a FACEIT app and a client-side API key in FACEIT App Studio.
2. Restrict the key to the GitHub Pages domain when configuring it.
3. Open the **FACEIT API** source tab.
4. Paste the key, select a date range, and enter at least two players—one nickname, Steam64 ID, or FACEIT profile URL per line.
5. Click **Load from FACEIT**.

The key is sent only to FACEIT, kept in `sessionStorage` for the current browser session, and is never stored in this repository. The app requests players sequentially rather than launching a burst of parallel requests.

The adapter uses:

- `GET /players`
- `GET /players/{player_id}/history`
- `GET /players/{player_id}/games/cs2/stats`

FACEIT match history includes the actual team rosters. The FACEIT source therefore distinguishes teammates from opponents exactly; the older CSStats-file source must infer shared matches from matching IDs.

FACEIT returns game statistics as flexible name/value fields. This test version recognizes common names for kills, deaths, assists, headshot percentage, ADR, map, score, and rating. If a match has no recognized rating field, the app shows a warning and uses `0` for that match’s rating. This is intentionally visible so the first live tests can reveal any current FACEIT field-name differences.

## Switching sources

The source tabs keep separate cached analyses in the page. You can:

1. Build the old CSStats result.
2. Switch to FACEIT and load the same players/date range.
3. Switch back and forth without reselecting the files or repeating the API calls.

The badge above the results identifies which source is currently displayed.

## Analysis modes

### Group Matrix

For each ordered player pair, the row player’s matches with the column teammate are compared with the row player’s other matches.

Impact score:

- 80% win-rate delta
- 20% rating delta
- K/D and ADR do not affect classification
- Small samples shrink toward Exister

The adjusted thresholds are:

- Lifter: at least `+0.25`
- Dragger: at most `-0.25`
- Exister: between those values

### Combinations

Each loaded player can be:

- **Included** — must be on the team
- **Excluded** — must not be on the team
- **Ignored** — does not affect the condition

Rules:

- At least one and at most five players can be Included.
- Any number of loaded players can be Excluded.
- **Without excluded** means every Included player is together and none of the Excluded players is on that team.
- **With excluded** means every Included and every Excluded player is together. This comparison appears only when that complete roster fits within five team slots.
- If five players are Included, the team is already complete and exclusions are redundant.
- Matches containing only some selected Excluded players are omitted from both comparison groups.

Match count, record, and win rate are shared team outcomes. Kills, deaths, assists, headshot percentage, ADR, K/D, and rating remain player-specific.

## Files

- `index.html` — interface markup
- `styles.css` — presentation and responsive layout
- `js/config.js` — scoring weights and thresholds
- `js/chart.js` — scatterplot rendering
- `js/combinations.js` — lineup condition logic and CSV export
- `js/app.js` — shared parsing, analysis, matrix, and source switching
- `js/faceit.js` — FACEIT API client and response normalization

## Interpretation

These results describe association, not causation. Rank differences, opponent strength, maps, overlapping parties, role, and sample size can all influence the numbers.
