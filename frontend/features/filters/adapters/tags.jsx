import { createRoot } from 'react-dom/client';
import TagFilter from '../TagFilter.jsx';
import { createTagFilterStore } from '../state/tag-filter.mjs';

window.NickStatsTagFilterUI = {
  create(targets, options) {
    const api = window.NickStatsManualFilters, control = createTagFilterStore(api, options);
    const nodes = (Array.isArray(targets) ? targets : [targets]).map(target => typeof target === 'string' ? document.getElementById(target) : target).filter(Boolean);
    const updateVisibility = () => nodes.forEach(node => { node.hidden = !api.store.account; });
    const off = control.subscribe(updateVisibility); updateVisibility();
    const roots = nodes.map(node => { const root = createRoot(node); root.render(<TagFilter control={control} api={api} />); return root; });
    const destroy = control.destroy;
    control.destroy = () => { off(); roots.forEach(root => root.unmount()); destroy(); };
    return control;
  }
};
