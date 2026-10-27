const test = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../frontend/features/filters/state/map-filter.mjs');

test('map options are unique and selected values survive only while available', async () => {
  const { createMapFilterStore } = await modulePromise;
  const store = createMapFilterStore();
  store.setOptions(['de_mirage', '', 'de_dust2', 'de_mirage']);
  assert.deepEqual(store.getSnapshot().options, ['de_dust2', 'de_mirage']);
  store.setSelected(['de_mirage', 'missing', 'de_mirage']);
  assert.equal(store.size, 1); assert.equal(store.summary(), 'Mirage');
  assert.equal(store.matches('de_dust2'), false);
  store.setOptions(['de_dust2']);
  assert.equal(store.summary(), 'All maps'); assert.equal(store.matches('de_mirage'), true);
});

test('checkbox choices notify synchronously and preserve the open dropdown', async () => {
  const { createMapFilterStore } = await modulePromise;
  const changes = [], store = createMapFilterStore({ onChange: values => changes.push({ values, current: store.values() }) });
  store.setOptions(['de_dust2', 'de_mirage']);
  const before = store.getSnapshot();
  store.choose('de_mirage', true); store.choose('de_dust2', true);
  assert.equal(store.summary(), '2 maps');
  assert.equal(store.getSnapshot().closeKey, before.closeKey);
  assert.deepEqual(before.selected, [], 'previous snapshots are not mutated');
  assert.deepEqual(changes[1].values, changes[1].current);
  store.choose('de_mirage', false); assert.deepEqual(store.values(), ['de_dust2']);
  store.choose('ALL', true); assert.deepEqual(store.values(), []);
  assert.equal(changes.length, 4);
});

test('programmatic selection and reset close menus and honor notify', async () => {
  const { createMapFilterStore } = await modulePromise;
  let notifications = 0;
  const store = createMapFilterStore({ onChange: () => notifications++, formatLabel: () => 'Custom map' });
  store.setOptions(['de_mirage']); store.setSelected(['de_mirage']);
  assert.equal(notifications, 0); assert.equal(store.summary(), 'Custom map');
  const closeKey = store.getSnapshot().closeKey;
  store.reset({ notify: true });
  assert.equal(notifications, 1); assert.ok(store.getSnapshot().closeKey > closeKey);
  store.setSelected(['de_mirage']); store.setOptions(['de_mirage'], { reset: true });
  assert.equal(store.size, 0);
});

test('map subscribers unsubscribe and returned values cannot mutate selection', async () => {
  const { createMapFilterStore } = await modulePromise;
  const store = createMapFilterStore(); let calls = 0;
  const off = store.subscribe(() => calls++);
  store.setOptions(['de_mirage']); store.choose('de_mirage', true);
  const values = store.values(); values.push('de_dust2');
  assert.deepEqual(store.values(), ['de_mirage']);
  assert.equal(calls, 2); off(); store.reset(); assert.equal(calls, 2);
});
