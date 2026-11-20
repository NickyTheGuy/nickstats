import SelectionPage from './SelectionPage.jsx';
import { useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import useComparison from '../comparisons/hooks/useComparison.js';
import { createComparisonStore } from '../comparisons/state/store.mjs';
import SessionPage from './SessionPage.jsx';

function SessionRoot({ store, onRetry }) {
  const { status, input, resetKey, selection } = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const model = useComparison(input, resetKey);
  if(selection)return <SelectionPage key={selection.id} context={selection} />;
  return <SessionPage status={status} model={model} onRetry={onRetry} />;
}

// React owns #sessionApp. The existing routing/data controller only supplies data.
window.NickStatsSessionUI = {
  create({ onRetry }) {
    const store = createComparisonStore();
    const root = createRoot(document.getElementById('sessionApp'));
    root.render(<SessionRoot store={store} onRetry={onRetry} />);
    return {
      selection(selection) { store.update({selection,input:null}); },
      loading() { store.update({ selection:null, status: { loading: true, error: '', ready: false }, input: null }); },
      error(message) { store.update({selection:null, status: { loading: false, error: message, ready: false } }); },
      render(input) {
        store.update({selection:null, input, status: { loading: false, error: '', ready: true } });
      }
    };
  }
};
