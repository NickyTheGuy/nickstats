const test = require('node:test');
const assert = require('node:assert/strict');
const modulePromise = import('../frontend/state/table-sort.mjs');

test('table sorts raw numeric values rather than rounded or styled display values without mutating input', async () => {
  const { sortTableRows } = await modulePromise;
  const rows = [['A', { text: '9.9%', className: 'rating-good' }], ['B', '100.0%'], ['C', '9.9%']];
  const raw = [['A', 9.91], ['B', 100], ['C', 9.94]];
  assert.deepEqual(sortTableRows(rows, raw, { column: 1, direction: 'desc' }).map(row => row.values[0]), ['B', 'C', 'A']);
  assert.deepEqual(sortTableRows(rows, raw, { column: 1, direction: 'asc' }).map(row => row.values[0]), ['A', 'C', 'B']);
  assert.deepEqual(rows.map(row => row[0]), ['A', 'B', 'C']); assert.equal(rows[0][1].className, 'rating-good');
});

test('table sort is stable for ties, uses natural text order and tolerates empty/missing cells', async () => {
  const { sortTableRows } = await modulePromise;
  const rows = [['Map 10', 5], ['map 2', 5], ['Map 1', 3], ['Empty']];
  assert.deepEqual(sortTableRows(rows, rows, { column: 0, direction: 'asc' }).map(row => row.values[0]), ['Empty', 'Map 1', 'map 2', 'Map 10']);
  assert.deepEqual(sortTableRows(rows.slice(0, 3), undefined, { column: 1, direction: 'desc' }).map(row => row.index), [0, 1, 2]);
  assert.deepEqual(sortTableRows([], undefined, { column: 0, direction: 'asc' }), []);
  assert.equal(sortTableRows(rows, [], null)[3].values, rows[3]);
});

test('table headings default to ascending names and descending stats, then reverse independently', async () => {
  const { nextTableSort } = await modulePromise;
  const first = nextTableSort(null, 0), stat = nextTableSort(first, 2);
  assert.deepEqual(first, { column: 0, direction: 'asc' });
  assert.deepEqual(stat, { column: 2, direction: 'desc' });
  assert.deepEqual(nextTableSort(stat, 2), { column: 2, direction: 'asc' });
  assert.deepEqual(nextTableSort(stat, 0), first);
});
