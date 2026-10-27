// The existing data controller publishes immutable snapshots; React subscribes.
export function createComparisonStore() {
  let snapshot = { status: { loading: false, error: '', ready: false }, input: null, resetKey: 0 };
  const listeners = new Set();
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    update(patch) {
      snapshot = { ...snapshot, ...patch };
      listeners.forEach(listener => listener());
    }
  };
}
