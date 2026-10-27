export const tagOperators = { gt: '>', gte: '≥', lt: '<', lte: '≤', eq: '=', between: 'Between' };
const label = value => value[0].toUpperCase() + value.slice(1);

function describeCondition(condition) {
  if (typeof condition === 'string') return label(condition);
  const maximum = condition.op === 'between' ? `–${condition.max ?? '…'}` : '';
  return `${tagOperators[condition.op]} ${condition.value ?? '…'}${maximum}`;
}

export function createTagFilterStore(api, { onChange = () => {} } = {}) {
  const { store, conditionMatches, displayName } = api;
  const selected = new Map(), listeners = new Set();
  let account = store.account, snapshot, closeKey = 0;
  function publish() {
    snapshot = { account: store.account, ready: store.ready, loading: store.loading, error: store.error,
      filters: [...store.filters], pending: new Set(store.pending), selected: new Map(selected), closeKey,
      supportsNumeric: store.supportsNumeric, supportsSharing: store.supportsSharing };
    listeners.forEach(listener => listener());
  }
  const unsubscribe = store.subscribe(() => {
    let resetPagination = account !== store.account;
    if (resetPagination) { selected.clear(); account = store.account; closeKey++; }
    if (store.ready) for (const id of selected.keys()) {
      if (!store.filters.some(tag => tag.id === id)) { selected.delete(id); resetPagination = true; }
    }
    publish(); onChange({ resetPagination });
  });
  publish();
  return {
    selected,
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    get active() { return Boolean(store.account && selected.size); },
    reset({ notify = false } = {}) {
      selected.clear(); publish();
      if (notify) onChange({ resetPagination: true });
    },
    select(id, condition) {
      if (condition == null) selected.delete(id); else selected.set(id, condition);
      publish(); onChange({ resetPagination: true });
    },
    matches(match) {
      if (!store.account || !selected.size) return true;
      if (!store.ready) return false;
      return [...selected].every(([id, condition]) => {
        const tag = store.filters.find(tag => tag.id === id);
        return tag && conditionMatches(store.stateFor(tag, match.id), condition);
      });
    },
    summary() {
      if (!store.account || !selected.size) return 'All matches';
      return [...selected].map(([id, value]) => {
        const tag = store.filters.find(tag => tag.id === id) || { name: 'Tag' };
        return `${displayName(tag)}: ${describeCondition(value)}`;
      }).join(' · ');
    },
    destroy() { unsubscribe(); listeners.clear(); }
  };
}
