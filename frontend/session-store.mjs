// The existing data controller publishes immutable snapshots; React subscribes.
export function createSessionStore() {
  let snapshot = { status: { loading: false, error: '', ready: false }, model: null };
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
