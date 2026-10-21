import { createRoot } from 'react-dom/client';
import PlayerRoster from './players/PlayerRoster.jsx';
import RecentPlayers from './players/RecentPlayers.jsx';
import GraphPlayerChoices from './players/GraphPlayerChoices.jsx';

// Controllers publish data. Each persistent container has one root, so keyed
// players keep their DOM nodes and keyboard focus across selection changes.
const roots = new WeakMap();
function render(target, Component, props) {
  if (!roots.has(target)) roots.set(target, createRoot(target));
  roots.get(target).render(<Component {...props} />);
}
window.NickStatsPlayerSelectionUI = Object.freeze({
  roster(target, props) { render(target, PlayerRoster, props); },
  recent(target, props) { render(target, RecentPlayers, props); },
  graphs(target, props) { render(target, GraphPlayerChoices, props); }
});
