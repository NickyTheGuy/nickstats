import { validateRoundConditions } from './round-conditions.mjs';

// The same player response serves profiles, comparisons and every group roster.
// Queue cold reads so a large comparison cannot fan out across the whole server.
export function createRoundConditionsClient(
  fetcher,
  { concurrency = 2, maximumEntries = 32, maxAge = 5 * 60_000, now = Date.now } = {},
) {
  const entries = new Map();
  const listeners = new Set();
  const queue = [];
  let active = 0;
  let retained = new Set();
  let notificationPending = false;

  function notify() {
    if (notificationPending) return;
    notificationPending = true;
    queueMicrotask(() => {
      notificationPending = false;
      listeners.forEach((listener) => listener());
    });
  }

  function trim() {
    for (const [id, entry] of entries) {
      if (entries.size <= maximumEntries) break;
      if (!retained.has(id) && (entry.status === 'ready' || entry.status === 'error'))
        entries.delete(id);
    }
  }

  function get(id) {
    const key = String(id);
    const entry = entries.get(key);
    if (entry?.status === 'ready' && now() - entry.at >= maxAge) {
      entries.delete(key);
      return null;
    }
    if (entry) {
      entries.delete(key);
      entries.set(key, entry);
    }
    return entry || null;
  }

  async function run(entry) {
    active++;
    entry.status = 'loading';
    try {
      const response = await fetcher(
        `/nickstats/api/players/${encodeURIComponent(entry.id)}/round-conditions`,
        {
          cache: 'no-store',
          signal: entry.controller.signal,
          headers: { Accept: 'application/json' },
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok)
        throw Error(body?.reason || `Round conditions returned HTTP ${response.status}.`);
      entry.controller.signal.throwIfAborted();
      const data = validateRoundConditions(body, entry.id);
      if (entries.get(entry.id) === entry) {
        Object.assign(entry, { status: 'ready', data, at: now() });
      }
      entry.resolve(data);
    } catch (error) {
      if (entries.get(entry.id) === entry) {
        Object.assign(entry, { status: 'error', error: error.message });
      }
      entry.reject(error);
    } finally {
      active--;
      trim();
      pump();
      notify();
    }
  }

  function pump() {
    while (active < concurrency && queue.length) {
      const entry = queue.shift();
      if (entries.get(entry.id) !== entry) {
        entry.reject(new DOMException('Request cancelled', 'AbortError'));
      } else {
        void run(entry);
      }
    }
  }

  function load(id) {
    const key = String(id);
    const previous = get(key);
    if (previous) return previous.promise;
    const entry = { id: key, status: 'queued', controller: new AbortController() };
    entry.promise = new Promise((resolve, reject) => Object.assign(entry, { resolve, reject }));
    // prepare() starts reads without awaiting them; subscribers own the UI state.
    entry.promise.catch(() => {});
    entries.set(key, entry);
    queue.push(entry);
    pump();
    notify();
    return entry.promise;
  }

  function invalidate(id) {
    const keys = id == null ? [...entries.keys()] : [String(id)];
    for (const key of keys) {
      const entry = entries.get(key);
      entries.delete(key);
      entry?.controller.abort();
    }
    pump();
    notify();
  }

  function prepare(players) {
    const unique = [...new Map(players.map((player) => [String(player.id), player])).values()];
    retained = new Set(unique.map((player) => String(player.id)));
    const data = new Map();
    const errors = [];
    for (const player of unique) {
      let entry = get(player.id);
      if (!entry) {
        load(player.id);
        entry = get(player.id);
      }
      if (entry.status === 'ready') data.set(String(player.id), entry.data);
      if (entry.status === 'error') errors.push(`${player.label || player.id}: ${entry.error}`);
    }
    return {
      data,
      ready: data.size === unique.length,
      loading: data.size + errors.length < unique.length,
      error: errors.join(' · '),
      loaded: data.size,
      total: unique.length,
    };
  }

  return {
    get,
    load,
    prepare,
    invalidate,
    cancelQueued() {
      for (const entry of queue.splice(0)) {
        if (entries.get(entry.id) === entry) entries.delete(entry.id);
        entry.controller.abort();
        entry.reject(new DOMException('Request cancelled', 'AbortError'));
      }
      notify();
    },
    retry(players) {
      for (const player of players) {
        if (get(player.id)?.status === 'error') invalidate(player.id);
      }
    },
    reportError(id, error) {
      const entry = get(id);
      if (entry && entry.status !== 'error') {
        Object.assign(entry, { status: 'error', data: null, error: error.message });
        notify();
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
