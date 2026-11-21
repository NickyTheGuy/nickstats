# Styles

Edit these source files, then run `npm run build` from the repository root.
Vite combines `index.css` into the committed `assets/ui/nickstats-ui.css` bundle.
The site loads that one built file; it does not make a request per source module.
The root `styles.css` is a small compatibility entry for older static hosts.

## Find the right file

| Change | Source |
| --- | --- |
| Palette and design tokens | `base/theme.css` |
| Page shell and basic surfaces | `base/page.css` |
| Filter labels and field spacing | `components/filter-fields.css` |
| Segmented toggles, including profile side/result/phase/opening conditions | `components/segmented-controls.css` |
| Basic buttons and interaction states | `components/buttons.css` |
| Button alignment, icons, readouts and dropdown triggers | `components/buttons-dropdowns.css` |
| Dual-handle sliders | `components/range-slider.css` |
| Date, map, tag and economy filter layouts | `filters/` |
| Profile workspace, cards, tables and history | `profiles/` |
| Shared scoreboard tables and controls | `scoreboards/` |
| Match summaries and match library | `matches/` |
| Group summaries and the condition editor | `groups/` |
| Player search | `players/` |
| Charts and graph controls | `graphs/` |
| Analyzer map, overlays, controls and selection | `analyzer/` |
| Navigation, account and upload queue | `app/` |
| Cross-page small-screen layouts | `base/responsive.css` |

## Reuse before adding a rule

- `filter-field` owns the label and vertical spacing. React code uses the shared
  `FilterField` component; static mount-point wrappers use the same class.
- `segmented-control` owns the appearance of mutually exclusive compact choices.
  Use `ToggleGroup` with that class. `MultiToggleGroup` uses it by default for
  compatible multiple-choice controls. Do not add another feature-specific copy
  for side, phase, result or opening conditions.
- Feature styles should describe layout or a real contextual difference. Button
  alignment belongs to `Button` / `IconButton`, not repeated feature overrides.
- The opening filter's `profiles/round-conditions.css` only controls its full-width
  toolbar slot and hidden states; its labels/buttons inherit the shared rules.

`index.css` lists imports in cascade order. The initial split preserves the old
rule order, including responsive overrides. Add styles to their owning module;
do not append unrelated patches to the entry file or create a catch-all file.
Check affected desktop and narrow-screen views when moving rules across modules.

## Formatting

Run `npm run format` to format frontend JavaScript, JSX and CSS, or
`npm run format:check` to verify it. CI checks formatting before building. The
pinned Prettier configuration uses two-space indentation and a 100-character
print width, with multi-line props and expressions when they need room.
