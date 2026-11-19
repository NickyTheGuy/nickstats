const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const fixture=async()=>{const {replayFixture}=await import('./fixtures/analyzer.mjs');return replayFixture('presentation');};
test('Focus retains enabled opposing context, including their utility with independent display layers',async()=>{
  const {rosterIndex,instanceFocus}=await import('../frontend/features/analyzer/state/instances.mjs'),{createDisplay}=await import('../frontend/features/analyzer/state/display.mjs'),{selectionCandidates}=await import('../frontend/features/analyzer/state/map-selection.mjs'),r=await fixture();
  const round={...r.rounds[0],match_uid:r.match_uid};round.utility=[{type:'Flash',player:'steam:3',side:2,time:0,end:100,x:100,y:0,z:0}];
  const rosters=rosterIndex([r],['steam:1','steam:2'],{enemies:true,focus:instanceFocus([{roundKey:`${r.match_uid}:1`,player:'steam:1'}])});
  assert.deepEqual(rosters.get(`${r.match_uid}:1`),{primary:['steam:1'],enemies:['steam:3']});
  const display=createDisplay(),enemyDisplay={...createDisplay(),players:false,utilityLayers:['History']};
  const options={map:{pos_x:0,pos_y:0,scale:1},level:{min:-100,max:100},time:200,players:['steam:1','steam:2'],rosters,display,enemyDisplay};
  let candidates=selectionCandidates([round],options);assert.ok(!candidates.some(p=>p.kind==='player'&&p.entry.player==='steam:2'));assert.ok(candidates.some(p=>p.kind==='utility'&&p.entry.player==='steam:3'));
  enemyDisplay.utilityLayers=['Live'];candidates=selectionCandidates([round],options);assert.ok(!candidates.some(p=>p.kind==='utility'));assert.ok(candidates.some(p=>p.kind==='player'&&p.entry.player==='steam:1'));
});
test('Single-round kills move to feed/timeline, corpse cells remain and multi-round kill badges remain',async()=>{
  const {combatMarkers}=await import('../frontend/features/analyzer/state/combat.mjs'),{roundCombat,feedRows}=await import('../frontend/features/analyzer/state/kill-feed.mjs'),{createDisplay}=await import('../frontend/features/analyzer/state/display.mjs'),r=await fixture(),round={...r.rounds[0],match_uid:r.match_uid},event=round.deaths[0];
  const opts={selected:new Set(['steam:1','steam:3']),side:0,layers:['Kills','Deaths'],map:{pos_x:0,pos_y:0,scale:1},level:{min:-100,max:100}};
  assert.deepEqual(combatMarkers(event,{...opts,singleRound:true}).map(m=>m.kind),['death']);assert.ok(combatMarkers(event,opts).some(m=>m.kind==='kill'));
  assert.equal(combatMarkers(event,{...opts,layers:[],singleRound:true,cellDeaths:true}).length,1);
  const combat=roundCombat(round,{players:['steam:1','steam:3'],display:createDisplay(),enemyDisplay:createDisplay()});assert.equal(combat.kills.length,1);assert.equal(combat.feed.length,1);
  assert.equal(feedRows(combat.feed,400).length,0);assert.equal(feedRows(combat.feed,500)[0].opacity,1);assert.ok(feedRows(combat.feed,6000)[0].opacity<1);assert.equal(feedRows(combat.feed,6500).length,0);
  const {playerAlive}=await import('../frontend/features/analyzer/state/player-state.mjs');assert.equal(playerAlive(round,'steam:3',499),true);assert.equal(playerAlive(round,'steam:3',500),false);
});
test('Rectangular backing canvas preserves zoomed radar in space beyond the old square bitmap',async()=>{
  const {viewport}=await import('../frontend/features/analyzer/state/viewport.mjs'),{pointerToRadar}=await import('../frontend/features/analyzer/state/area-selection.mjs'),size={width:400,height:900},view={zoom:2,x:0,y:0},frame=viewport(size,view,2);
  assert.equal(frame.width,400);assert.equal(frame.height,900);assert.equal(frame.y-512*frame.scale,50);
  assert.deepEqual(pointerToRadar({x:200,y:50},{left:0,top:0,...size},view),{x:512,y:0});
});
test('Capture stores held-item changes and exact victim blindness; validation/cache retain optional records',async()=>{
  const self={};vm.runInNewContext(fs.readFileSync('js/replay-capture.js','utf8'),{self});const c=new self.NickStatsReplayCapture(),p={id:'steam:1',name:'One',steam_id:'1',x:0,y:0,z:0,health:100,side:3,item:'ak47'};
  c.sample(0,0,.001,()=>[p]);c.sample(200,0,.001,()=>[p]);p.item='c4';c.sample(400,0,.001,()=>[p]);p.item=null;c.sample(600,0,.001,()=>[p]);c.blind(300,0,.001,p.id,2500);c.blind(700,0,.001,p.id,1000);
  const capture=JSON.parse(JSON.stringify(c.finish({match_uid:'one',demo_sha256:'a'.repeat(64),map:'de_mirage',source_file:'test.dem',round_timing:[{round:1,live_start_tick:0,duration_ms:1000,winner_side:'CT'}]})));
  const {validateReplay}=await import('../frontend/features/analyzer/state/replay.mjs'),validated=validateReplay(capture),round=validated.rounds[0];assert.deepEqual(round.equipment[0].samples,[[0,'ak47'],[400,'c4'],[600,null]]);
  const {heldItem,blindRemaining}=await import('../frontend/features/analyzer/state/player-state.mjs');assert.equal(heldItem(round,p.id,300),'ak47');assert.equal(heldItem(round,p.id,400),'c4');assert.equal(heldItem(round,p.id,700),null);assert.equal(blindRemaining(round,p.id,800),2000);assert.equal(blindRemaining(round,p.id,2900),0);
  const {createMovementCache,movementSelection}=await import('../frontend/features/analyzer/state/movement-cache.mjs'),{summarizeRound}=await import('../frontend/features/analyzer/state/server.mjs'),index={...validated,capture:'cap',rounds:validated.rounds.map(summarizeRound)},cache=createMovementCache(),plan=movementSelection([index],['one:1'],[p.id]);cache.pin(plan);cache.put(index,validated.rounds,[p.id]);assert.deepEqual(cache.read(plan)[0].blindness,round.blindness);assert.deepEqual(cache.read(plan)[0].equipment,round.equipment);
  capture.rounds[0].equipment[0].samples[0][1]='../bad';assert.throws(()=>validateReplay(capture),/equipment/);
});
