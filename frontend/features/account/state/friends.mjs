let snapshot = { username: null, friends: [], loading: false, error: '', ready: false },
  controller = null;
const listeners = new Set();
const publish = (patch) => {
  snapshot = { ...snapshot, ...patch };
  for (const fn of listeners) fn();
};
async function json(options = {}) {
  const response = await fetch('/nickstats/api/auth/friends', {
    credentials: 'same-origin',
    cache: 'no-store',
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw Error(body?.reason || `Friends returned HTTP ${response.status}.`);
  if (!Array.isArray(body?.friends)) throw Error('Invalid friends list.');
  return body.friends;
}
export const friendsStore = {
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  getSnapshot: () => snapshot,
  async sync(username, force = false) {
    username = username || null;
    if (snapshot.username === username && (snapshot.ready || snapshot.loading) && !force) return;
    controller?.abort();
    const next = new AbortController();
    controller = next;
    publish({ username, friends: [], loading: Boolean(username), ready: !username, error: '' });
    if (!username) return;
    try {
      const friends = await json({ signal: next.signal });
      if (!next.signal.aborted) publish({ friends, loading: false, ready: true });
    } catch (error) {
      if (!next.signal.aborted) publish({ loading: false, error: error.message, ready: false });
    }
  },
  async set(player, friend) {
    const username = snapshot.username;
    if (!username) throw Error('Log in to manage friends.');
    controller?.abort();
    const friends = await json({
      method: 'POST',
      body: JSON.stringify({ player_id: Number(player.id), friend }),
    });
    if (snapshot.username === username)
      publish({ friends, loading: false, ready: true, error: '' });
  },
};
if (typeof window !== 'undefined')
  window.addEventListener('nickstats:account-session', () =>
    friendsStore.sync(window.NickStatsAccountSession?.username),
  );
