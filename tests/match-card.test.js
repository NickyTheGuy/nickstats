const test = require('node:test');
const assert = require('node:assert/strict');
const model = import('../frontend/state/match-card.mjs');

test('map artwork normalizes demo paths and gracefully handles unsupported maps', async () => {
  const { artworkFor } = await model;
  assert.equal(artworkFor('maps/de_dustII.bsp').file, 'dust2.webp');
  assert.equal(artworkFor('DE_NUKE').position, 'center 38%');
  assert.equal(artworkFor('workshop\\de_mirage.vpk').file, 'mirage.webp');
  assert.equal(artworkFor('de_custom_map'), null);
  assert.equal(artworkFor(null), null);
});

test('team scores distinguish zero, ties and unavailable results', async () => {
  const { matchScore, teamResult } = await model;
  assert.equal(matchScore({ score: '0' }), 0);
  assert.equal(matchScore({ score: '' }), null);
  assert.equal(matchScore({ score: 'invalid' }), null);
  assert.equal(teamResult({ score: 13 }, { score: 9 }), 'winner');
  assert.equal(teamResult({ score: 9 }, { score: 13 }), 'loser');
  assert.equal(teamResult({ score: 12 }, { score: 12 }), '');
  assert.equal(teamResult({}, { score: 13 }), '');
});

test('accessible card labels preserve viewer order, statistics and missing-score fallback', async () => {
  const { matchDescription, formatMatchTime } = await model;
  const label = matchDescription({ id: 101, map: 'de_mirage', viewer_team_slot: 1,
    teams: [{ name: 'Orange', score: 13 }, { name: 'Blue', score: 9 }], viewer_stats: { rating: 1.2, kills: 20, deaths: 10, assists: 5, adr: 80 } });
  assert.match(label, /Blue 9 to 13 Orange/);
  assert.match(label, /rating 1.20, kills 20, deaths 10, assists 5, ADR 80.0/);
  assert.match(matchDescription({ id: 102 }), /Unknown map: score unavailable/);
  assert.equal(formatMatchTime(0), 'Unknown');
  assert.equal(formatMatchTime(Number.NaN), 'Unknown');
});
