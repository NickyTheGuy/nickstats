const test = require('node:test');
const assert = require('node:assert/strict');

const storeModule = import('../frontend/session-store.mjs');

test('React session snapshots remain stable between updates and preserve previous state', async () => {
  const { createSessionStore } = await storeModule;
  const store = createSessionStore();
  const initial = store.getSnapshot();
  assert.equal(store.getSnapshot(), initial);
  store.update({ status: { loading: true, error: '', ready: false } });
  assert.notEqual(store.getSnapshot(), initial);
  assert.equal(initial.status.loading, false);
  const loading = store.getSnapshot();
  const model = { rows: [{ id: '1' }] };
  store.update({ model });
  assert.equal(store.getSnapshot().status, loading.status);
  assert.equal(store.getSnapshot().model, model);
  assert.equal(loading.model, null);
});

test('React session subscribers see current snapshots and can unsubscribe', async () => {
  const { createSessionStore } = await storeModule;
  const store = createSessionStore();
  const snapshots = [];
  const unsubscribe = store.subscribe(() => snapshots.push(store.getSnapshot()));
  store.update({ status: { loading: false, error: 'Offline', ready: false } });
  store.update({ status: { loading: false, error: '', ready: true } });
  assert.equal(snapshots[0].status.error, 'Offline');
  assert.equal(snapshots[1].status.ready, true);
  unsubscribe();
  store.update({ model: {} });
  assert.equal(snapshots.length, 2);
});
