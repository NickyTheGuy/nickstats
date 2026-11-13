const {test} = require('node:test');
const assert = require('node:assert/strict');

test('trade selection caches by player, side and exact deduplicated match set',async()=>{
  const {tradeSelection} = await import('../frontend/features/profiles/state/trade-teammates.mjs');
  assert.equal(tradeSelection(1,[2,1,2],'ALL').key,tradeSelection('1',[1,2],'ALL').key);
  assert.notEqual(tradeSelection(1,[1,2],'ALL').key,tradeSelection(1,[1,2],'CT').key);
  assert.notEqual(tradeSelection(1,[1,2],'ALL').key,tradeSelection(2,[1,2],'ALL').key);
});

test('trade rates use raw paired opportunities and attempts, with missing rates distinct from zero',async()=>{
  const {tradeRows} = await import('../frontend/features/profiles/state/trade-teammates.mjs');
  const rows=tradeRows([{opportunities:1000,attempts:200,trades:50},{opportunities:10,attempts:0,trades:0}]);
  assert.equal(rows[0].response,20);assert.equal(rows[0].success,25);
  assert.equal(rows[1].response,0);assert.equal(rows[1].success,null);
});

test('one bulk read serves both directions, expires, and invalidates after database changes',async()=>{
  const {tradeSelection,createTradeTeammatesClient} = await import('../frontend/features/profiles/state/trade-teammates.mjs');
  let now=1,calls=[];
  const result={outgoing:[{id:2,name:'Teammate',opportunities:5,attempts:2,trades:1}],incoming:[]};
  const client=createTradeTeammatesClient(async(url,options)=>{
    calls.push({url,options});return {ok:true,json:async()=>result};
  },()=>now);
  const selection=tradeSelection(1,[2,1],'CT');
  await client.load(selection);await client.load(selection);
  assert.equal(calls.length,1);
  assert.deepEqual(JSON.parse(calls[0].options.body),{match_ids:[1,2],side:'CT'});
  assert.equal(calls[0].options.method,'POST');
  now+=60000;await client.load(selection);assert.equal(calls.length,2);
  client.invalidate();await client.load(selection);assert.equal(calls.length,3);
});

test('failed or aborted trade reads do not populate the cache',async()=>{
  const {tradeSelection,createTradeTeammatesClient} = await import('../frontend/features/profiles/state/trade-teammates.mjs');
  let calls=0;
  const client=createTradeTeammatesClient(async()=>{
    calls++;return {ok:calls>1,status:404,json:async()=>({outgoing:[],incoming:[]})};
  });
  const selection=tradeSelection(1,[1],'ALL');
  await assert.rejects(client.load(selection),/not available on this server/);
  const abort=new AbortController();abort.abort();
  await assert.rejects(client.load(selection,abort.signal),error=>error.name==='AbortError');
  await client.load(selection);assert.equal(calls,3);
});
