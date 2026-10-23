import './metric-picker.jsx';
import './navigation.jsx';
import './profile.jsx';
import './player-selection.jsx';
import './player-search.jsx';
import './segmented-filter.jsx';
import './match-list.jsx';
import './tag-filter.jsx';
import './date-filter.jsx';
import './map-filter.jsx';
import { useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import SessionPage from './pages/SessionPage.jsx';
import useComparison from './hooks/useComparison.js';
import ComparisonPage from './pages/ComparisonPage.jsx';
import { createComparisonStore } from './comparison-store.mjs';

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

function ComparisonRoot({ store, ...page }) {
  const { input, resetKey } = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const model = useComparison(input, resetKey);
  return <ComparisonPage {...page} model={model} />;
}

// Controllers retain their filters/calculations; React owns each comparison subtree.
window.NickStatsComparisonUI = {
  create({ prefix, title, description, mapsLabel }) {
    const store = createComparisonStore();
    const root = createRoot(document.getElementById(`${prefix}QuickApp`));
    root.render(<ComparisonRoot store={store} prefix={prefix} title={title} description={description} mapsLabel={mapsLabel} />);
    return {
      render(input) { store.update({ input }); },
      reset() { store.update({ input: null, resetKey: store.getSnapshot().resetKey + 1 }); },
      destroy() { root.unmount(); }
    };
  }
};
