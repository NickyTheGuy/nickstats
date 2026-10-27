const test = require('node:test');
const assert = require('node:assert/strict');
const model = import('../frontend/features/matches/state/match-matrix.mjs');

test('duel identities distinguish equal names, fall back to names, and preserve self-kills and unavailable data', async () => {
  const { matchMatrix } = await model;
  const teams = [{ name: 'Blue', players: [{ name: 'Twin', steam_id: '1', duels: [
    { opponent_steam_id: '1', kills: 0, deaths: 1 }, { opponent_steam_id: '2', kills: 3, deaths: 1 },
    { opponent: 'BOT', kills: 2, deaths: 2 }
  ] }, { name: 'Twin', steam_id: '2' }] }, { players: [{ name: 'Bot' }, {}] }];
  const original = structuredClone(teams);
  const matrix = matchMatrix(teams, 'duels');
  assert.deepEqual(matrix.rows[0].cells.map(c => c.text), ['0-1', '3-1', '2-2', '—']);
  assert.match(matrix.rows[0].cells[0].title, /1 self-kill$/);
  assert.equal(matrix.rows[0].cells[0].className, 'duel-negative');
  assert.equal(matrix.rows[0].cells[1].className, 'duel-positive');
  assert.equal(matrix.rows[0].cells[2].className, 'duel-team-column-start duel-even');
  assert.equal(matrix.rows[2].className, 'duel-team-row-start');
  assert.equal(matrix.columns[2].title, 'Team 2');
  assert.equal(matrix.columns[3].text, 'Unknown');
  assert.equal(new Set(matrix.columns.map(c => c.key)).size, 4);
  assert.deepEqual(teams, original);
});

test('trade matrices distinguish absent teammate responses from inapplicable self and enemy cells', async () => {
  const { matchMatrix } = await model;
  const teammates = ['A', 'B', 'C', 'D', 'E'].map(name => ({ name }));
  teammates[0].trade_matchups = [
    { teammate: 'b', opportunities: 4, attempts: 2, successes: 1 },
    { teammate: 'C', opportunities: 3, attempts: 1 },
    { teammate: 'D', opportunities: 2 }
  ];
  const matrix = matchMatrix([{ players: teammates }, { players: [{ name: 'Enemy' }] }], 'trades');
  assert.deepEqual(matrix.rows[0].cells.map(c => c.text), ['—', '4/2/1', '3/1/0', '2/0/0', '0/0/0', '—']);
  assert.deepEqual(matrix.rows[0].cells.slice(1, 5).map(c => c.className), ['trade-success', 'trade-attempt', 'trade-opportunity', 'trade-none']);
  assert.equal(matrix.rows[0].cells[5].className, 'duel-team-column-start duel-unavailable');
  assert.equal(matrix.rows[0].cells[1].title, 'A responding to B: 4 opportunities, 2 attempts, 1 successes');
});

test('matrix updates use supplied filtered values and handle empty teams', async () => {
  const { matchMatrix } = await model;
  for (const kind of ['duels', 'trades']) {
    assert.deepEqual(matchMatrix([], kind).rows, []);
    assert.deepEqual(matchMatrix([{ players: [] }], kind).columns, []);
  }
  const teams = [{ players: [{ name: 'A', duels: [{ opponent: 'B', kills: 1, deaths: 0 }] }, { name: 'B' }] }];
  assert.equal(matchMatrix(teams, 'duels').rows[0].cells[1].text, '1-0');
  teams[0].players[0].duels = [];
  assert.equal(matchMatrix(teams, 'duels').rows[0].cells[1].text, '—');
});
