const {test}=require('node:test'),assert=require('node:assert/strict');
async function fixture({cacheOptions={}}={}) {
  const {createMovementCache,movementSelection}=await import('../frontend/features/analyzer/state/movement-cache.mjs');
  const {loadSelectedRounds,summarizeRound}=await import('../frontend/features/analyzer/state/server.mjs');
  const {replayFixture,projected}=await import('./fixtures/analyzer.mjs');
  const raw=[replayFixture('one'),replayFixture('two')],indexes=raw.map((r,i)=>({...r,capture:String(i),matchID:String(i+1),rounds:r.rounds.map(summarizeRound)}));
  const cache=createMovementCache(cacheOptions),calls=[];
  const request=async(path,o)=>{const selection=JSON.parse(o.body);calls.push({path,...selection});return projected(raw[Number(path.split('/')[2])],selection.rounds,selection.players);};
  const keys=(rs,nums)=>rs.flatMap(r=>r.rounds.filter(round=>!nums||nums.includes(round.number)).map(round=>`${r.match_uid}:${round.number}`));
  const load=(rs=indexes,nums=null,players=['steam:1','steam:2'],options={})=>loadSelectedRounds(rs,keys(rs,nums),players,{cache,...options},request);
  return {raw,indexes,cache,calls,load,keys,request,movementSelection,loadSelectedRounds};
}
test('Narrowing filters/players and restoring a downloaded superset makes zero movement requests',async()=>{
  const f=await fixture();const full=await f.load();assert.equal(f.calls.length,2);
  const subset=await f.load(f.indexes,[1,3],['steam:1']);assert.equal(f.calls.length,2);assert.equal(subset.length,4);
  assert.ok(subset.every(r=>r.tracks.length===1));assert.strictEqual(subset[0].tracks[0].samples,full[0].tracks[0].samples);
  assert.equal((await f.load()).length,8);assert.equal(f.calls.length,2);
  await f.load([...f.indexes].reverse(),[1,2]);assert.equal(f.calls.length,2);
});
test('Widening selection fetches only missing rounds and newly selected players',async()=>{
  const f=await fixture(),rs=[f.indexes[0]];
  await f.load(rs,[1],['steam:1']);
  await f.load(rs,[1,2],['steam:1']);assert.deepEqual(f.calls[1].rounds,[2]);
  const combined=await f.load(rs,[1,2],['steam:1','steam:2']);assert.deepEqual(f.calls[2].players,['steam:2']);assert.deepEqual(f.calls[2].rounds,[1,2]);
  assert.ok(combined.every(r=>r.tracks.length===2));assert.equal(f.calls.length,3);
});
test('Overlapping kill/death events are not duplicated when player slices arrive separately',async()=>{
  const f=await fixture(),rs=[f.indexes[0]];
  await f.load(rs,[1],['steam:1']);const rounds=await f.load(rs,[1],['steam:1','steam:3']);
  assert.equal(rounds[0].deaths.length,1);assert.equal(rounds[0].deaths[0].victim,'steam:3');
  const justVictim=await f.load(rs,[1],['steam:3']);assert.equal(justVictim[0].deaths.length,1);assert.equal(f.calls.length,2);
});
test('Players without a round track can be cached without dropping their events',async()=>{
  const f=await fixture(),rs=[f.indexes[0]];
  f.raw[0].rounds[0].tracks=f.raw[0].rounds[0].tracks.filter(t=>t.player!=='steam:3');rs[0].rounds[0].player_ids=['steam:1','steam:2'];
  await f.load(rs,[1],['steam:2']);const rounds=await f.load(rs,[1],['steam:2','steam:3']);
  assert.deepEqual(new Set(f.calls[1].players),new Set(['steam:2','steam:3']));assert.equal(rounds[0].deaths.length,1);
  await f.load(rs,[1],['steam:2','steam:3']);assert.equal(f.calls.length,2);
});
test('Eviction respects sample and byte bounds and fetches evicted data when needed',async()=>{
  const f=await fixture({cacheOptions:{maxSamples:4}}),rs=[f.indexes[0]];
  await f.load(rs,[1],['steam:1']);await f.load(rs,[2],['steam:1']);await f.load(rs,[3],['steam:1']);
  assert.equal(f.cache.usage.samples,4);await f.load(rs,[2],['steam:1']);assert.equal(f.calls.length,3);
  await f.load(rs,[1],['steam:1']);assert.equal(f.calls.length,4);assert.ok(f.cache.usage.samples<=4);
  const small=await fixture({cacheOptions:{maxBytes:1}});await assert.rejects(()=>small.load(),/memory budget/);assert.equal(small.cache.usage.entries,0);
});
test('Over-budget active selections fail explicitly without evicting required slices into a partial result',async()=>{
  const f=await fixture({cacheOptions:{maxSamples:4}});
  await assert.rejects(()=>f.load([f.indexes[0]],[1,2,3],['steam:1']),/memory budget/);
  assert.ok(f.cache.usage.samples<=4);assert.equal((await f.load([f.indexes[0]],[1],['steam:1'])).length,1);
});
test('New capture UUIDs miss the cache and explicit reload invalidates existing movement',async()=>{
  const f=await fixture();await f.load([f.indexes[0]],[1],['steam:1']);
  const next={...f.indexes[0],capture:'1'};await f.loadSelectedRounds([next],f.keys([next],[1]),['steam:1'],{cache:f.cache},async(path,o)=>{f.calls.push({path});const {projected}=await import('./fixtures/analyzer.mjs');return projected(f.raw[0],JSON.parse(o.body).rounds,['steam:1']);});
  assert.equal(f.calls.length,2);f.cache.invalidateCaptures(['0']);await f.load([f.indexes[0]],[1],['steam:1']);assert.equal(f.calls.length,3);
});
test('Cancelled late responses do not enter the cache; completed earlier movement stays reusable',async()=>{
  const f=await fixture();await f.load([f.indexes[0]],[1],['steam:1']);const before=f.cache.usage;
  const controller=new AbortController();
  await assert.rejects(()=>f.loadSelectedRounds([f.indexes[1]],f.keys([f.indexes[1]],[1]),['steam:1'],{cache:f.cache,signal:controller.signal},async(path,o)=>{const data=await f.request(path,o);controller.abort();return data;}),/abort/i);
  assert.deepEqual(f.cache.usage,before);const count=f.calls.length;await f.load([f.indexes[0]],[1],['steam:1']);assert.equal(f.calls.length,count);
});
test('Cached utility and deaths remain chronological across independently loaded players',async()=>{
  const f=await fixture(),r=f.raw[0].rounds[0];
  r.utility=[{time:100,end:300,type:'Flash',icon:'flashbang',player:'steam:2',side:3,x:0,y:0,z:0,radius:0,estimated:false},{time:200,end:300,type:'Flash',icon:'flashbang',player:'steam:1',side:3,x:0,y:0,z:0,radius:0,estimated:false}];
  await f.load([f.indexes[0]],[1],['steam:1']);const result=await f.load([f.indexes[0]],[1],['steam:1','steam:2']);assert.deepEqual(result[0].utility.map(e=>e.time),[100,200]);
});
