import { useCallback, useSyncExternalStore } from 'react';

export default function useManualTags(store) {
  const subscribe = useCallback(listener => store.subscribe(listener), [store]);
  const snapshot = useCallback(() => store.version, [store]);
  useSyncExternalStore(subscribe, snapshot);
  return { account: store.account, ready: store.ready, loading: store.loading, error: store.error,
    filters: store.filters, pending: store.pending, supportsNumeric: store.supportsNumeric };
}
