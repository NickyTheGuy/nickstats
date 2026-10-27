// A search instance owns its debounce and request generation. Aborting is only an
// optimization: the generation check also protects against late/cached responses.
export function createPlayerSearch({ limit = 25, initialMessage = '', fetcher = (...args) => fetch(...args), delay = 250 } = {}) {
  let snapshot = { query: '', players: [], message: initialMessage, error: false, loading: false };
  const listeners = new Set();
  let timer, controller, generation = 0;
  const publish = patch => { snapshot = { ...snapshot, ...patch }; listeners.forEach(listener => listener()); };
  function cancel() { clearTimeout(timer); controller?.abort(); generation += 1; }
  async function submit() {
    cancel();
    const query = snapshot.query.trim();
    if (!query) { publish({ players: [], message: initialMessage, error: false, loading: false }); return; }
    const request = generation;
    controller = new AbortController();
    publish({ players: [], message: 'Searching players…', error: false, loading: true });
    try {
      const parameters = new URLSearchParams({ q: query, limit: String(limit), offset: '0' });
      const response = await fetcher(`/nickstats/api/players?${parameters}`, { headers: { Accept: 'application/json' }, signal: controller.signal });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.reason || `The API returned HTTP ${response.status}.`);
      if (request !== generation) return;
      const players = Array.isArray(body?.players) ? body.players : [];
      publish({ players, loading: false, message: players.length ? `${players.length} player${players.length === 1 ? '' : 's'} found.` : 'No players matched that search.' });
    } catch (error) {
      if (request !== generation || error.name === 'AbortError') return;
      publish({ players: [], loading: false, error: true, message: `Could not search players: ${error.message}` });
    }
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    input(query) {
      cancel();
      publish({ query, players: [], loading: false, error: false, message: initialMessage });
      if (query.trim().length >= 2) timer = setTimeout(submit, delay);
    },
    submit,
    reset(message = initialMessage) { cancel(); publish({ query: '', players: [], loading: false, error: false, message }); },
    status(message, error = false) { publish({ message, error }); },
    destroy() { cancel(); listeners.clear(); }
  };
}
