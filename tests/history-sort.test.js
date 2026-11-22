const test = require('node:test');
const assert = require('node:assert/strict');

test('history rating sorting ranks every match before paging, with missing values last', async () => {
  const { sortHistoryMatches } = await import('../frontend/features/matches/state/history-sort.mjs');
  const matches = Array.from({ length: 30 }, (_, index) => ({
    id: index + 1, rounds: 20, rating: index, played_at: 1000 + index,
  }));
  matches.push({ id: 31, rounds: 0, played_at: null });
  let scored = 0;
  const descending = sortHistoryMatches(matches, 'rating-desc', match => { scored++; return match.rating; });
  assert.equal(scored, 30);
  assert.deepEqual(descending.slice(0, 2).map(match => match.id), [30, 29]);
  assert.equal(descending[25].id, 5);
  assert.equal(descending.at(-1).id, 31);
  assert.equal(matches[0].id, 1);
  const ascending = sortHistoryMatches(matches, 'rating-asc', match => match.rating);
  assert.equal(ascending[0].id, 1);
  assert.equal(ascending.at(-1).id, 31);
  assert.equal(sortHistoryMatches(matches, 'newest')[0].id, 30);
  assert.equal(sortHistoryMatches(matches, 'oldest').at(-1).id, 31);
});
