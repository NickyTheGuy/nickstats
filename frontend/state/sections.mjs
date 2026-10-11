import { defaultSections } from './comparison.mjs';
const storageKey = 'nickstats.quickComparisonSections.v2';

// Section preferences are shared; map, sorting and display state belong to each view.
export function createSectionPreferences(keys, storage) {
  const valid = new Set(keys), listeners = new Set();
  let snapshot;
  try {
    const saved = JSON.parse(storage?.getItem(storageKey) || 'null');
    snapshot = Array.isArray(saved) ? saved.filter(key => valid.has(key)) : [...defaultSections];
  } catch { snapshot = [...defaultSections]; }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    set(values) {
      snapshot = [...new Set(values)].filter(key => valid.has(key));
      try { storage?.setItem(storageKey, JSON.stringify(snapshot)); } catch {}
      listeners.forEach(listener => listener());
    }
  };
}
