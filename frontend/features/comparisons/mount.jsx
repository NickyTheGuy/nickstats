import { useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import useComparison from './hooks/useComparison.js';
import { createComparisonStore } from './state/store.mjs';
import ComparisonPage from './ComparisonPage.jsx';

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
