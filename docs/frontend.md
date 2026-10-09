# Editing the NickStats interface

The frontend is moving to React a screen at a time. Session is the first React page. The rest of the site still uses the existing JavaScript controllers. The API and demo parser work as before.

## Where to edit

| What you want to change | File |
| --- | --- |
| Session title, loading/error messages, map tabs, page layout | `frontend/pages/SessionPage.jsx` |
| Sections and value-mode buttons | `frontend/components/ComparisonControls.jsx` |
| Scoreboard table markup, group headings, cell layout | `frontend/components/Scoreboard.jsx` |
| Sort buttons | `frontend/components/SortHeading.jsx` |
| Colors, spacing, typography | `styles.css` |
| Which statistics appear and how values are formatted | `js/quick-comparison.js` |
| Session data fetching and URL/tab behavior | `js/sessions.js` |
| Aggregation and stat formulas | `js/players.js`, `js/stat-availability.js`, `js/scoreboard.js` |

React components are functions returning JSX. For a copy or layout edit, start in the returned markup. `{model.meta}` displays a value; `hidden={condition}` connects an attribute to data; `onClick={handler}` connects a button to an action; `.map()` repeats markup. Classes use `className` and the existing stylesheet.

For example, changing `<h2>Session</h2>` in SessionPage changes the visible title without changing routing or data loading. Changes to Scoreboard affect the React session table; player/group quick comparisons will adopt it in a later migration step.

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

## How the first migration works

`frontend/main.jsx` mounts SessionPage inside `#sessionApp` and exposes a small adapter for the existing session controller. React owns that subtree, including loading/error states. `frontend/session-store.mjs` bridges the controller to React with immutable snapshots and `useSyncExternalStore`. The controller supplies data and calls `loading`, `error`, or `render`; it never edits React's elements directly.

The shared comparison controller has an `onUpdate` mode that produces a table model and actions instead of constructing DOM. This retains existing sorting, rate denominators, schema coverage, formatting, and section preferences. Scoreboard renders that model as React components. Other comparisons continue using the legacy renderer during this stage. Existing routes and internal tabs remain intact.

Next steps: extract the comparison/stat model into normal importable modules, adopt these components in player/group comparisons, then migrate profiles and graphs. Keep components small and keep parsing and stat formulas outside their templates.
