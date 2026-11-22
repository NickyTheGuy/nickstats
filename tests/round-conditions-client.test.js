const { test } = require('node:test');
const assert = require('node:assert/strict');
const clientModule = () => import('../frontend/features/profiles/state/round-conditions-client.mjs');
const body = id => ({ player_id: Number(id), matches: [] });
const tick = () => new Promise(resolve => setImmediate(resolve));

test('Round conditions share in-flight reads across views and cap cold requests at two', async () => {
  const { createRoundConditionsClient } = await clientModule();
  const pending = [];
  let active = 0, peak = 0, calls = 0;
  const client = createRoundConditionsClient((url, options) => new Promise(resolve => {
    const id = url.match(/players\/(\d+)/)[1];
    assert.equal(options.cache, 'no-store');
    active++; calls++; peak = Math.max(peak, active);
    pending.push(() => { active--; resolve({ ok: true, json: async () => body(id) }); });
  }));
  const players = [1,2,3,4].map(id => ({ id, label: `Player ${id}` }));
  assert.equal(calls, 0);
  const first = client.prepare(players);
  assert.equal(first.ready, false); assert.equal(calls, 2);
  const same = client.load('1'); assert.equal(same, client.load(1));
  client.prepare(players.slice().reverse()); assert.equal(calls, 2);
  while (pending.length) { pending.shift()(); await tick(); }
  assert.equal(calls, 4); assert.equal(peak, 2);
  assert.equal(client.prepare(players).ready, true);
  client.prepare([{ id: 2 }]); client.prepare(players.slice(1,3));
  assert.equal(calls, 4);
});

test('Round condition errors remain retryable without automatic request loops', async () => {
  const { createRoundConditionsClient } = await clientModule();
  let calls = 0;
  const client = createRoundConditionsClient(async () => ({ ok: ++calls > 1, status: 503,
    json: async () => calls === 1 ? {reason:'Try again'} : body(1) }));
  const players = [{ id: 1, label: 'One' }];
  client.prepare(players); await tick();
  assert.match(client.prepare(players).error, /One: Try again/);
  client.prepare(players); assert.equal(calls, 1);
  client.retry(players); client.prepare(players); await tick();
  assert.equal(client.prepare(players).ready, true); assert.equal(calls, 2);
});

test('Round condition cache expires and invalidation rejects outdated in-flight data', async () => {
  const { createRoundConditionsClient } = await clientModule();
  let now = 0, calls = 0, resolve;
  const client = createRoundConditionsClient(async () => {
    calls++;
    if (calls === 2) return new Promise(done => { resolve = done; });
    return {ok:true,json:async()=>body(1)};
  }, {now:()=>now,maxAge:10});
  await client.load(1); now=11;
  const old=client.load(1); client.invalidate(1);
  await client.load(1);
  resolve({ok:true,json:async()=>({player_id:1,matches:[],old:true})});
  await assert.rejects(old, error=>error.name==='AbortError');
  assert.equal(client.get(1).data.old, undefined); assert.equal(calls,3);
});

test('Large active comparisons do not evict their own required players and reload forever', async () => {
  const { createRoundConditionsClient } = await clientModule();
  let calls=0;
  const client=createRoundConditionsClient(async url=>({ok:true,json:async()=>{calls++;return body(url.match(/players\/(\d+)/)[1]);}}),{maximumEntries:2});
  const players=[1,2,3].map(id=>({id}));
  client.prepare(players);
  for(let attempt=0;attempt<10&&!client.prepare(players).ready;attempt++)await tick();
  assert.equal(client.prepare(players).ready,true);
  assert.equal(calls,3);
  client.prepare([{id:4}]);await tick();
  assert.equal(client.get(1),null);
});

test('Returning to All cancels cold queued reads while keeping completed active reads reusable',async()=>{
 const {createRoundConditionsClient}=await clientModule();let calls=0;const pending=[];
 const client=createRoundConditionsClient(url=>new Promise(resolve=>{calls++;pending.push(()=>resolve({ok:true,json:async()=>body(url.match(/players\/(\d+)/)[1])}));}));
 client.prepare([1,2,3,4].map(id=>({id})));assert.equal(calls,2);
 client.cancelQueued();pending.forEach(done=>done());await tick();
 assert.equal(calls,2);assert.equal(client.get(3),null);assert.equal(client.get(1).status,'ready');
});
