const test = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../frontend/features/players/state/player-search.mjs');
const response = players => ({ ok: true, json: async () => ({ players }) });
function pendingRequests() {
  const requests = [];
  return { requests, fetcher: (url, options) => new Promise(resolve => requests.push({ url, options, resolve })) };
}

test('new query and clear invalidate requests even when transport ignores abort', async () => {
  const { createPlayerSearch } = await modulePromise;
  const { requests, fetcher } = pendingRequests();
  const store = createPlayerSearch({ fetcher, initialMessage: 'Ready' });
  store.input('Nick'); const first = store.submit();
  store.input('Alex'); const second = store.submit();
  assert.equal(requests[0].options.signal.aborted, true);
  requests[1].resolve(response([{ id: 2 }])); await second;
  requests[0].resolve(response([{ id: 1 }])); await first;
  assert.deepEqual(store.getSnapshot().players, [{ id: 2 }]);
  store.input('Sam'); const third = store.submit(); store.input('');
  requests[2].resolve(response([{ id: 3 }])); await third;
  assert.equal(store.getSnapshot().query, ''); assert.deepEqual(store.getSnapshot().players, []);
  assert.equal(store.getSnapshot().message, 'Ready'); store.destroy();
});

test('debounced input sends only the latest query and explicit submit supports one character', async () => {
  const { createPlayerSearch } = await modulePromise;
  const calls = [], store = createPlayerSearch({ delay: 5, limit: 20, fetcher: async url => { calls.push(url); return response([]); } });
  store.input('Ni'); store.input('Nick');
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(calls.length, 1); assert.equal(new URL(calls[0], 'http://localhost').searchParams.get('q'), 'Nick');
  assert.equal(new URL(calls[0], 'http://localhost').searchParams.get('limit'), '20');
  store.input('N'); await store.submit(); assert.equal(calls.length, 2);
  assert.equal(store.getSnapshot().message, 'No players matched that search.'); store.destroy();
});

test('reset cancels debounce and late errors cannot overwrite selection status', async () => {
  const { createPlayerSearch } = await modulePromise;
  const { requests, fetcher } = pendingRequests();
  const store = createPlayerSearch({ fetcher, delay: 5 });
  let notifications = 0; const off = store.subscribe(() => notifications++);
  store.input('Nick'); store.reset('Selected');
  await new Promise(resolve => setTimeout(resolve, 20)); assert.equal(requests.length, 0);
  store.input('Alex'); const search = store.submit(); store.reset('Selected');
  requests[0].resolve({ ok: false, status: 503, json: async () => ({ reason: 'Offline' }) }); await search;
  assert.equal(store.getSnapshot().message, 'Selected'); assert.equal(store.getSnapshot().error, false);
  off(); const before = notifications; store.status('Limit reached', true); assert.equal(notifications, before);
  assert.equal(store.getSnapshot(), store.getSnapshot()); store.destroy();
});

test('errors clear old results and retry succeeds independently of another search instance', async () => {
  const { createPlayerSearch } = await modulePromise;
  let fail = true;
  const store = createPlayerSearch({ fetcher: async () => fail ? { ok: false, status: 503, json: async () => ({ reason: 'Offline' }) } : response([{ id: 1 }]) });
  const other = createPlayerSearch();
  store.input('Nick'); await store.submit();
  assert.equal(store.getSnapshot().message, 'Could not search players: Offline'); assert.equal(store.getSnapshot().error, true);
  fail = false; await store.submit(); assert.deepEqual(store.getSnapshot().players, [{ id: 1 }]);
  assert.equal(store.getSnapshot().error, false); assert.deepEqual(other.getSnapshot().players, []);
  store.destroy(); other.destroy();
});
