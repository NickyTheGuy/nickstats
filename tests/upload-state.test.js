const test = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../frontend/features/upload/state/upload.mjs');

test('upload queues preserve file order and previous snapshots as progress updates arrive', async () => {
  const { createUploadStore } = await modulePromise;
  const store = createUploadStore();
  let notifications = 0; const unsubscribe = store.subscribe(() => notifications++);
  store.select([{ name: 'first.dem' }, { name: 'second.dem.zst' }], '2 demos');
  const first = store.getSnapshot();
  assert.equal(first.parseLabel, 'Parse 2 matches');
  assert.deepEqual(first.items.map(item => [item.name, item.state]), [['first.dem', 'waiting'], ['second.dem.zst', 'waiting']]);
  store.item(0, 'active', 'Parsing…'); store.item(0, 'success', 'Saved #101');
  store.item(1, 'error', 'Malformed demo'); store.progress(2, 2, 1, 1);
  assert.equal(store.getSnapshot().summary, '1 saved · 1 failed');
  assert.deepEqual(store.getSnapshot().items.map(item => item.state), ['success', 'error']);
  assert.equal(first.items[0].state, 'waiting'); assert.equal(first.completed, 0);
  unsubscribe(); store.status('Done'); assert.equal(notifications, 5);
});

test('selection and Clear discard stale result actions, diagnostics, progress and file input state', async () => {
  const { createUploadStore } = await modulePromise;
  const store = createUploadStore();
  store.update({ retry: true, replace: true, download: true, diagnostics: true });
  store.select([{ name: 'single.dem' }], 'single.dem · 12 B');
  assert.equal(store.getSnapshot().parseLabel, 'Parse match');
  for (const key of ['retry', 'replace', 'download', 'diagnostics']) assert.equal(store.getSnapshot()[key], false);
  store.status('Upload failed', true); store.update({ download: true, diagnostics: true });
  store.reset(); const clean = store.getSnapshot();
  assert.equal(clean.selected, false); assert.equal(clean.resetKey, 1);
  assert.equal(clean.fileLabel, 'Choose one or more demos'); assert.equal(clean.error, false);
  assert.deepEqual(clean.items, []); assert.equal(clean.download, false); assert.equal(clean.diagnostics, false);
  store.reset(); assert.equal(store.getSnapshot().resetKey, 2);
});

test('restarting a batch resets individual results and progress while retaining busy flags', async () => {
  const { createUploadStore } = await modulePromise;
  const store = createUploadStore(); const files = [{ name: 'one.dem' }, { name: 'two.dem' }];
  store.select(files, '2 demos'); store.item(0, 'error', 'Login expired'); store.progress(1, 2, 0, 1);
  store.update({ busy: true, batchRunning: true }); store.queue(files);
  const view = store.getSnapshot();
  assert.equal(view.summary, '0 of 2 complete'); assert.equal(view.completed, 0);
  assert.equal(view.busy, true); assert.equal(view.batchRunning, true);
  assert.deepEqual(view.items.map(item => item.detail), ['Waiting', 'Waiting']);
});
