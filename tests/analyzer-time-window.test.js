const {test}=require('node:test'),assert=require('node:assert/strict');
const map={pos_x:0,pos_y:0,scale:1},level={min:-100,max:100};
async function fixture(){const {replayFixture}=await import('./fixtures/analyzer.mjs'),replay=replayFixture('window',2);for(const r of replay.rounds){r.duration=5000;r.deaths=[];}replay.rounds[0].deaths=[
  {time:100,victim:'steam:2',killer:'steam:1',victim_side:3,killer_side:2,x:10,y:0,z:0,from:[20,0,0],weapon:'ak47',headshot:false},
  {time:2500,victim:'steam:3',killer:'steam:1',victim_side:3,killer_side:2,x:30,y:0,z:0,from:[40,0,0],weapon:'ak47',headshot:false},
  {time:4000,victim:'steam:1',killer:null,victim_side:2,killer_side:0,x:50,y:0,z:0,from:null,weapon:'world',headshot:false}];return replay.rounds.map(r=>({...r,match_uid:replay.match_uid}));}
const canvas=()=>{const calls=[];return {calls,ctx:new Proxy({},{get:(_,key)=>(...args)=>calls.push([key,...args]),set:()=>true})};};
test('Time handles stay ordered, including equal bounds and seeking the playhead earlier than the start',async()=>{
  const {rangeValues,moveRangeHandle}=await import('../frontend/shared/state/range-slider.mjs');assert.deepEqual(rangeValues(400,200,0,1000),{start:200,end:200});assert.deepEqual(rangeValues(NaN,Infinity,0,1000),{start:0,end:0});
  assert.deepEqual(moveRangeHandle({start:100,end:500},'start',900,0,1000),{start:500,end:500});assert.deepEqual(moveRangeHandle({start:100,end:500},'end',50,0,1000),{start:50,end:50});assert.deepEqual(moveRangeHandle({start:100,end:500},'start',-20,0,1000),{start:0,end:500});
});
test('Visible and selectable kills/deaths share inclusive event-window bounds',async()=>{
  const {selectionCandidates}=await import('../frontend/features/analyzer/state/map-selection.mjs'),{drawCombat}=await import('../frontend/features/analyzer/state/combat.mjs'),{createDisplay}=await import('../frontend/features/analyzer/state/display.mjs'),rounds=await fixture(),display={...createDisplay(),players:false,combat:['Kills','Deaths']};
  const options={map,level,time:3000,startTime:1000,players:['steam:1','steam:2','steam:3'],display};
  const found=selectionCandidates(rounds,options);assert.deepEqual(found.map(c=>[c.kind,c.event.time]),[['kill',2500],['death',2500]]);assert.equal(selectionCandidates(rounds,{...options,startTime:2500,time:2500}).length,2);assert.equal(selectionCandidates(rounds,{...options,startTime:3000}).length,0);
  const {ctx,calls}=canvas();drawCombat(ctx,rounds[0],{...options,selected:new Set(['steam:1']),side:0,colors:new Map(),layers:['Kills']});assert.equal(calls.filter(([name])=>name==='roundRect').length,1);
  const {feedRows}=await import('../frontend/features/analyzer/state/kill-feed.mjs');assert.deepEqual(feedRows(rounds[0].deaths,3000,1000).map(r=>r.event.time),[2500]);
});
test('Hiding an old death marker does not revive a player who died before the window',async()=>{
  const {selectionCandidates}=await import('../frontend/features/analyzer/state/map-selection.mjs'),{createDisplay}=await import('../frontend/features/analyzer/state/display.mjs'),rounds=await fixture();
  const items=selectionCandidates(rounds,{map,level,time:200,startTime:150,players:['steam:1','steam:2','steam:3'],display:createDisplay()});assert.ok(!items.some(item=>item.round.number===1&&item.entry.player==='steam:2'));assert.ok(!items.some(item=>item.kind==='death'));
});
test('Grenade history respects the start while active effects and in-flight grenades retain normal playback visibility',async()=>{
  const {selectionCandidates}=await import('../frontend/features/analyzer/state/map-selection.mjs'),{createDisplay}=await import('../frontend/features/analyzer/state/display.mjs'),{drawUtilityHistory}=await import('../frontend/features/analyzer/state/draw-utility.mjs'),rounds=await fixture();
  rounds[0].utility=[{player:'steam:1',type:'Smoke',side:3,time:100,end:5000,x:0,y:0,z:0},{player:'steam:1',type:'HE',side:3,time:2500,end:2600,x:20,y:0,z:0}];
  rounds[0].projectiles=[{id:'p',type:'Flash',icon:'flashbang',player:'steam:1',side:3,end:3500,samples:[[2900,0,0,0],[3000,10,0,0]]}];
  const options={map,level,time:3000,startTime:1000,players:['steam:1'],display:{...createDisplay(),players:false,combat:[],utilityLayers:['History']}};
  assert.deepEqual(selectionCandidates(rounds,options).map(c=>c.effect.type),['HE']);const {ctx,calls}=canvas();drawUtilityHistory(ctx,rounds[0],{...options,selected:new Set(['steam:1']),side:0,utilities:['Smoke','HE'],icons:{}});assert.equal(calls.filter(([name])=>name==='arc').length,1);
  options.display.utilityLayers=['Live'];assert.deepEqual(selectionCandidates(rounds,options).map(c=>c.effect.type),['Flash','Smoke']);
});
