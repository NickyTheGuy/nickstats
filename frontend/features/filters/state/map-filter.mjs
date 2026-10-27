export const defaultMapLabel = value => String(value || 'Unknown').replace(/^de_/, '').replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase());

export function createMapFilterStore({ onChange = () => {}, formatLabel = defaultMapLabel } = {}) {
  let snapshot = { options: [], selected: [], closeKey: 0 };
  const listeners = new Set();
  const update = patch => {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach(listener => listener());
  };
  const setSelected = (values, { notify = false, close = true } = {}) => {
    const selected = [...new Set(values || [])].filter(value => snapshot.options.includes(value));
    update({ selected, closeKey: snapshot.closeKey + (close ? 1 : 0) });
    if (notify) onChange([...selected]);
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    get size() { return snapshot.selected.length; },
    values: () => [...snapshot.selected],
    matches: value => !snapshot.selected.length || snapshot.selected.includes(value),
    summary: () => !snapshot.selected.length ? 'All maps' : snapshot.selected.length === 1 ? formatLabel(snapshot.selected[0]) : `${snapshot.selected.length} maps`,
    formatLabel,
    setOptions(values, { reset = false } = {}) {
      const options = [...new Set(values.filter(Boolean))].sort();
      update({ options, selected: reset ? [] : snapshot.selected.filter(value => options.includes(value)) });
    },
    setSelected,
    reset(options) { setSelected([], options); },
    choose(value, checked) {
      const selected = value === 'ALL' ? [] : checked ? [...snapshot.selected, value] : snapshot.selected.filter(map => map !== value);
      setSelected(selected, { notify: true, close: false });
    }
  };
}
