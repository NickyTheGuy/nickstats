import { useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import SessionPage from './pages/SessionPage.jsx';
import { createSessionStore } from './session-store.mjs';

function SessionRoot({ store, onRetry }) {
  const { status, model } = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return <SessionPage status={status} model={model} onRetry={onRetry} />;
}

// React owns #sessionApp. The existing routing/data controller only supplies data.
window.NickStatsSessionUI = {
  create({ onRetry }) {
    const store = createSessionStore();
    const comparison = window.NickStatsQuickComparison.create({
      prefix: 'session', onUpdate: model => store.update({ model })
    });
    const root = createRoot(document.getElementById('sessionApp'));
    root.render(<SessionRoot store={store} onRetry={onRetry} />);
    return {
      loading() { store.update({ status: { loading: true, error: '', ready: false }, model: null }); },
      error(message) { store.update({ status: { loading: false, error: message, ready: false } }); },
      render(input) {
        comparison.render(input);
        store.update({ status: { loading: false, error: '', ready: true } });
      }
    };
  }
};
