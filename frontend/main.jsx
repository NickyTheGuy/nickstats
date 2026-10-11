import { useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import SessionPage from './pages/SessionPage.jsx';
import ComparisonPage from './pages/ComparisonPage.jsx';
import { createComparisonStore } from './comparison-store.mjs';

function SessionRoot({ store, onRetry }) {
  const { status, model } = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return <SessionPage status={status} model={model} onRetry={onRetry} />;
}

// React owns #sessionApp. The existing routing/data controller only supplies data.
window.NickStatsSessionUI = {
  create({ onRetry }) {
    const store = createComparisonStore();
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

function ComparisonRoot({ store, ...page }) {
  const { model } = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return <ComparisonPage {...page} model={model} />;
}

// Controllers retain their filters/calculations; React owns each comparison subtree.
window.NickStatsComparisonUI = {
  create({ prefix, title, description, mapsLabel }) {
    const store = createComparisonStore();
    const comparison = window.NickStatsQuickComparison.create({
      prefix, onUpdate: model => store.update({ model })
    });
    const root = createRoot(document.getElementById(`${prefix}QuickApp`));
    root.render(<ComparisonRoot store={store} prefix={prefix} title={title} description={description} mapsLabel={mapsLabel} />);
    return {
      render: comparison.render,
      reset() { comparison.reset(); store.update({ model: null }); },
      destroy() { comparison.destroy(); root.unmount(); }
    };
  }
};
