# Editing the NickStats interface

The interface now uses React throughout: navigation, account and upload forms, profile layouts and statistics, graphs, comparisons, Sessions, filters and match lists. Small components such as Button, TextField, TabList, Pagination, StatSection and the shared tables are reused across screens. The static HTML supplies page containers and mount points. Existing JavaScript controllers retain routing, fetching, filtering, statistical calculations, compression and parser workers; they publish data to React rather than building UI nodes.

## Where to edit

| What you want to change | File |
| --- | --- |
| Shared profile and graph layouts | `frontend/profile-layout.jsx`, `frontend/components/StatSection.jsx` |
| Page controls, status messages, pagination and tabs | `frontend/shell.jsx`, `frontend/state/shell-elements.mjs`, `frontend/components/Pagination.jsx` |
| Match summary banner | `frontend/matches/MatchBanner.jsx` |
| Login/account settings and API actions | `frontend/account/`, `frontend/state/account-api.mjs` |
| Upload selection, queue and actions | `frontend/upload/`, `frontend/state/upload.mjs` |
| Session title, loading/error messages, page layout | `frontend/pages/SessionPage.jsx` |
| Profile cards, metric lists and count strips | `frontend/components/StatCard.jsx`, `MetricList.jsx`, `CountStrip.jsx`, `frontend/profile/StatCards.jsx` |
| Shared sortable table and sort state | `frontend/components/DataTable.jsx`, `frontend/hooks/useSortedRows.js`, `frontend/state/table-sort.mjs` |
| Profile rendering bridge | `frontend/profile.jsx` |
| Group roster, recent players and graph selection | `frontend/players/PlayerRoster.jsx`, `RecentPlayers.jsx`, `GraphPlayerChoices.jsx` |
| Player selection mounting/data bridge | `frontend/player-selection.jsx` |
| Shared SVG chart, marks and tooltip | `frontend/graphs/Chart.jsx`, `SvgMark.jsx`, `ChartTooltip.jsx` |
| Chart model, mounting and tooltip interaction | `frontend/state/chart.mjs`, `frontend/chart.jsx`, `frontend/hooks/useChartTooltip.js` |
| Graph summaries, legends, notes and empty states | `frontend/graphs/GraphSummary.jsx`, `GraphLegend.jsx`, `frontend/graph-output.jsx` |
| Shared summary card, legend key and empty state | `frontend/components/SummaryCard.jsx`, `ColorKey.jsx`, `EmptyState.jsx` |
| Graph summary model and statistics | `frontend/state/graph-output.mjs` |
| Graph view, type, display and bucket UI | `frontend/graphs/GraphSettings.jsx`, `BucketControls.jsx`, `frontend/components/OptionField.jsx`, `NumberStepper.jsx` |
| Graph settings, metric-specific drafts and constraints | `frontend/state/graph-settings.mjs`, `frontend/graph-settings.jsx` |
| Graph statistic/category selectors and autocomplete | `frontend/graphs/MetricPicker.jsx`, `frontend/components/Autocomplete.jsx` |
| Metric search, drafts and keyboard selection | `frontend/state/metric-picker.mjs`, `frontend/metric-picker.jsx` |
| Player/Group search layout and result buttons | `frontend/search/PlayerSearch.jsx`, `PlayerSearchResult.jsx` |
| Shared search form and player identity | `frontend/components/SearchForm.jsx`, `PlayerIdentity.jsx` |
| Search requests, debounce and cancellation | `frontend/state/player-search.mjs` |
| Player/Group comparison headings | `frontend/pages/ComparisonPage.jsx` |
| Shared map tabs and empty states | `frontend/components/ComparisonBody.jsx` |
| Segmented filters and shared choices | `frontend/filters/SegmentedFilter.jsx`, `frontend/state/segmented-config.mjs` |
| Segmented selection and disabled state | `frontend/state/segmented-filter.mjs` |
| Shared buttons, toggles, option groups | `frontend/components/Button.jsx`, `ToggleButton.jsx`, `ToggleGroup.jsx` |
| Detail/analysis tabs and shared section choices | `frontend/navigation/SectionTabs.jsx`, `frontend/state/section-tabs.mjs`, `frontend/section-tabs.jsx` |
| Tab selection, closing and keyboard navigation | `frontend/components/TabList.jsx`, `CloseButton.jsx` |
| Player/Group workspace tabs and Session peers | `frontend/navigation/WorkspaceTabs.jsx`, `frontend/navigation.jsx` |
| Comparison UI state and actions | `frontend/hooks/useComparison.js`, `frontend/state/comparison.mjs` |
| Match tag editing and numeric-value drafts | `frontend/tags/MatchTagEditor.jsx`, `frontend/components/TagValueForm.jsx` |
| Match lists and grouped Session history | `frontend/matches/MatchList.jsx`, `MatchCard.jsx`, `SessionHistory.jsx` |
| Shared map artwork and rating/K-D-A/ADR preview | `frontend/components/MapArtwork.jsx`, `StatPreview.jsx` |
| Card data formatting and scores | `frontend/state/match-card.mjs` |
| List mounting/data bridge | `frontend/match-list.jsx` |
| Shared account tag subscription | `frontend/hooks/useManualTags.js` |
| Tag filter UI, conditions, creation and sharing | `frontend/filters/TagFilter.jsx`, `frontend/components/TagCondition.jsx`, `TagCreateForm.jsx`, `TagShareMenu.jsx` |
| Tag selection and account synchronization | `frontend/state/tag-filter.mjs` |
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

