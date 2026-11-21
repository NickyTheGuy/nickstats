import { createRoot } from 'react-dom/client';
import GroupBuilder from './GroupBuilder.jsx';
import * as rules from './state/rules.mjs';
import { normalizeEditorRules } from './state/editing.mjs';

const roots = new WeakMap();
window.NickStatsGroupRules = Object.freeze({ ...rules, normalizeEditorRules });
window.NickStatsGroupUI = Object.freeze({
  render(target, props) {
    if (!roots.has(target)) roots.set(target, createRoot(target));
    roots.get(target).render(<GroupBuilder {...props} />);
  },
});
