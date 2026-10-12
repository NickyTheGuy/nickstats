# Editing the NickStats interface

The frontend is moving to React a screen at a time. Session and the Player/Group quick comparison scoreboards now use React. Map and date filter dropdowns also use shared React components. Profiles, graphs, tag filters, and routing still use the existing JavaScript controllers. The API and demo parser work as before.

## Where to edit

| What you want to change | File |
| --- | --- |
| Session title, loading/error messages, page layout | `frontend/pages/SessionPage.jsx` |
| Player/Group comparison headings | `frontend/pages/ComparisonPage.jsx` |
| Shared map tabs and empty states | `frontend/components/ComparisonBody.jsx` |
| Shared buttons, toggles, option groups | `frontend/components/Button.jsx`, `ToggleButton.jsx`, `ToggleGroup.jsx` |
| Tab selection and keyboard navigation | `frontend/components/TabList.jsx` |
| Comparison UI state and actions | `frontend/hooks/useComparison.js`, `frontend/state/comparison.mjs` |
| Date filter UI and reusable calendars | `frontend/filters/DateRangeFilter.jsx`, `frontend/components/Calendar.jsx` |
| Month selector and option dropdowns | `frontend/components/OptionDropdown.jsx` |
| Date bounds, draft range and month navigation | `frontend/state/date-range.mjs` |
| Map filter UI | `frontend/filters/MapFilter.jsx` |
| Dropdown dismissal and checkbox options | `frontend/components/Dropdown.jsx`, `CheckboxGroup.jsx` |
| Map selection and matching | `frontend/state/map-filter.mjs` |
| Persisted section preferences | `frontend/state/sections.mjs` |
| Sections and value-mode buttons | `frontend/components/ComparisonControls.jsx` |
| Scoreboard table markup, group headings, cell layout | `frontend/components/Scoreboard.jsx` |
| Sort buttons | `frontend/components/SortHeading.jsx` |
| Colors, spacing, typography | `styles.css` |
| Which statistics appear and how values are formatted | `js/quick-comparison.js` |
| Session data fetching and URL/tab behavior | `js/sessions.js` |
| Aggregation and stat formulas | `js/players.js`, `js/stat-availability.js`, `js/scoreboard.js` |

React components are functions returning JSX. For a copy or layout edit, start in the returned markup. `{model.meta}` displays a value; `hidden={condition}` connects an attribute to data; `onClick={handler}` connects a button to an action; `.map()` repeats markup. Classes use `className` and the existing stylesheet.

For example, changing `<h2>Session</h2>` in SessionPage changes the visible title without changing routing or data loading. Changes to Scoreboard, ComparisonControls, and ComparisonBody affect Session and both quick comparison pages.

## Build and verify

Use a current Node release compatible with Vite (Node 22.12+ or Node 24 works):

```sh
npm ci
npm run build
npm test
```

Commit the component sources and rebuilt `assets/ui/nickstats-ui.js` together. The bundle contains React and the compiled components, so the existing static host can continue serving the repository folder without Node or a CDN React dependency. `vite.config.mjs` builds only this bundle and does not touch parser assets.

For repeated edits, run `npm run dev` to watch/rebuild the bundle. Serve the repository with your usual static server and refresh the browser after a rebuild. API-backed screens require the usual same-origin `/nickstats/api` backend. This transitional workflow uses build-watch rather than Vite's HTML dev server so legacy deferred scripts keep their load order.

Frontend CI rebuilds the bundle and checks that the committed output matches the sources, then runs the JavaScript tests. When publishing a change, bump the visible build number and relevant script cache version in `index.html`.

## How the comparison migration works

`frontend/main.jsx` mounts SessionPage inside `#sessionApp` and exposes a small adapter for the existing session controller. React owns that subtree, including loading/error states. `frontend/comparison-store.mjs` publishes controller input and loading status to React with immutable snapshots and `useSyncExternalStore`. The controller supplies data and calls `loading`, `error`, or `render`; it never edits React's elements directly.

`useComparison` owns map selection, value mode, utility basis, sorting, group expansion, and subgroup cycling through a React reducer. Shared section preferences use a small external store with `useSyncExternalStore`, preserving the existing localStorage key. Each comparison retains its own map and display state. `NickStatsQuickComparison.model(input, viewState)` computes formatted stats from a copy of that state; it does not subscribe to UI events or create DOM nodes. The earlier imperative renderer remains available for compatibility tests while stat calculations are extracted into modules.

`NickStatsComparisonUI.create` mounts ComparisonPage in `#playerQuickApp` or `#comboQuickApp`. The Player/Group controllers only publish filtered input and summarizers. SessionPage shares ComparisonBody and adds loading/retry UI. Button, ToggleButton, ToggleGroup and TabList handle the reusable interactions. Map tabs support Left/Right arrows, Home and End. The bundle loads before the page controllers; the comparison stat model loads before Player/Group initialize. Existing routes and internal tabs remain intact.

Next steps: extract the comparison/stat model into normal importable modules, then migrate profiles and graphs. Keep components small and keep parsing and stat formulas outside their templates.


## Shared map filters

Match, Player, and Group mount MapFilter through `NickStatsMapFilterUI.create(targets, options)`. MapFilter subscribes to a store with synchronous `values`, `matches`, `summary`, `setOptions`, `setSelected`, and `reset` methods so existing filtering calculations see the current selection immediately. React owns the dropdown and checkboxes. An empty selection means all maps; refreshing map options prunes unavailable selections. Multiple targets can share one selection store.

Dropdown uses native details/summary markup and React state for dismissal. Escape closes it and returns focus to the trigger. An outside pointer event closes it before child events can replace filtered data; choosing an option preserves the menu and checkbox focus. Programmatic reset closes the menu. CheckboxGroup handles reusable option markup and checked states. The date filter also uses Dropdown; tag filters can adopt these components in subsequent migration steps.


## Date range filters

`NickStatsDateFilterUI.create` mounts DateRangeFilter in Match, Player, Player history, and Group. The two Player targets share a DateRangeStore, including their committed range and draft. Opening one closes the other and starts from the committed range. Calendar and OptionDropdown own reusable rendering and keyboard interactions; the store provides local-day matching, exclusive API upper bounds, the database minimum, and independent month navigation. Draft clicks do not change filtering until Apply. Clear and profile resets clear both endpoints. Closing a draft and reopening restores the applied range.

The date calendar retains the existing CSS classes and custom month menu styling. React keeps day buttons stable during selection, so clicks retain focus and do not detach targets under outside-click listeners. Escape dismisses an open month menu first, then the date menu. DateRangeStore has no DOM dependencies and is covered by local-day and calendar-boundary tests.
