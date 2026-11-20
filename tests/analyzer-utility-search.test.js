const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const api=()=>import('../frontend/features/analyzer/state/utility-search.mjs');
const scopes=[{capture:'cap',rounds:[1,29]}],players=['steam:1'];
const hit={capture:'cap',round:1,event:5,match_id:1,player:'steam:1',side:3,type:'Fire',icon:'incgrenade',time:5000,x:500,y:800,z:0,enemy_damage:45,attribution:'capture'};
test('HE, flashes, Molotovs and incendiaries use one bounded search with meaningful metric units',async()=>{
  const {utilityQuery,UTILITY_SEARCH_TYPES}=await api();assert.ok(UTILITY_SEARCH_TYPES.some(([key,label])=>key==='Fire'&&label.includes('incendiary')));
  assert.equal(utilityQuery(scopes,players,{type:'HE',metric:'damage',minimum:'40'}).minimum,40);
  assert.equal(utilityQuery(scopes,players,{type:'Fire',metric:'damage',minimum:'40'}).minimum,40);
  assert.equal(utilityQuery(scopes,players,{type:'Flash',metric:'blind_ms',minimum:'1.5'}).minimum,1500);
  assert.throws(()=>utilityQuery(scopes,players,{type:'Fire',metric:'enemies',minimum:'1'}),/minimum/);
  assert.throws(()=>utilityQuery(scopes,players,{type:'HE',metric:'damage',minimum:'-1'}),/minimum/);
  assert.throws(()=>utilityQuery([],players,{type:'HE',metric:'damage',minimum:'40'}),/Select saved/);
});
test('Search scopes preserve the exact capture and round, including overtime',async()=>{
  const {utilityScopes}=await api(),replays=[{capture:'cap',match_uid:'uid',rounds:[{number:1},{number:29}]},{capture:'other',match_uid:'other',rounds:[{number:1}]}];
  assert.deepEqual(utilityScopes(replays,['uid:29']),[{capture:'cap',rounds:[29]}]);
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
test('Searching automatically prepares old captures and collects every page without a movement request',async()=>{
  const {searchUtility,utilityQuery}=await api(),query=utilityQuery(scopes,players,{type:'Fire',metric:'damage',minimum:'40'}),requests=[];
  const found=await searchUtility(query,async q=>{requests.push(q);return requests.length===1?{rows:[],total:0,unknown:0,pending_captures:['cap'],offset:q.offset,limit:q.limit}:
    {rows:Array.from({length:q.offset?25:100},(_,i)=>({...hit,event:q.offset+i})),total:125,unknown:3,pending_captures:[],offset:q.offset,limit:q.limit};});
  assert.equal(found.rows.length,125);assert.deepEqual(requests.map(q=>[q.offset,q.limit]),[[0,100],[0,100],[100,100]]);assert.equal(found.type,'Fire');
});
test('Search refuses stuck preparation, truncated pages, duplicate events, and excessive marker counts',async()=>{
  const {searchUtility,utilityQuery}=await api(),query=utilityQuery(scopes,players,{type:'Fire',metric:'damage',minimum:'40'}),page=q=>({rows:[],total:0,unknown:0,pending_captures:[],offset:q.offset,limit:q.limit});
  await assert.rejects(searchUtility(query,async q=>({...page(q),pending_captures:['cap']})),/could not finish/);
  await assert.rejects(searchUtility(query,async q=>({...page(q),total:10})),/changed/);
  await assert.rejects(searchUtility(query,async q=>({...page(q),total:5001})),/Too many/);
  await assert.rejects(searchUtility(query,async q=>({...page(q),rows:[hit],total:2})),/changed/);
});
test('Aborting a utility search never applies a late response',async()=>{
  const {searchUtility,utilityQuery}=await api(),query=utilityQuery(scopes,players,{type:'Fire',metric:'damage',minimum:'40'}),controller=new AbortController();let calls=0;
  await assert.rejects(searchUtility(query,async q=>{calls++;controller.abort();return {rows:[hit],total:1,unknown:0,pending_captures:[],offset:q.offset,limit:q.limit};},{signal:controller.signal}),{name:'AbortError'});assert.equal(calls,1);
});
test('Result maps show exact matching grenades, retain identities and metadata, and never invent combat statistics',async()=>{
  const {utilityResultRounds,utilityResultDisplay}=await api(),replays=[{capture:'cap',match_uid:'uid',rounds:[{number:1,duration:9000,winner:'CT',context:[{player:'steam:1',side:3,result:'win'}]},{number:29,duration:12000,winner:'T',context:[]}]}];
  const rounds=utilityResultRounds(replays,[hit,{...hit,event:6},{...hit,round:29,event:2}]);
  assert.equal(rounds.length,2);assert.equal(rounds[0].utility.length,2);assert.equal(rounds[0].utility[0].event_number,5);assert.equal(rounds[0].utility[0].effectiveness.enemy_damage,45);assert.equal(rounds[0].match_uid,'uid');assert.equal(rounds[1].number,29);assert.equal(Math.max(...rounds.map(r=>r.duration)),12000);
  assert.equal(rounds[0].deaths,undefined);assert.deepEqual(rounds[0].tracks,[]);assert.equal(rounds[0].context[0].result,'win');assert.deepEqual(utilityResultDisplay('Fire').utilities,['Fire']);assert.deepEqual(utilityResultDisplay('Fire').utilityLayers,['History']);assert.equal(utilityResultDisplay('Fire').players,false);
  const {summarizeArea}=await import('../frontend/features/analyzer/state/area-selection.mjs'),{utilityKeys}=await import('../frontend/features/analyzer/state/map-selection.mjs');
  const summary=summarizeArea(rounds,{players:['steam:1'],selection:[{roundKey:'uid:1',player:'steam:1',side:3,utilities:utilityKeys(rounds[0])}]});
  assert.equal(summary.count,1);assert.equal(summary.observations,1);assert.equal(summary.utility.count,2);assert.equal(summary.combatComplete,false);assert.equal(summary.rating,null);assert.equal(summary.winRate,100);
});

test('Utility indexing and result paging report progress without publishing partial results',async()=>{
  const {searchUtility,utilityQuery}=await api(),query=utilityQuery([{capture:'cap',rounds:[1]},{capture:'other',rounds:[1]}],players,{type:'Fire',metric:'damage',minimum:'40'}),progress=[];let calls=0;
  const result=await searchUtility(query,async q=>++calls===1?{rows:[],total:0,unknown:0,pending_captures:['other'],offset:q.offset,limit:q.limit}:{rows:[hit],total:1,unknown:0,pending_captures:[],offset:q.offset,limit:q.limit},{onProgress:p=>progress.push(p)});
  assert.deepEqual(progress,[{phase:'indexing',complete:1,total:2},{phase:'results',complete:1,total:1}]);assert.equal(result.rows.length,1);
});
test('A stalled utility request times out, aborts its transport and permits a clean retry',async()=>{
  const {searchUtility,utilityQuery}=await api(),query=utilityQuery(scopes,players,{type:'Fire',metric:'damage',minimum:'40'});let signal;
  await assert.rejects(searchUtility(query,(q,options)=>{signal=options.signal;return new Promise(()=>{});},{requestTimeout:10}),/timed out.*indexing is saved/);assert.equal(signal.aborted,true);
  const result=await searchUtility(query,async q=>({rows:[hit],total:1,unknown:0,pending_captures:[],offset:q.offset,limit:q.limit}));assert.equal(result.total,1);
});
test('Cancelling settles a hung request even when the transport ignores abort',async()=>{
  const {searchUtility,utilityQuery}=await api(),query=utilityQuery(scopes,players,{type:'Fire',metric:'damage',minimum:'40'}),controller=new AbortController();let started,transportSignal;
  const ready=new Promise(resolve=>{started=resolve;}),search=searchUtility(query,async(q,{signal})=>{transportSignal=signal;started();return new Promise(()=>{});},{signal:controller.signal});
  await ready;controller.abort();await assert.rejects(search,{name:'AbortError'});assert.equal(transportSignal.aborted,true);
});