For repeated edits, run `npm run dev` to watch/rebuild the bundle. Serve the repository with your usual static server and refresh the browser after a rebuild. API-backed screens require the usual same-origin `/nickstats/api` backend. Build-watch preserves the deferred data-controller load order while serving the same static folder used in production.

Frontend CI rebuilds the bundle and checks that the committed output matches the sources, then runs the JavaScript tests. When publishing a change, bump the visible build number and relevant script cache version in `index.html`.

## How the comparison migration works

`frontend/main.jsx` mounts SessionPage inside `#sessionApp` and exposes a small adapter for the existing session controller. React owns that subtree, including loading/error states. `frontend/comparison-store.mjs` publishes controller input and loading status to React with immutable snapshots and `useSyncExternalStore`. The controller supplies data and calls `loading`, `error`, or `render`; it never edits React's elements directly.

`useComparison` owns map selection, value mode, utility basis, sorting, group expansion, and subgroup cycling through a React reducer. Shared section preferences use a small external store with `useSyncExternalStore`, preserving the existing localStorage key. Each comparison retains its own map and display state. `NickStatsQuickComparison.model(input, viewState)` computes formatted stats from a copy of that state; it does not subscribe to UI events or create DOM nodes. The earlier DOM-rendering path has been removed; the same stat model is used in component tests.

`NickStatsComparisonUI.create` mounts ComparisonPage in `#playerQuickApp` or `#comboQuickApp`. The Player/Group controllers only publish filtered input and summarizers. SessionPage shares ComparisonBody and adds loading/retry UI. Button, ToggleButton, ToggleGroup and TabList handle the reusable interactions. Map tabs support Left/Right arrows, Home and End. The bundle loads before the page controllers; the comparison stat model loads before Player/Group initialize. Existing routes and internal tabs remain intact.

Further refactoring can move controller calculations into importable modules independently of the completed UI migration. Keep parsing and stat formulas outside component templates.


## Shared map filters

Match, Player, and Group mount MapFilter through `NickStatsMapFilterUI.create(targets, options)`. MapFilter subscribes to a store with synchronous `values`, `matches`, `summary`, `setOptions`, `setSelected`, and `reset` methods so existing filtering calculations see the current selection immediately. React owns the dropdown and checkboxes. An empty selection means all maps; refreshing map options prunes unavailable selections. Multiple targets can share one selection store.

Dropdown uses native details/summary markup and React state for dismissal. Escape closes it and returns focus to the trigger. An outside pointer event closes it before child events can replace filtered data; choosing an option preserves the menu and checkbox focus. Programmatic reset closes the menu. CheckboxGroup handles reusable option markup and checked states. Date, tag and metric dropdowns use these shared controls too.


## Date range filters

`NickStatsDateFilterUI.create` mounts DateRangeFilter in Match, Player, Player history, and Group. The two Player targets share a DateRangeStore, including their committed range and draft. Opening one closes the other and starts from the committed range. Calendar and OptionDropdown own reusable rendering and keyboard interactions; the store provides local-day matching, exclusive API upper bounds, the database minimum, and independent month navigation. Draft clicks do not change filtering until Apply. Clear and profile resets clear both endpoints. Closing a draft and reopening restores the applied range.

