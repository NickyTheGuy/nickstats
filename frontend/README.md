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
separates the player pool and Show stats choices from `RuleGroup`/`RuleCondition`.
It uses the shared button, option-field and checkbox components. Pure evaluation,
bounds, migration, and team-orientation logic live in `state/rules.mjs` and are
exposed through the feature adapter for `js/groups.js`. The controller retains
history loading, filters, summaries and existing result views. Node tests cover
Boolean semantics and match qualification independently of React rendering.

The compact rule editor uses `state/editing.mjs` for immutable cell/group moves,
marquee grouping, ungrouping, cycle prevention and tree limits.
`hooks/useRuleGestures.js` owns pointer capture, drag previews, hit testing and
selection rectangles. A marquee treats each existing top-level condition group as
one atom; selecting that group's cells again cannot create another wrapper. A
free single player can receive an outline once. Existing unary groups are kept
when editing, including NONE negation. The same controls expose keyboard/touch
selection plus Group selected and Move to actions.
