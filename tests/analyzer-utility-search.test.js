const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const api=()=>import('../frontend/features/analyzer/state/utility-search.mjs');
const scopes=[{capture:'cap',rounds:[1,29]}],players=['steam:1'];
const hit={capture:'cap',round:1,event:5,match_id:1,player:'steam:1',side:3,type:'Fire',icon:'incgrenade',time:5000,enemy_damage:45,attribution:'capture'};
test('HE, flashes, Molotovs and incendiaries use one bounded search with meaningful metric units',async()=>{
  const {utilityQuery,UTILITY_SEARCH_TYPES}=await api();assert.ok(UTILITY_SEARCH_TYPES.some(([key,label])=>key==='Fire'&&label.includes('incendiary')));
  assert.equal(utilityQuery(scopes,players,{type:'HE',metric:'damage',minimum:'40'}).minimum,40);
  assert.equal(utilityQuery(scopes,players,{type:'Fire',metric:'damage',minimum:'40'}).minimum,40);
  assert.equal(utilityQuery(scopes,players,{type:'Flash',metric:'blind_ms',minimum:'1.5'}).minimum,1500);
  assert.throws(()=>utilityQuery(scopes,players,{type:'Fire',metric:'enemies',minimum:'1'}),/minimum/);
  assert.throws(()=>utilityQuery(scopes,players,{type:'HE',metric:'damage',minimum:'-1'}),/minimum/);
  assert.throws(()=>utilityQuery([],players,{type:'HE',metric:'damage',minimum:'40'}),/Select saved/);
});
test('Search scopes and replay targets preserve the exact capture and round, including overtime',async()=>{
  const {utilityScopes,utilityWatchKey}=await api(),replays=[{capture:'cap',match_uid:'uid',rounds:[{number:1},{number:29}]},{capture:'other',match_uid:'other',rounds:[{number:1}]}];
  assert.deepEqual(utilityScopes(replays,['uid:29']),[{capture:'cap',rounds:[29]}]);assert.equal(utilityWatchKey(replays,{capture:'cap',round:29}),'uid:29');assert.equal(utilityWatchKey(replays,{capture:'cap',round:30}),null);
});
test('Search pages reject results outside the filtered scopes or players and preserve unknown coverage',async()=>{
  const {utilityQuery,validateUtilityPage}=await api(),query=utilityQuery(scopes,players,{type:'Fire',metric:'damage',minimum:'40'}),page={rows:[hit],total:1,unknown:3,pending_captures:[],offset:0,limit:50};
  assert.equal(validateUtilityPage(page,query).unknown,3);assert.throws(()=>validateUtilityPage({...page,rows:[{...hit,capture:'other'}]},query),/changed/);assert.throws(()=>validateUtilityPage({...page,rows:[{...hit,player:'other'}]},query),/changed/);
  assert.throws(()=>validateUtilityPage({...page,rows:[hit,hit]},query),/changed/);
});
test('Stable grenade event numbers survive replay validation and movement cache slicing',async()=>{
  const {replayFixture}=await import('./fixtures/analyzer.mjs'),r=replayFixture(),{validateReplay}=await import('../frontend/features/analyzer/state/replay.mjs');
  r.rounds[0].utility=[{type:'Fire',player:'steam:1',side:3,time:100,end:500,x:0,y:0,z:0,icon:'incgrenade',radius:120,estimated:false,event_number:5,effectiveness:{enemy_damage:45,enemies_flashed:null,enemy_blind_ms:null}}];
  const valid=validateReplay(r);assert.equal(valid.rounds[0].utility[0].event_number,5);
  const {createMovementCache,movementSelection}=await import('../frontend/features/analyzer/state/movement-cache.mjs'),{summarizeRound}=await import('../frontend/features/analyzer/state/server.mjs'),index={...valid,capture:'cap',rounds:valid.rounds.map(summarizeRound)},cache=createMovementCache(),plan=movementSelection([index],[`${r.match_uid}:1`],['steam:1']);cache.pin(plan);cache.put(index,valid.rounds,['steam:1']);assert.equal(cache.read(plan)[0].utility[0].event_number,5);
  r.rounds[0].utility[0].event_number=-1;assert.throws(()=>validateReplay(r),/identity/);
});
test('A zero-duration flash report does not count as an enemy blinded',()=>{
  const self={};vm.runInNewContext(fs.readFileSync('js/replay-capture.js','utf8'),{self});const c=new self.NickStatsReplayCapture(),r=c.getRound(0),e=c.effect(r,100,{type:'Flash',entity:1,player:'p',side:3,x:0,y:0,z:0});
  c.outcome('flash',100,0,.001,{player:'p',victim:'v',type:'Flash',entity:1,duration:0});assert.equal(c.effectiveness(r,1000).get(e).enemies_flashed,0);
});
