const {test}=require('node:test'),assert=require('node:assert/strict');
const instances=()=>import('../frontend/features/analyzer/state/instances.mjs');
const fixture=async()=>{const {replayFixture}=await import('./fixtures/analyzer.mjs');return replayFixture('instances');};
const options={map:{pos_x:0,pos_y:0,scale:1},level:{min:-100,max:100},time:200,players:['steam:1','steam:2'],utilities:['Flash'],layers:['Kills','Deaths']};
test('Focus restricts each player instance even when every round remains selected',async()=>{
  const {rosterIndex,instanceFocus,rosterPlayers}=await instances(),{selectionCandidates}=await import('../frontend/features/analyzer/state/map-selection.mjs'),r=await fixture();
  const chosen=r.rounds.map((round,i)=>({roundKey:`${r.match_uid}:${round.number}`,player:i%2?'steam:2':'steam:1'}));
  const rosters=rosterIndex([r],options.players,{focus:instanceFocus(chosen)});
  const rounds=r.rounds.map(round=>({...round,match_uid:r.match_uid}));
  for(const [i,round]of rounds.entries())assert.deepEqual(rosterPlayers(rosters.get(`${r.match_uid}:${round.number}`)),[i%2?'steam:2':'steam:1']);
  const cells=selectionCandidates(rounds,{...options,rosters});assert.equal(cells.filter(i=>i.kind==='player').length,4);
  const {summarizeArea}=await import('../frontend/features/analyzer/state/area-selection.mjs');const result=summarizeArea(rounds,{players:options.players,selection:chosen,rosters});assert.equal(result.count,4);assert.equal(result.observations,4);assert.equal(result.instances.length,4);
  const restored=selectionCandidates(rounds,options);assert.equal(restored.filter(i=>i.kind==='player').length,8);
});
test('Opponent cells follow per-round teams through half swaps and roster changes',async()=>{
  const {roundRoster}=await instances(),r=await fixture();
  assert.deepEqual(roundRoster(r,r.rounds[0],['steam:1'],{enemies:true}),{primary:['steam:1'],enemies:['steam:3']});
  r.rounds[1].context.forEach(c=>c.side=c.side===3?2:3);
  assert.deepEqual(roundRoster(r,r.rounds[1],['steam:1'],{enemies:true}).enemies,['steam:3']);
  r.rounds[2].context[1].side=2;r.rounds[2].context[2].side=3;
  assert.deepEqual(roundRoster(r,r.rounds[2],['steam:1'],{enemies:true}).enemies,['steam:2']);
  assert.deepEqual(roundRoster(r,r.rounds[0],['steam:1']).enemies,[]);
  assert.deepEqual(roundRoster(r,r.rounds[0],['steam:1','steam:3'],{enemies:true}).enemies,['steam:2']);
});
test('CT/T filtering keeps the opposing enemy cells and does not use enemies to widen round filters',async()=>{
  const {rosterIndex}=await instances(),{selectionCandidates}=await import('../frontend/features/analyzer/state/map-selection.mjs'),r=await fixture();
  const rosters=rosterIndex([r],['steam:1'],{enemies:true,side:3}),rounds=r.rounds.map(round=>({...round,match_uid:r.match_uid}));
  const cells=selectionCandidates(rounds,{...options,players:['steam:1'],side:3,rosters});
  assert.equal(cells.filter(p=>p.kind==='player'&&p.entry.player==='steam:3').length,4);
  assert.ok(cells.filter(p=>p.kind==='player'&&p.enemy).every(p=>p.entry.side===2));
  const {groupRoundKeys}=await import('../frontend/features/analyzer/state/query.mjs');r.rounds.forEach(round=>round.context[0].result='loss');
  assert.equal(groupRoundKeys([r],{},{players:['steam:1'],result:'win'}).length,0);
});
test('Hidden cells and lingering utility remove matching hit targets while active grenades remain selectable',async()=>{
  const {selectionCandidates}=await import('../frontend/features/analyzer/state/map-selection.mjs'),r=await fixture(),round={...r.rounds[0],match_uid:r.match_uid};
  round.utility=[{player:'steam:1',type:'Flash',time:0,end:100,x:0,y:0,z:0,side:3},{player:'steam:1',type:'Flash',time:150,end:400,x:5,y:0,z:0,side:3}];
  const permanent=selectionCandidates([round],{...options,showPlayers:false});assert.ok(permanent.every(i=>i.kind!=='player'));assert.equal(permanent.filter(i=>i.kind==='utility').length,2);
  const lingering=selectionCandidates([round],{...options,permanentUtility:false});assert.equal(lingering.filter(i=>i.kind==='utility').length,1);
  assert.equal(lingering.find(i=>i.kind==='utility').effect.time,150);
});
test('Asymmetric player-round movement plans reuse cached slices for focusing and restoring',async()=>{
  const {rosterIndex,rosterPlayers,instanceFocus}=await instances(),{movementSelection,createMovementCache}=await import('../frontend/features/analyzer/state/movement-cache.mjs'),{summarizeRound,loadSelectedRounds}=await import('../frontend/features/analyzer/state/server.mjs');
  const r=await fixture(),index={...r,capture:'cap',rounds:r.rounds.map(summarizeRound)},keys=index.rounds.map(round=>`${r.match_uid}:${round.number}`),cache=createMovementCache();
  const full=movementSelection([index],keys,options.players);cache.pin(full);cache.put(index,r.rounds,options.players);
  const focus=instanceFocus(keys.map((roundKey,i)=>({roundKey,player:i%2?'steam:2':'steam:1'}))),rosters=rosterIndex([index],options.players,{focus}),playersForRound=(replay,round)=>rosterPlayers(rosters.get(`${replay.match_uid}:${round.number}`));
  const plan=movementSelection([index],keys,options.players,{playersForRound});assert.equal(plan.length,2);assert.ok(plan.every(job=>job.players.length===1));
  const result=await loadSelectedRounds([index],keys,options.players,{cache,playersForRound},()=>{throw new Error('Focused movement must already be cached');});
  assert.equal(result.length,4);assert.ok(result.every(round=>round.tracks.length===1));
  assert.ok(cache.read(full).every(round=>round.tracks.length===2));
});
test('Old indexes can resolve enemies using match rosters without confusing missing team IDs',async()=>{
  const {roundRoster}=await instances(),r=await fixture();r.teams={'steam:1':0,'steam:2':0,'steam:3':1};const round={};
  assert.deepEqual(roundRoster(r,round,['steam:1'],{enemies:true}).enemies,['steam:3']);delete r.teams['steam:3'];assert.deepEqual(roundRoster(r,round,['steam:1'],{enemies:true}).enemies,[]);
});
