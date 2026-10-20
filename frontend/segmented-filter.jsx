import { createRoot } from 'react-dom/client';
import SegmentedFilter from './filters/SegmentedFilter.jsx';
import { createSegmentedFilter } from './state/segmented-filter.mjs';
import { segmentedFilters } from './state/segmented-config.mjs';

window.NickStatsSegmentedUI = {
  create(target, options = {}) {
    const config = segmentedFilters[target];
    if (!config) throw new Error(`Unknown segmented filter: ${target}`);
    const store = createSegmentedFilter({ ...config, ...options });
    const root = createRoot(document.getElementById(target));
    root.render(<SegmentedFilter store={store} config={config} />);
    return Object.assign(store, { destroy() { root.unmount(); } });
  }
};