The date calendar retains the existing CSS classes and custom month menu styling. React keeps day buttons stable during selection, so clicks retain focus and do not detach targets under outside-click listeners. Escape dismisses an open month menu first, then the date menu. DateRangeStore has no DOM dependencies and is covered by local-day and calendar-boundary tests.


## Tag filter dropdowns

`NickStatsTagFilterUI.create` mounts the Player, Player history and Group controls. The Player controls share one selection store. TagFilter, TagCondition, TagCreateForm and TagShareMenu use the shared Dropdown and Button components. React keeps form drafts and focused fields stable during filtering and pending saves. Selected conditions update the existing calculations synchronously, clear when accounts change, and discard deleted or revoked tags.

`js/manual-filters.js` still owns account-scoped loading, mutations, Boolean upload defaults, numeric matching, for filters and per-match editors. The new UI calls those existing store methods. Recipients can select shared tags for filtering but see no sharing or delete controls. Capability flags, disabled/pending actions, server errors and retry behavior are preserved. Network and account-race tests cover the same store used by both renderers; both filter dropdowns and per-match editors now use React.


## Per-match tag editors

Player matches, expanded Player sessions and Group match lists include MatchTagEditor directly inside each React MatchCard. It reuses Dropdown, ToggleGroup and TagCreateForm. TagValueForm keeps a numeric draft separate from the saved value; empty input saves Unknown. It preserves text typed during a pending save and retains drafts on failures. Shared tags render read-only values, and pending controls are disabled. `useManualTags` subscribes to the existing account store's version so assignments, capabilities and errors remain consistent across controls.

MatchTagEditor is a normal child of MatchCard. Lists use stable match IDs as React keys so form drafts and focus survive data updates. React unmounts editors and subscriptions when cards leave the list. The previous per-card mounting adapter and DOM observer have been removed. Only one match tag editor opens at a time, managed by the small shared store in `frontend/state/match-editor.mjs`.

## Match lists and Session history

`NickStatsMatchList.render` publishes matches and an open callback into a React root for each persistent list container. `renderSessions` publishes grouped history into the same Player list root; `clear` empties it through React rather than replacing managed DOM. MatchCard, MapArtwork and StatPreview are reused for the Match page, Player matches, expanded Sessions and Group matches. Scores, viewer-team order, artwork normalization and accessible labels come from pure helpers in `frontend/state/match-card.mjs`. The React MatchBanner shares the same artwork and score helpers.

SessionHistory owns expand/collapse state and renders nested MatchList components. Its header opens the existing routed Session tab; Show/Hide matches expands the group independently. The Player controller still computes session boundaries, filtered summaries, records and pagination, while React owns cards and their interactions. Existing routing, API queries, filter scopes and loading/error messages are preserved.


## Segmented filters

`NickStatsSegmentedUI.create(target, { onChange })` mounts the shared SegmentedFilter/ToggleGroup at a named placeholder. `segmented-config.mjs` defines the labels, reusable choice lists, data attributes, and styles for 19 controls: side, own/enemy buy, round result, round phase, match result, lineup condition, and Player history mode. Hero descriptions and the Match page's uppercase labels remain in that configuration rather than duplicated button markup.

The store exposes a synchronous `value`, `set(value, { notify })`, and `setDisabled(values)`. User actions go through `choose`, which ignores disabled choices; programmatic synchronization can use silent `set` to avoid feedback callbacks. Reset handlers preserve the existing stat/filter state and publish their defaults to React. The Group With condition is disabled when the roster cannot support a comparison and falls back to Without. Group Clear also synchronizes its reset enemy-buy and round-result controls.

The legacy bindSegmentedToggle/bindSideToggle DOM handlers have been removed. Page controllers still own the statistical filtering calculations, while React owns rendering, selected styling, disabled buttons, and interactions. The lightweight placeholder uses display: contents so existing flex/grid toolbar layouts remain unchanged.

## Player searches

`NickStatsPlayerSearchUI.create({ prefix, onSelect, excluded, initialMessage, limit })` mounts PlayerSearch for the Player or Group page. Both use SearchForm, PlayerSearchResult, PlayerIdentity and the shared Button. The controller still opens profiles or updates the Group roster; it can reset the search or report a roster limit through the returned adapter. Group results omit players already selected.

