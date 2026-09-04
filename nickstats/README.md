# CSStats Lifter / Dragger Analyzer

A fully offline browser app for comparing saved CSStats profile pages.

## Run it

1. Extract this project folder.
2. Double-click `index.html` to open it in Safari, Chrome, or Firefox.
3. Choose two or more saved CSStats profile exports.
4. Switch between **Group Matrix** and **Combinations** after building the analysis. A two-player combination replaces the former 1-on-1 mode.

No server, package installation, build command, or internet connection is required.

## Project structure

- `index.html` — page structure and accessible interface markup.
- `styles.css` — all layout, colors, tables, tabs, and chart styling.
- `js/config.js` — scoring weights, thresholds, filter definitions, and shrinkage settings.
- `js/chart.js` — scatterplot rendering and quadrant labels.
- `js/combinations.js` — include/exclude lineup filtering, combination summaries, match tables, and CSV export.
- `js/app.js` — file loading, CSStats parsing, pair analysis, UI rendering, downloads, and event handling.

## Combination rules

Each loaded player can be set to **Include**, **Exclude**, or **Ignore**. A match qualifies only when every Included player appears in the match and no Excluded player appears. Choose at least one Included player; Included plus Excluded players cannot total more than five.

The Included players define a fixed baseline. For every Included player, the performance table compares matches where every Included player is together and all Excluded players are absent against matches where every Included player is together and at least one Excluded player is present. It never substitutes unrelated matches from an individual player’s full history.

Within each player’s two comparison rows, better performance values are green and worse values are red. Average deaths is scored in reverse, so fewer deaths is better. Equal values and comparisons without matches remain neutral.

Because the tool is intended for teammates, match count, record, and win rate are treated as shared lineup outcomes and use the first Included player’s result as the common team perspective. K/D, kills, deaths, assists, headshots, ADR, and rating remain player-specific.

To recreate the old one-on-one view for Player A versus Player B, **Include Player A** and **Exclude Player B**. To analyze Players A and B together with and without Player C, Include A and B and Exclude C.

## Scoring configuration

The current impact score uses:

- 80% win-rate delta
- 20% rating delta
- no ADR or K/D contribution

Edit `js/config.js` to change weights, metric scales, shrinkage, or Lifter/Dragger thresholds.

## Data model

For each directional pair, the app compares the measured player’s matches with the other player against the measured player’s matches without them. Small samples are shrunk toward Exister. The results are associations, not proof of causation.
