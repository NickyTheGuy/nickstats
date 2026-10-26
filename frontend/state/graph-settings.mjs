export const graphSettingChoices = {
  scope: [['match', 'Match by match'], ['session', 'Session by session'], ['round', 'Round by round']],
  type: [['distribution', 'Distribution'], ['trend', 'Trend'], ['relationship', 'X vs. Y']],
  style: [['bars', 'Bars'], ['line', 'Line']],
  mode: [['auto', 'Automatic'], ['range', 'Range'], ['manual', 'Manual']]
};
export function createGraphSettings(onChange = () => {}) {
  let state = { scope: 'match', type: 'distribution', style: 'bars', mode: 'auto', bucketCount: 10,
    metricId: 'rating', xMetricId: 'opening_attempt_rate', supportsRounds: false, roundOnly: false,
    ranges: new Map(), cutoffs: new Map(), error: '' };
  const listeners = new Set();
  const publish = patch => { state = { ...state, ...patch }; listeners.forEach(fn => fn()); };
  const bucketKey = () => state.scope !== 'round' && state.type === 'relationship' ? state.xMetricId : state.metricId;
  const changed = patch => { publish(patch); onChange(); };
  return {
    getSnapshot: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    bucketKey,
    configure(config) {
      const scope = config.roundOnly ? 'round' : !config.supportsRounds && state.scope === 'round' ? 'match' : state.scope;
      if (scope !== state.scope || Object.entries(config).some(([key, value]) => state[key] !== value)) publish({ ...config, scope });
    },
    set(key, value) {
      if (!graphSettingChoices[key]?.some(([allowed]) => allowed === value)) return;
      if (key === 'scope' && (state.roundOnly && value !== 'round' || !state.supportsRounds && value === 'round')) return;
      if (state[key] !== value) changed({ [key]: value });
    },
    step(amount) {
      const bucketCount = Math.max(4, Math.min(24, state.bucketCount + amount));
      if (bucketCount !== state.bucketCount) changed({ bucketCount });
    },
    range(index, value) {
      const key = bucketKey(), values = [...(state.ranges.get(key) || ['', '', ''])];
      values[index] = value;
      changed({ ranges: new Map(state.ranges).set(key, values) });
    },
    manual(value) { changed({ cutoffs: new Map(state.cutoffs).set(bucketKey(), value) }); },
    validation(error) { if (state.error !== error) publish({ error }); }
  };
}