React subscribes to an independent search store for each page. Typing debounces queries by 250 ms after two characters; submitting also supports a single-character query. Every edit, reset or new request aborts the old request and invalidates its generation, so a late response cannot restore stale results. Empty searches reset the list, loading clears old choices, and failures can be retried with the same query. Search input, status messages and result buttons are owned by React; controllers must not modify those DOM nodes.

## Player selection controls

Group roster entries, Recently Viewed buttons, and both graph player selectors render through `NickStatsPlayerSelectionUI`. Each persistent container has one React root and each player has a stable key. Selection changes update existing controls, preserving keyboard focus. Roster entries share PlayerIdentity, Button and ToggleGroup; RecentPlayers shares PlayerIdentity and Button; GraphPlayerChoices shares CheckboxGroup with Map filters.

The existing controllers retain roster Include/Exclude rules, the five-Included-player limit, saved roster and recent-player storage, profile loading, and graph series calculations. They publish plain player/selection data and callbacks to React instead of building controls. Graph selectors disable unselected players once five are checked; unchecking one makes the remaining choices available again. Filter redraws preserve the selected graph series. Recent buttons retain their visible order while saved visit recency and refreshed player details are updated.

CheckboxGroup accepts optional label classes, per-option input properties and a description ID, so graph choices can share checkbox behavior without changing Map filter appearance. PlayerIdentity supports an unwrapped layout for compact recent buttons, preserving their existing grid styling.

## Detailed profile statistics

`js/profile.js` still calculates and formats profile statistics, including compatible-round notes, clutch estimates, semantic colors and map/weapon sort values. Its rendering helpers publish those values to `NickStatsProfileUI` instead of creating DOM nodes. StatCard, MetricList and CountStrip own the repeated presentation. Both Player and Group profiles use the same components.

DataTable uses the shared SortHeading button and `useSortedRows` hook. Each mounted table owns its sort choice, so changing a filter, switching profiles, or temporarily showing no rows retains that choice. Name columns start ascending; statistic columns start descending; clicking again reverses the order. Sorting uses separate raw values to avoid comparing rounded percentages or colored display objects, and ties retain their input order. React updates keyed headings so keyboard focus survives sorting and data refreshes. Row/column scopes and aria-sort describe the current table state.

`profile-layout.jsx` renders one parameterized ProfileLayout and GraphLayout for Player and Group. StatSection supplies reusable section headings and wrappers. A synchronous initial mount makes their empty data-view containers available before the controllers attach their persistent roots. Layouts are mounted once; controllers never clone or replace populated React containers.

## Workspace navigation

Player profiles, fixed Quick comparison/Graphs tabs, and routed Sessions render together through PlayerWorkspaceTabs. The Player controller publishes profile state and callbacks with `NickStatsNavigationUI.player`; the Session controller publishes independent entries and route callbacks with `.sessions`. The bridge combines the latest snapshots in one persistent React root. Session updates therefore preserve profile tab nodes, and profile updates preserve Session nodes, without the former redraw event or direct DOM insertion. GroupWorkspaceTabs uses the same TabList and Button controls.

TabList supports disabled options, accessible per-tab metadata, optional closable wrappers and the shared CloseButton. Left/Right wrap through enabled tabs; Home/End select the first/last enabled tab. Delete closes a focused closable tab. Closing restores focus to the selected remaining tab, including after an asynchronous hash change. Fixed tabs stay first and cannot be closed; a Session-only workspace disables them until a player profile is opened. Map tabs in comparison scoreboards continue to use the same TabList without closable wrappers.

The routing and data controllers retain profile-close fallback, Session-close fallback, `#session/<player>/<match>` links, history navigation, request cancellation and caches. React owns the workspace nav elements; controllers publish data instead of replacing, appending or removing tab nodes. The inner detailed-stat and Match analysis navigation use SectionTabs, described below.

## Graph statistic pickers

Both axes in Player and Group graphs share MetricPicker, Autocomplete and OptionDropdown. The graph controller publishes metric metadata, categories, selected IDs and search drafts through `NickStatsMetricPickerUI.sync`. Picker callbacks update the graph model and redraw it. Graph settings also publish their state to that controller; the controller publishes chart geometry, summaries, legends and notes to React.

