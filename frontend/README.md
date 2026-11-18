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

### 2D analyzer

`#analyzer` is an independent React screen. Open `.dem` / `.dem.zst` locally,
or import an exported `.replay.json`. No login/backend is needed; file contents
are not uploaded. The same pinned parser/Zstandard CDNs are used as normal demo
parsing. Replay data lives in memory until the page reloads; per-file save/remove controls
are intentionally absent from the selection panel. Reopening a match replaces its existing replay, so
old captures can be upgraded without removing them first.

The map workspace resizes from its bottom-right corner. All levels are visible
at once; Auto switches between columns and rows with available width. Layout is always automatic. The divider changes the two levels' share
of that one viewer, using pointer drag or arrow keys (Home/End: 10/90%; Enter or
double-click: 50/50). Each map retains its own zoom/pan. This manual split avoids
guessing how much of Nuke's dimmed upper-map background to crop from its lower
radar; no map calibration or image cropping is changed.
Players/rounds/utility controls expand over the map and scroll vertically.
Playback is an overlay pinned inside the visible part of the viewer while the
page scrolls. Zoom controls sit at the top of each map. Its speed menu opens
upward to avoid being clipped by the viewer. All/CT/T uses the shared profile
segmented-control styling. Compact pressed-state chips replace checkboxes for
players, utility, combat and numbered rounds; the same chip style is used for
All/Regulation/Overtime/Clear and half toggles. Toggling one half adds/removes its
rounds without replacing other halves. Round numbers and sections are combined
across loaded matches (a numeric round choice affects that number in all matching
loaded matches); file names and per-file action rows do not fragment the panel.
There is no round-selection or round-count ceiling. Regulation/overtime presets
combine with Both/T/CT player-side filters; half buttons select individual
regulation or overtime halves. Side matching uses the selected players' recorded
sides, not assumptions about who began T. With opposing players selected, Both
shows both. Match rules come from `mp_maxrounds` and `mp_overtime_maxrounds`,
with 24/6 defaults for legacy captures. Overtime half groups repeat as far as the
match goes. Only completed rounds with canonical timing/position data survive.
Time starts at freeze end. Player positions target 5 Hz with interpolation and
no player trails; deaths, long gaps and teleports stop interpolation.

Capture v2 and later also request projectile and inferno entities, only in Analyzer mode.
Projectiles target up to 20 Hz and draw actual sampled flight paths with a
one-second trailing segment, including briefly after detonation. Grenade icons
are local Valve equipment silhouettes (see `assets/grenades/README.md`). Smoke
and fire replace their icon with an approximate area. Smoke expiry and
inferno expire/extinguish events provide endpoints; active fire flags catch
extinguishing even when the legacy start event is absent. Inferno ownership is
resolved through the owner pawn/controller; fire-cell positions estimate spread.
Fire-entity destruction alone can occur after flame-out, so observed burning
flags and actual expiry events take priority. Where no expiry is available,
recorded lifetime convars/defaults provide an explicitly estimated endpoint.
Areas are approximate circles, not smoke voxels or collision-tested flame
geometry. Round ends clip playback. Unknown owners appear only with every
player selected and Both sides. Saved v1 replays remain readable with estimated
utility duration but cannot gain flight/ownership data without recapturing the
original demo; the UI indicates this.

`js/replay-capture.js` is lazy-loaded only for `captureReplay:true`. Its separate
worker result never enters normal match uploads, profiles/Groups responses or
caches. The backend/schema are unchanged. Source 2 position decoding uses
512-unit cells and the 16384 bias independently of the stats-distance helper.
Profile/Groups handoff and replay persistence remain future work.

Capture v3 adds sampled eye yaw (one nullable integer per player-position sample),
short coalesced firing samples, and one exact-time event per recorded death.
Yaw comes from the pawn's `m_angEyeAngles` vector Y, using the shortest arc for
interpolation. Missing angles remain unavailable. Firearm events trigger brief
stylized muzzle/aim lines; knife/grenade events do not become gunfire. These
lines show firing direction, not bullet collision, spread or confirmed hits.
Death skull fill identifies the victim and its outline the killer. Kill text is
only in hover/focus/tap tooltips on skull hit targets, with round, event time,
weapon and headshot context. Hit targets follow letterboxing, pan, zoom and
resizing; overlapping targets combine their event details. A brief dashed link joins recorded killer/victim positions on the same
level. Skulls remain after death, including when a shorter selected round has
ended, and clear when rewinding before the event or changing selected rounds.
Side/player filtering includes kills by selected players and deaths of selected
players. World deaths and suicides retain their own labels. Combat layers can
be toggled independently. Old v1/v2 captures still load but need recapturing for
these combat fields. This is still a local replay feature; no backend table,
normal stats response or profile/Groups cache contains the new data.

Capture v4 adds compact per-player round contexts from the exact same
`playerRoundSlices` classifications used by profiles: side, win/loss, own buy,
enemy buy and hero status. Result/buy/side conditions must match one selected
player context together; they cannot mix one person's win with another person's
full buy. A round qualifies if any selected player satisfies every condition.
Filters narrow the chosen rounds without destroying the underlying manual
selection; resetting filters restores that selection. Half/preset operations
apply to currently eligible rounds. Missing buy data stays unknown and cannot
match a specific buy filter. Legacy captures can derive win/loss from their
winner/recorded side, but require recapturing for buy classifications. No new
API/database data is fetched or stored by these filters.

The `nickstats.replay` format accepts v1/v2/v3/v4. V2 adds recorded match rules,
projectile rate, per-round projectiles (`[elapsed_ms,x,y,z]`, owner, side, icon,
end), and utility end/radius/owner/side/icon/estimated fields. V3 player samples append
yaw; per-round `firing` tracks store `[time,x,y,z,yaw,side]`, and `deaths` store
the actors, sides, victim location, optional killer location, weapon and headshot.
V4 adds per-round `context` entries with player, side, result, buy, enemy_buy and
hero fields. Firing samples share the existing aggregate position-sample memory budget.
Import validates
identity, version, ordering, ownership, coordinates, lifetimes and aggregate
sample budgets. Limits remain 128 MiB replay JSON, 768 MiB demo, 64 players,
one million combined position samples per replay/two million across up to eight
open matches. These memory/file limits are independent of overtime count.

Radars/calibration are bundled under `assets/radars/`; see its README for source
and map-version caveats. Unknown maps report missing calibration. Deploy
`index.html`, `styles.css`, `js/` and `assets/` together. The React bundle is
committed; no backend rebuild or database migration is required.

To measure a real local export, without parsing a demo or contacting the server:

```sh
node tools/measure-replay-size.mjs /path/to/match.replay.json
```

It compares compact JSON with an equivalent v2 replay (same positions/utility,
without aim/firing/deaths). Gzip figures are illustrative; exports use plain JSON.
A deterministic synthetic 24-round example with ten 90-second position tracks per
round, 3,000 firing samples and 216 deaths grew from 3,118,470 to 3,669,261 bytes
(+550,791 bytes / 17.66%). This is not a measurement of a real demo and excludes
projectile/utility data that would make the shared baseline larger. Actual cost
varies with match length, surviving players and firing activity. Server replay
storage remains zero; the site does not persist these replay files. The shared
frontend gains a small amount of code, while normal API loads do not request,
build or decode replay data.
