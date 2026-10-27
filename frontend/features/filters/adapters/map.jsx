import { createRoot } from 'react-dom/client';
import MapFilter from '../MapFilter.jsx';
import { createMapFilterStore } from '../state/map-filter.mjs';

window.NickStatsMapFilterUI = {
  create(targets, options) {
    const store = createMapFilterStore(options);
    const nodes = (Array.isArray(targets) ? targets : [targets])
      .map(target => typeof target === 'string' ? document.getElementById(target) : target).filter(Boolean);
    const roots = nodes.map(node => {
      const root = createRoot(node);
      root.render(<MapFilter store={store} />);
      return root;
    });
    return Object.assign(store, { destroy() { roots.forEach(root => root.unmount()); } });
  }
};
