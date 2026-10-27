const test = require('node:test');
const assert = require('node:assert/strict');
const modules = Promise.all([import('../frontend/features/filters/state/segmented-filter.mjs'), import('../frontend/features/filters/state/segmented-config.mjs')]);

test('segmented selections notify synchronously and silent reset avoids feedback callbacks', async () => {
  const [{ createSegmentedFilter }, { segmentedFilters }] = await modules;
  const changes = [];
  const store = createSegmentedFilter({ ...segmentedFilters.playerSideFilter, onChange: value => changes.push([value, store.value]) });
  const initial = store.getSnapshot();
  store.choose('T'); assert.deepEqual(changes, [['T', 'T']]);
  assert.equal(initial.value, 'ALL'); assert.equal(store.getSnapshot(), store.getSnapshot());
  store.set('ALL', { notify: false }); assert.equal(changes.length, 1); assert.equal(store.value, 'ALL');
  store.choose('invalid'); store.set('invalid'); assert.equal(changes.length, 1); assert.equal(store.value, 'ALL');
});

test('disabled lineup conditions ignore user input and can be synchronized programmatically', async () => {
  const [{ createSegmentedFilter }, { segmentedFilters }] = await modules;
  const calls = [], store = createSegmentedFilter({ ...segmentedFilters.comboConditionFilter, onChange: value => calls.push(value) });
  store.setDisabled(['with', 'invalid', 'with']); store.choose('with');
  assert.equal(store.value, 'without'); assert.deepEqual(calls, []);
  store.setDisabled([]); store.choose('with'); assert.equal(store.value, 'with');
  store.set('without', { notify: false }); store.setDisabled(['with']);
  assert.equal(store.value, 'without'); assert.deepEqual(calls, ['with']);
});

test('segmented subscriptions release listeners and independent views keep their own values', async () => {
  const [{ createSegmentedFilter }, { segmentedFilters }] = await modules;
  const first = createSegmentedFilter(segmentedFilters.playerBuyFilter), second = createSegmentedFilter(segmentedFilters.groupBuyFilter);
  let notifications = 0; const off = first.subscribe(() => notifications++);
  first.choose('hero'); assert.equal(notifications, 1); assert.equal(first.value, 'hero'); assert.equal(second.value, 'ALL');
  off(); first.set('ALL'); assert.equal(notifications, 1);
});

test('all configured filters have valid defaults and the expected economy/phase choices', async () => {
  const [, { segmentedFilters }] = await modules;
  for (const config of Object.values(segmentedFilters)) {
    const values = config.options.map(([key]) => key);
    assert.ok(values.includes(config.initial)); assert.equal(new Set(values).size, values.length);
  }
  assert.ok(segmentedFilters.playerBuyFilter.options.some(([key]) => key === 'hero'));
  assert.ok(!segmentedFilters.playerEnemyBuyFilter.options.some(([key]) => key === 'hero'));
  assert.deepEqual(segmentedFilters.playerRoundPhaseFilter.options.map(([key]) => key), ['ALL', 'REGULATION', 'OVERTIME']);
  assert.equal(segmentedFilters.playerHistoryViewFilter.initial, 'matches');
});
