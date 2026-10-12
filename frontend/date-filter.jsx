import { createRoot } from 'react-dom/client';
import DateRangeFilter from './filters/DateRangeFilter.jsx';
import { DateRangeStore } from './state/date-range.mjs';

window.NickStatsDateFilterUI = {
  setEarliest(timestamp) { DateRangeStore.setEarliest(timestamp); },
  create(targets, options) {
    const store = new DateRangeStore(options);
    const nodes = (Array.isArray(targets) ? targets : [targets]).map(target => typeof target === 'string' ? document.getElementById(target) : target).filter(Boolean);
    const roots = nodes.map((node, target) => {
      const root = createRoot(node); root.render(<DateRangeFilter store={store} target={target} />); return root;
    });
    const destroy = store.destroy.bind(store);
    store.destroy = () => { roots.forEach(root => root.unmount()); destroy(); };
    return store;
  }
};
