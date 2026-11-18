# Frontend source

`main.jsx` is the bundle entry point. It loads each feature's `mount.jsx`; the root does not contain screen components or mounting adapters.

## Find a feature

| Folder under `features/` | Owns |
| --- | --- |
| `account/` | Login, settings, password form and account API |
| `app/` | Page-level buttons, status text, warnings and initial element configuration |
| `comparisons/` | Quick comparison page/body, comparison state and `useComparison` |
| `filters/` | Map, date, tag and segmented filters and their state |
| `graphs/` | Chart rendering, tooltips, metric picking, settings, summaries and graph selection |
| `matches/` | Match cards/lists, banner, matrices, timeline controls, weapons and their models |
| `navigation/` | Workspace and detailed-section tabs |
| `players/` | Player search, recent players and Group roster selection |
| `profiles/` | Shared Player/Group layouts and detailed stat-card composition |
| `sessions/` | Session page and controller adapter; reuses comparison components/state |
| `tags/` | Match tag editing, tag forms and account tag subscriptions |
| `upload/` | File drop zone, upload actions, batch queue and display state |

Within a feature:

- React components live beside their feature entry point.
- `state/` contains pure models, stores, reducers or API helpers.
- `hooks/` contains hooks used specifically by that feature.
- `adapters/` contains bridges called by the existing JavaScript data controllers. Features with one bridge can put it directly in `mount.jsx`; features with several bridges load them from that entry point.
- Further subfolders describe a real group of related components, such as `players/search/`.

## Shared code

`shared/components/` groups reusable primitives by purpose: `buttons/`, `forms/`, `feedback/`, `layout/`, `navigation/`, `players/`, `stats/` and `tables/`. `shared/scoreboard/` contains the table and display controls reused by Match, comparisons and Sessions. Shared hooks live in `shared/hooks/`; shared table-sort logic lives in `shared/state/`.

Keep a component with its feature unless another feature needs it and its API is reusable. For example, the graph-specific autocomplete stays under `features/graphs/`, while generic dropdowns are under `shared/components/forms/`.

Use direct relative imports. Add a new feature entry to `main.jsx` only when it needs controller registration. Do not create another pile of loose entry files at the frontend root.

The existing `js/` controllers own routing, fetching, filtering, statistics and parsing. Adapters publish their data to React; components own the rendered UI.

See [Editing the interface](../docs/frontend.md) for component locations and build commands. From the repository root:

```sh
npm ci
npm run build
npm test
```

The generated `assets/ui/nickstats-ui.js` is committed, so running the existing site or local mock does not require building React first.

### Groups team rules

`features/groups/` owns the nested Friendly/Enemy rule editor. `GroupBuilder`
coordinates draggable player cells in `RuleGroup`/`RuleCondition`.
It uses the shared button and option controls. Pure evaluation,
bounds, migration, and team-orientation logic live in `state/rules.mjs` and are
exposed through the feature adapter for `js/groups.js`. The controller retains
history loading, filters, summaries and existing result views. Node tests cover
Boolean semantics and match qualification independently of React rendering.

The compact rule editor uses `state/editing.mjs` for immutable cell/group moves,
marquee grouping, ungrouping, cycle prevention and tree limits.
`hooks/useRuleGestures.js` owns pointer capture, drag previews, hit testing and
selection rectangles. A marquee selects the direct children of the group where the drag starts.
Proper subsets can form subgroups at any depth; selecting all children of an
existing outline cannot add a redundant wrapper. A free single player can receive
an outline once. Existing unary groups are kept
when editing, including NONE negation. Pointer selection supports multi-item drags. Keyboard shortcuts provide grouping
and movement without an on-screen action toolbar.


The simplified editor automatically shows all selected player profiles. There is
no unassigned bench or per-player presence toggle. Cells' × removes the selected
player; group × ungroups its children. The internal `none` operator is labeled
Exclude, with red outlines/cells in negated groups. `normalizeEditorRules` upgrades
legacy `exclude: true` leaves into explicit single-player Exclude outlines without
changing their Boolean meaning, prunes empty groups and returns formerly unassigned
players to Friendly. The node/depth budgets include headroom for those legacy
negation outlines. Saved per-player display preferences are no longer used.


Dragging any selected cell/group moves the full selection as one validated edit.
Selected ancestors own their descendants, so an item is never duplicated or moved
twice. A drag started on a member of a selected whole group moves that group; a
simple click can select the member alone. Grouping only combines siblings in the
same immediate parent, never silently including unselected branch members.
Ctrl/Cmd+G groups the selection; Ctrl/Cmd+Shift+G ungroups selected outlines.
Ctrl/Cmd+Shift+Left/Right moves the selection to Friendly/Enemy; Escape clears it.

### 2D analyzer — first usable slice

`#analyzer` is a separate, standalone React screen. Open `.dem` / `.dem.zst`
files locally, or import previously exported `.replay.json` files. It works on
an ordinary static host without login or a backend. The parser/optional Zstandard
library still download from the same pinned CDNs as normal demo parsing.
The file contents are not uploaded. Navigation away pauses playback; removing a
replay releases its state. Replays are held in memory until removed/reloaded;
use **Save replay** to keep a copy.

Features: 5 Hz movement capture, time scrub/playback speeds, five-second trails,
player/side/utility filters, map-level selection, zoom/pan, and up to 24 selected
rounds overlaid from up to eight local matches on the same map. Round time starts
at freeze end. Only completed rounds with canonical timing and position data are
retained. Player matching across demos uses Steam IDs; local/bot identities are
scoped to the demo fingerprint. Missing positions and long gaps are not invented;
interpolation stops at deaths, side changes and teleports. Utility markers show
detonation/start events briefly (1.5 seconds), **not** projectile trajectories,
smoke lifetimes, fire geometry or visibility. Events with no resolved owner show
only when every player is selected and side is Both.

`js/replay-capture.js` is loaded only when the worker receives
`captureReplay: true`. Replay tracks are a separate worker result and never
enter existing match uploads, stats APIs, profile/group histories or caches.
Ordinary parsing has no replay collector. Positions use Source 2's 512-unit cells
and 16384 coordinate bias independently of the legacy stats-distance helper.
The first slice deliberately does not add database tables, stored-match replay
fetching, or profile/Groups handoff; existing stats have no movement tracks.
Those require a separate replay import/storage path and capturing old demos.

Replay schema `nickstats.replay`, version 1: match identity/map/source, stable
player roster, then completed rounds with duration in milliseconds, tracks of
`[elapsed_ms, world_x, world_y, world_z, health, numeric_side]`, and utility events.
Import validates version, identity, finite coordinates, ordering and ownership.
Limits: 128 MiB JSON, 768 MiB demos, 256 rounds/64 players, one million position
samples per replay/two million across open replays. Capture fails explicitly at
limits instead of silently truncating. Real demo capture is still subject to
upstream parser support for that demo/game version.

Radar sources/calibration are pinned and bundled under `assets/radars/`; see its
README for attribution and map-version limits. Unknown maps report missing
calibration rather than drawing onto an unrelated radar. The production bundle
is committed: deploying this slice updates `index.html`, `styles.css`, `js/` and
`assets/` together, including the new collector and radars. No backend rebuild or
database migration is required.
