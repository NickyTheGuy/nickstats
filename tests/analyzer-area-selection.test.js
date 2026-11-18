const {test}=require('node:test'),assert=require('node:assert/strict');
const api=()=>import('../frontend/features/analyzer/state/area-selection.mjs');
const fixture=async()=>{const {replayFixture}=await import('./fixtures/analyzer.mjs');return replayFixture('area');};
const map={pos_x:0,pos_y:0,scale:1},upper={min:0,max:1000},area={left:-5,right:25,top:-10,bottom:10};
test('Map coordinates undo letterboxing, zoom and pan for drag rectangles',async()=>{
  const {pointerToRadar,areaBounds,areaOnScreen}=await api(),rect={left:100,top:50,width:1200,height:600},view={zoom:2,x:40,y:-20};
  const point=pointerToRadar({x:700+40*600/1024,y:350-20*600/1024},rect,view);assert.deepEqual(point,{x:512,y:512});
  assert.deepEqual(areaBounds({x:900,y:700},{x:200,y:100}),{left:200,right:900,top:100,bottom:700});
  assert.equal(areaBounds({x:-100,y:0},{x:-10,y:100}),null);assert.equal(areaBounds({x:2,y:2},{x:2,y:100}),null);
  const bounds={left:300,right:600,top:200,bottom:500},screen=areaOnScreen(bounds,{width:1200,height:600},view);
  const start=pointerToRadar({x:screen.left+rect.left,y:screen.top+rect.top},rect,view);assert.ok(Math.abs(start.x-300)<1e-8);assert.ok(Math.abs(start.y-200)<1e-8);
});
test('Area cohorts use current living positions, floor and side and count each match round once',async()=>{
  const {summarizeArea}=await api(),r=await fixture();
  r.rounds[1].tracks.forEach(t=>t.samples.forEach(s=>s[3]=-100));
  r.rounds[2].tracks.forEach(t=>t.samples.forEach(s=>s[4]=0));
  r.rounds[3].duration=100;
  const result=summarizeArea(r.rounds,{area,map,level:upper,time:200,players:['steam:1','steam:2'],side:3});
  assert.equal(result.count,1);assert.equal(result.total,4);assert.equal(result.percent,25);assert.equal(result.observations,2);assert.equal(result.winRate,100);
  assert.equal(summarizeArea(r.rounds,{area,map,level:upper,time:200,players:['steam:1'],side:2}).count,0);
});
test('Outcomes use whole-round statistics including combat after the selected time',async()=>{
  const {summarizeArea,roundRating}=await api(),r=await fixture();r.rounds=r.rounds.slice(0,1);
  r.rounds[0].performance=[{player:'steam:1',kills:3,deaths:1,assists:2,damage:200,kast:1}];
  const result=summarizeArea(r.rounds,{area,map,level:upper,time:0,players:['steam:1']});
  assert.equal(result.kills,3);assert.equal(result.deaths,1);assert.equal(result.rating,roundRating({kills:3,deaths:1,assists:2,damage:200,kast:1,played:1}));
  delete r.rounds[0].performance;const older=summarizeArea(r.rounds,{area,map,level:upper,time:0,players:['steam:1']});assert.equal(older.kills,1);assert.equal(older.rating,null);
});
test('Combined outcomes weight player rounds; missing data remains unavailable',async()=>{
  const {summarizeArea}=await api(),r=await fixture();const result=summarizeArea(r.rounds,{area,map,level:upper,time:0,players:['steam:1','steam:3']});
  assert.equal(result.count,4);assert.equal(result.observations,8);assert.equal(result.winRate,50);assert.equal(result.rating,null);
  r.rounds[0].deaths=undefined;const legacy=summarizeArea([r.rounds[0]],{area,map,level:upper,time:0,players:['steam:1']});assert.equal(legacy.combatComplete,false);
});
test('Optional replay performance survives validation and the per-player movement cache',async()=>{
  const r=await fixture(),{validateReplay}=await import('../frontend/features/analyzer/state/replay.mjs');
  const {createMovementCache,movementSelection}=await import('../frontend/features/analyzer/state/movement-cache.mjs');
  const {summarizeRound}=await import('../frontend/features/analyzer/state/server.mjs');
  r.rounds[0].performance=[{player:'steam:1',kills:3,deaths:0,assists:1,damage:180,kast:1}];
  const validated=validateReplay(r),index={...r,capture:'capture',rounds:r.rounds.map(summarizeRound)},cache=createMovementCache();
  const plan=movementSelection([index],[`${r.match_uid}:1`],['steam:1']);cache.pin(plan);cache.put(index,validated.rounds,['steam:1']);
  assert.deepEqual(cache.read(plan)[0].performance,r.rounds[0].performance);
  r.rounds[0].performance[0].kast=2;assert.throws(()=>validateReplay(r),/performance/);
});

test('Multiple teammates inside a box do not multiply a round’s win-rate weight',async()=>{
  const {summarizeArea}=await api(),r=await fixture();r.rounds=r.rounds.slice(0,2);
  r.rounds[1].context.forEach(c=>{if(c.player!=='steam:3')c.result='loss';});
  r.rounds[1].tracks[1].samples.forEach(s=>s[1]=1000);
  const result=summarizeArea(r.rounds,{area,map,level:upper,time:0,players:['steam:1','steam:2']});
  assert.equal(result.observations,3);assert.equal(result.count,2);assert.equal(result.winRate,50);
});
