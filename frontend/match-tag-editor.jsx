import { createRoot } from 'react-dom/client';
import MatchTagEditor from './tags/MatchTagEditor.jsx';

const entries = new Map(), callbacks = new Map(), listeners = new Set();
let openKey = null;
const panels = {
  subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  getSnapshot: () => openKey,
  set(key) {
    if (key === openKey) return;
    openKey = key; listeners.forEach(listener => listener());
  }
};

// Legacy match lists rebuild their cards. Reuse each editor host to retain React
// state, then release roots when a card actually leaves the document.
new MutationObserver(() => {
  for (const [key, entry] of entries) {
    if (entry.host.isConnected) continue;
    entries.delete(key); entry.root.unmount();
    if (openKey === key) panels.set(null);
  }
}).observe(document.body, { childList: true, subtree: true });

function create(match, scope) {
  const api = window.NickStatsManualFilters;
  if (!api.store.account || !api.store.ready) return null;
  const key = `${scope}/${match.id}`;
  if (!entries.has(key)) {
    const host = document.createElement('div'); host.className = 'manual-match-editor';
    const root = createRoot(host);
    entries.set(key, { host, root });
    root.render(<MatchTagEditor api={api} matchID={match.id} editorKey={key} panels={panels} />);
  }
  return entries.get(key).host;
}

window.NickStatsMatchTagUI = {
  create,
  forList(scope) {
    if (!callbacks.has(scope)) callbacks.set(scope, match => create(match, scope));
    return callbacks.get(scope);
  }
};
