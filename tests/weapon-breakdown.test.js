const test = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../frontend/features/matches/state/weapon-breakdown.mjs');

test('weapon rates use rounds used, while usage uses player rounds, preserving raw sort precision', async () => {
  const { weaponBreakdown } = await modulePromise;
  const player = { rounds_played: 22, weapon_stats: [
    { weapon: 'ak47', kills: 3, damage: 419, shots: 31, hits: 11, rounds_used: 7 },
    { weapon: 'awp', kills: 1, damage: 100, shots: 3, hits: 1, rounds_used: 3 }
  ] };
  const original = structuredClone(player);
  const model = weaponBreakdown(player);
  assert.equal(model.totals, '4 kills · 34 shots');
  assert.deepEqual(model.rows[0], ['AK-47', 3, '0.429', 419, '59.9', 31, 11, '35.5%', 7, '31.8%']);
  assert.equal(model.sortRows[0][2], 3 / 7);
  assert.equal(model.sortRows[0][7], 100 * 11 / 31);
  assert.deepEqual(player, original);
});

test('weapon labels cover known weapons, unknown IDs and missing or zero denominators', async () => {
  const { weaponBreakdown, weaponName } = await modulePromise;
  assert.equal(weaponName('m4a1_silencer'), 'M4A1-S');
  assert.equal(weaponName('custom_weapon'), 'Custom Weapon');
  assert.equal(weaponName(), 'Unknown');
  const model = weaponBreakdown({ weapon_stats: [{ weapon: 'knife' }] });
  assert.deepEqual(model.rows[0], ['Knife', 0, '0.000', 0, '0.0', 0, 0, '0.0%', 0, '0.0%']);
  assert.deepEqual(weaponBreakdown({ weapon_stats: null }).rows, []);
  assert.equal(weaponBreakdown({}).totals, '0 kills · 0 shots');
});

test('weapon sort mode restores original event order, keeps ties stable, and leaves other table sort behavior unchanged', async () => {
  const { weaponBreakdown } = await modulePromise;
  const { nextTableSort, sortTableRows } = await import('../frontend/shared/state/table-sort.mjs');
  const model = weaponBreakdown({ weapon_stats: [{ weapon: 'awp', kills: 1 }, { weapon: 'ak47', kills: 3 }, { weapon: 'knife', kills: 3 }] });
  const sort = nextTableSort(null, 1, true);
  assert.deepEqual(sortTableRows(model.rows, model.sortRows, sort).map(row => row.values[0]), ['AK-47', 'Knife', 'AWP']);
  assert.equal(nextTableSort(sort, 1, true), null);
  assert.deepEqual(sortTableRows(model.rows, model.sortRows, nextTableSort(sort, 1, true)).map(row => row.values[0]), ['AWP', 'AK-47', 'Knife']);
  assert.deepEqual(nextTableSort(sort, 1), { column: 1, direction: 'asc' });
  assert.deepEqual(nextTableSort(sort, 0, true), { column: 0, direction: 'asc' });
});
