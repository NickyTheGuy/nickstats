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
It uses the shared button, option-field and checkbox components. Pure evaluation,
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
