import { createRoot } from 'react-dom/client';
import SectionTabs from '../SectionTabs.jsx';
import { sectionTabs } from '../state/section-tabs.mjs';
import { createSegmentedFilter } from '../../filters/state/segmented-filter.mjs';

window.NickStatsSectionTabsUI = Object.freeze({
  create(target, { kind, onChange }) {
    const config = sectionTabs(kind);
    const store = createSegmentedFilter({ options: config.options, initial: config.options[0][0], onChange });
    const root = createRoot(document.getElementById(target));
    root.render(<SectionTabs store={store} config={config} />);
    return store;
  }
});
