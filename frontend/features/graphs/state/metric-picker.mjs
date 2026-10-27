export function metricSuggestions(choices, category, query = '') {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return choices.filter(choice => (category === 'All' || choice.group === category || words.length)
    && words.every(word => `${choice.group} ${choice.label}`.toLocaleLowerCase().includes(word))).slice(0, 30);
}

export function createMetricPicker({ onSelect, onDraft }) {
  let state = { choices: [], categories: [], metricId: '', category: 'All', query: null, open: false, index: -1, label: 'Statistic', focusKey: 0 };
  const listeners = new Set();
  const publish = patch => { state = { ...state, ...patch }; listeners.forEach(fn => fn()); };
  const draft = patch => { publish(patch); onDraft?.(state); };
  return {
    getSnapshot: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    sync(config) { publish({ ...config, open: false, index: -1 }); },
    label(label) { if (state.label !== label) publish({ label }); },
    open() { publish({ open: true, index: -1 }); },
    close() { if (state.open) publish({ open: false, index: -1 }); },
    input(query) { draft({ query, open: true, index: -1 }); },
    category(category) { draft({ category, query: '', open: true, index: -1, focusKey: state.focusKey + 1 }); },
    escape() { draft({ query: null, open: false, index: -1 }); },
    move(amount) {
      const choices = metricSuggestions(state.choices, state.category, state.query ?? '');
      const index = !state.open || state.index < 0 ? amount > 0 ? 0 : choices.length - 1 : (state.index + amount + choices.length) % choices.length;
      publish({ open: true, index: choices.length ? index : -1 });
    },
    choose(id) {
      const metric = state.choices.find(choice => choice.id === id);
      if (!metric) return;
      publish({ metricId: id, category: state.category === 'All' ? 'All' : metric.group, query: null, open: false, index: -1 });
      onSelect?.(state);
    },
    enter() {
      if (!state.open) return;
      const choices = metricSuggestions(state.choices, state.category, state.query ?? '');
      const choice = choices[Math.max(0, state.index)];
      if (choice) this.choose(choice.id);
    }
  };
}
