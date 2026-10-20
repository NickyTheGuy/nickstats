export function createSegmentedFilter({ options, initial = 'ALL', onChange = () => {} }) {
  const allowed = new Set(options.map(([value]) => value)), listeners = new Set();
  let snapshot = { value: initial, disabled: [] };
  const publish = patch => { snapshot = { ...snapshot, ...patch }; listeners.forEach(listener => listener()); };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    get value() { return snapshot.value; },
    set(value, { notify = true } = {}) {
      if (!allowed.has(value)) return;
      if (value !== snapshot.value) publish({ value });
      if (notify) onChange(value);
    },
    choose(value) {
      if (!allowed.has(value) || snapshot.disabled.includes(value)) return;
      if (value !== snapshot.value) publish({ value });
      onChange(value);
    },
    setDisabled(values) {
      const disabled = [...new Set(values)].filter(value => allowed.has(value));
      if (disabled.length !== snapshot.disabled.length || disabled.some(value => !snapshot.disabled.includes(value))) publish({ disabled });
    }
  };
}
