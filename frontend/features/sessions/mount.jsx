import { useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import useComparison from '../comparisons/hooks/useComparison.js';
import { createComparisonStore } from '../comparisons/state/store.mjs';
import SessionPage from './SessionPage.jsx';

function SessionRoot({ store, onRetry }) {
  const { status, input, resetKey } = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const model = useComparison(input, resetKey);
  return <SessionPage status={status} model={model} onRetry={onRetry} />;
}

// React owns #sessionApp. The existing routing/data controller only supplies data.
window.NickStatsSessionUI = {
  create({ onRetry }) {
    const store = createComparisonStore();
    const root = createRoot(document.getElementById('sessionApp'));
    root.render(<SessionRoot store={store} onRetry={onRetry} />);
    return {
      loading() { store.update({ status: { loading: true, error: '', ready: false }, input: null }); },
      error(message) { store.update({ status: { loading: false, error: message, ready: false } }); },
      render(input) {
        store.update({ input, status: { loading: false, error: '', ready: true } });
      }
    };
  }
};