Each picker has an independent store. Empty queries show the current category; typed words search across categories, including account tag statistics. Every word must match the category/name, and results are capped at 30. Selecting a result updates its category unless All categories is selected. Category changes clear the search and return focus to the input. Arrow keys wrap through suggestions, Enter selects, Escape restores the selected name, and outside clicks or focus changes dismiss the list. Input drafts, including a deliberately blank field, survive filter redraws; changing accounts or losing a tag resets unavailable selections through the graph model. The X-axis excludes round differential.

Autocomplete owns expanded/active-descendant state and selectable suggestion buttons. OptionDropdown is shared with calendar selectors. React owns the category controls, input labels and suggestion lists; the graph controller no longer creates options, attaches picker listeners, or edits input DOM. Existing mount points and responsive flex styling preserve the two-axis layout.

## Graph settings and buckets

`NickStatsGraphSettingsUI.create(prefix, onChange)` mounts the shared GraphSettings component and returns an independent store for each Player/Group graph. View, graph type, display and bucket mode use OptionField/OptionDropdown; the automatic bucket count uses NumberStepper; BucketControls owns the range and cutoff inputs. The graph controller reads the store and redraws, without querying controls, adding listeners or assigning input values.

The store remembers graph type, display, mode and count across data/filter redraws. Range and manual cutoff drafts are keyed by their bucket statistic: Y for distributions and X for relationships. Switching statistics restores their own drafts. The count is bounded to 4–24. The existing parser validates ranges/cutoffs and reports errors back to React for aria-invalid and the explanatory note; invalid input keeps automatic graph buckets until corrected.

Round differential requires Round by round and disables the other views. Unsupported per-round statistics return to Match by match. Graph type and bucket controls hide in round view; buckets also hide for trends, while Bars/Line stays available. Configuration and validation updates notify React without recursively redrawing the graph. User actions update the store synchronously and request a redraw. OptionDropdown accepts disabled choices and skips them during keyboard navigation.

## Graph output

The graph controller prepares chart samples and sends the displayed series, metric formats, colors, mode and explanatory note to `NickStatsGraphOutputUI.render`. `graphOutputModel` calculates the summary text from those same samples: mean, median, population standard deviation, range and sample count; paired X/Y summaries and match/Session counts; or distinct numbered rounds and actual round appearances. It retains the existing formatting and never sorts the chart's input arrays in place.

GraphSummary renders shared SummaryCard and EmptyState components. GraphLegend renders ColorKey components using the same stable series colors. Player IDs key both lists, so filtering a series preserves other players' cards and colors even when names are duplicated. Empty results clear both cards and legend and use the existing match/Session/round-specific messages.

Each Player/Group prefix has one persistent React root in its summary container. Portals render the corresponding legend and explanatory/validation note, keeping all three outputs in the same render. The note mount uses display: contents to preserve spacing when the note is hidden. The chart controller prepares geometry and the missing-dates message as a chart model. React renders the SVG, summaries, legend and notes.

## SVG charts and tooltips

The graph calculations now build a chart frame containing plain marks (type, SVG attributes, text and optional tooltip metadata). `NickStatsChartModel.frame/mark` supplies the lightweight builders. Distribution, relationship, match/Session trend and round calculations retain their geometry, colors, axis labels, gap handling and tooltip text; they no longer create SVG DOM nodes or attach listeners.

`NickStatsChartUI.render(target, model)` mounts a persistent Chart root for each container. SvgMark renders the shared SVG primitives and converts SVG attribute names to React props. ChartTooltip renders the shared overlay. `useChartTooltip` owns interaction state, clears stale overlays when the chart model changes, and handles outside dismissal. Data marks support pointer hover, touch taps and keyboard focus; Enter/Space shows the tooltip and Escape dismisses it. Tooltip positioning retains the existing bounds and placement.

Match round timelines use the same renderer. `NickStatsGraphs.roundSeriesModel` prepares exact cumulative geometry; the timeline controller supplies its label and frame class or an EmptyState message. Selecting players/statistics and changing filters updates the existing root rather than replacing its DOM. Player and Group SVG IDs remain the same; their HTML placeholders are now GraphChartApp containers. The tooltip is shared by both profile graphs and exact match timelines.

## Detailed-stat and Match analysis tabs

SectionTabs reuses TabList and the existing synchronous selection store used by segmented controls. `section-tabs.mjs` defines the Player/Group section choices and Match analysis choices, labels, existing data attributes, tab IDs and panel references. `NickStatsSectionTabsUI.create(target, { kind, onChange })` mounts one root per tab bar; controllers synchronize selection with `set(value, { notify: false })` while retaining panel visibility and lazy data loading.

