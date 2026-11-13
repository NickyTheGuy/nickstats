const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../js/demo-worker.js'), 'utf8');

function context() {
  const messages = [];
  const c = vm.createContext({ self: { deadem: { cs2: {} }, addEventListener() {},
    postMessage(value) { messages.push(value); } },
    importScripts(url) { assert.equal(url, 'https://cdn.jsdelivr.net/npm/@deademx/cs2@5.0.0/dist/deadem-cs2.min.js'); } });
  vm.runInContext(source, c);
  assert.equal(messages[0].type, 'ready');
  return c;
}
const evaluate = code => vm.runInContext(code, context());

test('5.0 positions include the skeleton and origin send-node prefixes', () => {
  const position = evaluate(`pawnPosition({getField(name) {
    return ({
      'CBodyComponent.m_skeletonInstance.m_vecOrigin.m_cellX': 128,
      'CBodyComponent.m_skeletonInstance.m_vecOrigin.m_cellY': 127,
      'CBodyComponent.m_skeletonInstance.m_vecOrigin.m_cellZ': 129,
      'CBodyComponent.m_skeletonInstance.m_vecOrigin.m_vecX': 12,
      'CBodyComponent.m_skeletonInstance.m_vecOrigin.m_vecY': 34,
      'CBodyComponent.m_skeletonInstance.m_vecOrigin.m_vecZ': 56
    })[name];
  }})`);
  assert.equal(position.x, 16396);
  assert.equal(position.y, 16290);
  assert.equal(position.z, 16568);
  assert.equal(evaluate('pawnPosition({ getField() { throw new Error("missing"); } })'), null);
});

test('5.0 velocity components retain moving and stationary speed measurements', () => {
  assert.equal(evaluate('pawnHorizontalSpeed({getField: () => ({m_vecX: 3, m_vecY: 4, m_vecZ: 100})})'), 5);
  assert.equal(evaluate('pawnHorizontalSpeed({getField: () => ({m_vecX: 0, m_vecY: 0})})'), 0);
});

test('missing numeric data stays unavailable; actual zero remains valid', () => {
  assert.deepEqual(Array.from(evaluate('[numberOrNull(null), numberOrNull(undefined), numberOrNull(""), numberOrNull(0)]')), [null, null, null, 0]);
  assert.equal(evaluate('controllerMatchStat({getField: () => undefined}, "m_iKills")'), null);
  assert.equal(evaluate('controllerMatchStat({getField: path => path.includes("m_matchStats") ? 0 : 99}, "m_iKills")'), 0);
});

test('64-bit event IDs are lossless and JSON serializable', () => {
  assert.equal(evaluate('JSON.stringify(valueOf({type:7, valUint64:76561198012345678n}))'), '"76561198012345678"');
  assert.equal(evaluate('steamIdOf({xuid:76561198012345678n})'), '76561198012345678');
});

test('game-rule round detection ignores stale, missing, warmup and duplicate completions', () => {
  const values = evaluate(`(() => {
    const round = {freezeSeen:true, live:true, finished:false, gameRulesCompletedAtStart:2};
    const state = {completed:3, winner:2, warmup:false};
    return [
      gameRulesRoundCompletion(round, state),
      gameRulesRoundCompletion(round, {...state,winner:3}),
      gameRulesRoundCompletion(round, {...state,completed:2}),
      gameRulesRoundCompletion(round, {...state,winner:0}),
      gameRulesRoundCompletion(round, {...state,warmup:true}),
      gameRulesRoundCompletion({...round,finished:true}, state),
      gameRulesRoundCompletion({...round,live:false}, state),
      gameRulesRoundCompletion({...round,gameRulesCompletedAtStart:null}, state),
      gameRulesRoundCompletion(round, null)
    ];
  })()`);
  assert.deepEqual(Array.from(values), [2,3,null,null,null,null,null,null,null]);
});
