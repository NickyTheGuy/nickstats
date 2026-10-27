import { useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import MatchList from '../MatchList.jsx';
import SessionHistory from '../SessionHistory.jsx';
import { artworkFor, matchScore, teamResult, formatMatchTime } from '../state/match-card.mjs';

const roots = new WeakMap();
function ListRoot({ store }) {
  const view = useSyncExternalStore(store.subscribe, store.getSnapshot);
  if (!view) return null;
  return view.kind === 'sessions' ? <SessionHistory key={view.scope} {...view} /> : <MatchList key={view.scope} {...view} />;
}
function update(target, view) {
  if (!roots.has(target)) {
    let snapshot = null;
    const listeners = new Set();
    const store = { getSnapshot: () => snapshot, subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
      update(next) { snapshot = next; listeners.forEach(listener => listener()); } };
    const root = createRoot(target); root.render(<ListRoot store={store} />);
    roots.set(target, { root, store });
  }
  roots.get(target).store.update(view);
}
window.NickStatsMatchList = Object.freeze({
  render(target, matches, onOpen, options = {}) { update(target, { kind: 'matches', matches, onOpen, scope: target.id, ...options }); },
  renderSessions(target, sessions, onOpen, options) { update(target, { kind: 'sessions', sessions, onOpen, ...options }); },
  clear(target) { if (roots.has(target)) roots.get(target).store.update(null); },
  artworkFor, matchScore, teamResult, formatMatchTime
});
