import { createRoot } from 'react-dom/client';
import GraphSettings from './graphs/GraphSettings.jsx';
import { createGraphSettings } from './state/graph-settings.mjs';

window.NickStatsGraphSettingsUI = Object.freeze({
  create(prefix, onChange) {
    const store = createGraphSettings(onChange);
    const root = createRoot(document.getElementById(`${prefix}GraphSettingsApp`));
    root.render(<GraphSettings store={store} prefix={prefix} />);
    return store;
  }
});