All detailed-stat panels now have stable IDs, tabpanel roles and aria-labelledby references. The shared React layout derives those references from its Player/Group prefix. Match analysis retains its existing tab/panel IDs. Left/Right, Home/End and wrapping use the same behavior as workspace and comparison map tabs. Only the selected tab is in the Tab sequence, and keyed buttons preserve focus across state changes.

Player profiles continue sharing one detailed-stat choice across open players. Group profiles share a separate choice. The Matches section still loads standalone history on demand; Match analysis still renders the requested detail when opened and resets to Scoreboard for a newly opened match. Controllers no longer attach tab click listeners or change active/tabindex/aria-selected attributes directly.

Match timeline controls use `matches/TimelineControls.jsx`, shared `OptionField` dropdowns and `CheckboxGroup`. The match controller retains metric, display and selected-player state and publishes props through `NickStatsTimelineControlsUI`; keyed checkboxes preserve focus when selections change. Player selection is retained while viewing team round differential and resets to the linked player (or first available player) for a different match.

Match Duels and Trade responses use the shared `components/MatrixTable.jsx`. `state/match-matrix.mjs` maps filtered teams into row/column labels, tooltips and colored cells. Missing duels stay unavailable; missing teammate trade responses stay zero; self/opponent trade cells stay unavailable. Persistent React roots preserve the existing table containers and scrolling while filters change.

Match weapon breakdowns use `matches/WeaponBreakdown.jsx`, the shared `Disclosure` and sortable `DataTable`. `state/weapon-breakdown.mjs` formats labels and rates while retaining raw sort values. Each keyed player retains independent expansion and sorting through filters and section switches; loading another stored match resets both. Weapon headings toggle between their default sort direction and original event order using the table’s optional `toggleOff` mode. Empty tables retain their headings and show an empty message.

The Match scoreboard now supplies a plain view model to the same React `Scoreboard` and `ComparisonControls` used by comparisons and Sessions. `ScoreboardTable` renders both team tables with shared measured column widths and synchronized scrolling. The match controller retains all stat formatting, filtered calculations and multi-mode sort rules; React owns the buttons, headers, rows and focus. Group expansion, R subgroup cycling and scroll anchoring use the shared scoreboard implementation. Match defaults and Totals/Per round choices remain distinct from comparison settings.

Account login and settings now render through `account.jsx`, `account/LoginForm`, `AccountSettings` and `PasswordForm`. Shared `Modal`, `TextField`, `FormMessage`, `Button` and `useAsyncAction` own focus, inputs, validation, pending states and errors. Account linking uses the existing cancellable player-search store. `state/account-api.mjs` sends cookie-authenticated API requests; passwords stay in the form and are discarded on close. The match controller still applies sessions, dispatches account events and resumes pending parsing/uploads after login. No registration form is introduced.

The upload/parser interface uses `upload/UploadPanel`, `UploadActions` and `BatchQueue`, backed by the subscribable `state/upload.mjs` display store. Shared `FileDropZone`, `ProgressBar`, `FormMessage`, `Disclosure` and buttons render selection, queue progress and diagnostics. `upload.jsx` also owns the JSON download actions through portals. File reads, compression, parser workers, duplicate handling, sequential uploads and wake locks remain in the controller. Parsing and saving lock file selection and Clear to keep in-flight results tied to the chosen files; login continuation and retry/replacement still use the existing controller paths.

## App shell and UI ownership

`js/navigation.js` retains route selection and page visibility, publishing the active page to the shared TabList. The Match list/detail tabs use the same keyboard navigation. `shell.jsx` mounts persistent Button, text, warning and Pagination views using immutable snapshots; `state/shell-elements.mjs` contains their initial labels and presentation. Match, Player history and Group history reuse Pagination. Controllers publish status, disabled and pagination values through the returned adapters.

`MatchBanner` uses the unfiltered match and account representative to order teams, preserving artwork, score colors, dates and full match-ID tooltips. UI controllers no longer create elements or assign textContent. The remaining temporary anchors in the download helpers invoke browser file downloads. Layout visibility and scroll measurements remain in routing/controllers or React layout effects. The unused native-select dropdown adapter and DOM scoreboard renderers have been removed.
