const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const stateModule = import('../frontend/state/comparison.mjs');
const preferencesModule = import('../frontend/state/sections.mjs');
const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/scoreboard.js'), 'utf8'), context);
const config = context.window.NickStatsScoreboard;

test('expanding another group clears only sorts whose columns disappear', async () => {
  const { initialComparisonState, comparisonReducer: reduce } = await stateModule;
  let state = initialComparisonState(config);
  state = reduce(state, { type: 'toggle', group: 'combat' }, config);
  state = reduce(state, { type: 'sort', column: { key: 'kills', group: 'combat' } }, config);
  const before = state;
  state = reduce(state, { type: 'toggle', group: 'utility' }, config);
  assert.equal(before.expandedGroups.combat, true, 'previous snapshots remain immutable');
  assert.equal(state.expandedGroups.combat, false);
  assert.equal(state.expandedGroups.utility, true);
  assert.equal(state.sort, null);
  state = reduce(state, { type: 'sort', column: { key: 'rating' } }, config);
  state = reduce(state, { type: 'toggle', group: 'utility' }, config);
  assert.equal(state.sort.key, 'rating');
});

test('subgroup cycling preserves unrelated sorting and resets a subgroup sort', async () => {
  const { initialComparisonState, comparisonReducer: reduce } = await stateModule;
  let state = initialComparisonState(config);
  state = reduce(state, { type: 'sort', column: { key: 'player' } }, config);
  state = reduce(state, { type: 'cycle', group: 'utility' }, config);
  assert.equal(state.sectionSubgroups.utility, config.subgroups.utility[1][0]);
  assert.equal(state.sort.key, 'player');
  state = reduce(state, { type: 'sort', column: { key: 'utility-he-damage', group: 'utility' } }, config);
  state = reduce(state, { type: 'cycle', group: 'utility' }, config);
  assert.equal(state.sort, null);
});

test('section filtering prunes hidden columns without changing maps or value mode', async () => {
  const { initialComparisonState, comparisonReducer: reduce, withSections } = await stateModule;
  let state = initialComparisonState(config);
  for (const action of [{ type: 'map', value: 'de_mirage' }, { type: 'valueMode', value: 'round' },
    { type: 'toggle', group: 'utility' }, { type: 'sort', column: { key: 'utility-he-damage', group: 'utility' } }]) {
    state = reduce(state, action, config);
  }
  const filtered = withSections(state, ['overview'], config);
  assert.equal(filtered.expandedGroups.utility, false);
  assert.equal(filtered.sort, null);
  assert.equal(filtered.map, 'de_mirage');
  assert.equal(filtered.valueMode, 'round');
  assert.equal(state.expandedGroups.utility, true);
});

test('reset and independent React view states do not leak map or value settings', async () => {
  const { initialComparisonState, comparisonReducer: reduce } = await stateModule;
  const first = initialComparisonState(config), second = initialComparisonState(config);
  let changed = reduce(first, { type: 'map', value: 'de_mirage' }, config);
  changed = reduce(changed, { type: 'utilityBasis' }, config);
  assert.equal(second.map, 'ALL');
  assert.equal(second.perGrenadeUtility, false);
  assert.deepEqual(reduce(changed, { type: 'reset' }, config), second);
});

test('shared section preferences retain empty selections, persist and unsubscribe', async () => {
  const { createSectionPreferences } = await preferencesModule;
  let saved = '[]';
  const storage = { getItem: () => saved, setItem(_, value) { saved = value; } };
  const store = createSectionPreferences(['overview', 'utility'], storage);
  assert.deepEqual(store.getSnapshot(), []);
  assert.equal(store.getSnapshot(), store.getSnapshot());
  let calls = 0;
  const unsubscribe = store.subscribe(() => calls++);
  store.set(['utility', 'utility', 'invalid']);
  assert.deepEqual(store.getSnapshot(), ['utility']);
  assert.equal(saved, '["utility"]');
  assert.equal(calls, 1);
  unsubscribe(); store.set([]); assert.equal(calls, 1);
});

test('unavailable storage still permits section changes', async () => {
  const { createSectionPreferences } = await preferencesModule;
  const store = createSectionPreferences(['overview', 'opening', 'rounds'], {
    getItem() { throw new Error('Blocked'); }, setItem() { throw new Error('Blocked'); }
  });
  assert.deepEqual(store.getSnapshot(), ['overview', 'opening', 'rounds']);
  store.set([]); assert.deepEqual(store.getSnapshot(), []);
});
