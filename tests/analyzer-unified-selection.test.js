const {test}=require('node:test'),assert=require('node:assert/strict');
const api=()=>import('../frontend/features/analyzer/state/map-selection.mjs');
const summary=()=>import('../frontend/features/analyzer/state/area-selection.mjs');
const map={pos_x:0,pos_y:0,scale:1},level={min:-100,max:100};
const flash=(player,x=100)=>({player,type:'Flash',side:3,time:100,end:200,x,y:0,z:0,effectiveness:{enemies_flashed:2,enemy_blind_ms:1000,enemy_damage:null}});
function round(uid='one') {return {match_uid:uid,number:1,duration:1000,winner:'CT',
  tracks:['a','b'].map((player,i)=>({player,samples:[[0,i*300,0,0,1,3],[500,i*300+50,0,0,1,3]]})),
  deaths:[{time:200,killer:'a',victim:'b',killer_side:3,victim_side:2,from:[0,0,0],x:300,y:0,z:0,weapon:'ak47'}],utility:[flash('a')],
  performance:[{player:'a',kills:2,deaths:0,assists:1,damage:100,kast:1},{player:'b',kills:0,deaths:1,assists:0,damage:20,kast:0}]};}
const options={map,level,time:500,players:['a','b'],utilities:['Flash','Fire'],layers:['Kills','Deaths'],allSelected:true};
test('One box selects living players, killers, victims and expired grenades together',async()=>{
  const {selectionCandidates,candidatesInArea,mergeSelection}=await api(),{summarizeArea}=await summary(),r=round();
  const candidates=selectionCandidates([r,{...r,match_uid:'empty',tracks:[],deaths:[],utility:[]}],options);assert.deepEqual(new Set(candidates.map(i=>i.kind)),new Set(['player','kill','death','utility']));
  const items=mergeSelection([],candidatesInArea(candidates,{left:-20,right:350,top:-10,bottom:10}));
  const result=summarizeArea([r],{players:['a','b'],selection:items});
  assert.equal(result.count,1);assert.equal(result.observations,2);assert.equal(result.kills,2);assert.equal(result.deaths,1);assert.equal(result.utility.count,1);assert.deepEqual(result.utility.metrics[0],['Enemies / flash','2.00']);
});
test('Clicks select exact actors, additive gestures union actors and grenades without multiplying outcomes',async()=>{
  const {selectionCandidates,mergeSelection,entrySelected}=await api(),{summarizeArea}=await summary(),r=round();
  r.utility.push(flash('a',200));const candidates=selectionCandidates([r],options),player=candidates.find(i=>i.kind==='player'),grenades=candidates.filter(i=>i.kind==='utility');
  let selected=mergeSelection([],[player.entry]);assert.equal(entrySelected(grenades[0].entry,selected),false);
  selected=mergeSelection(selected,grenades.map(i=>i.entry),true);selected=mergeSelection(selected,candidates.filter(i=>i.entry.player==='a').map(i=>i.entry),true);
  const result=summarizeArea([r],{players:['a','b'],selection:selected});assert.equal(result.observations,1);assert.equal(result.kills,2);assert.equal(result.count,1);assert.equal(result.utility.count,2);assert.equal(entrySelected(player.entry,selected),true);
  assert.equal(mergeSelection(selected,[],true).length,1);assert.equal(mergeSelection(selected,[]).length,0);
  const onlyB=mergeSelection(selected,[candidates.find(i=>i.entry.player==='b').entry]);assert.equal(onlyB.length,1);assert.equal(onlyB[0].player,'b');assert.deepEqual(onlyB[0].utilities,[]);
});
test('Snapshots remain fixed across time, floors and multiple match identities',async()=>{
  const {selectionCandidates,mergeSelection}=await api(),{summarizeArea}=await summary(),a=round(),b=round('two');
  let selected=mergeSelection([],selectionCandidates([a],options).filter(i=>i.kind==='utility').map(i=>i.entry));
  b.utility[0].z=-200;selected=mergeSelection(selected,selectionCandidates([b],{...options,level:{min:-300,max:-100}}).map(i=>i.entry),true);
  a.tracks.forEach(t=>t.samples.forEach(s=>s[1]+=500));
  const result=summarizeArea([a,b],{players:['a','b'],time:0,selection:selected});assert.equal(result.count,2);assert.equal(result.observations,2);assert.equal(result.utility.count,2);
  assert.equal(summarizeArea([a],{players:['a','b'],selection:selected}).count,1);
});
test('Grenade identities survive another player being filtered out and keep truly identical throws distinct',async()=>{
  const {selectionCandidates,mergeSelection,utilityKeys}=await api(),{summarizeArea}=await summary(),r=round();
  r.utility=[flash('b'),flash('a'),flash('a')];const selected=mergeSelection([],selectionCandidates([r],options).filter(i=>i.kind==='utility'&&i.entry.player==='a').map(i=>i.entry));
  const filtered={...r,utility:r.utility.filter(e=>e.player==='a')};assert.equal(new Set(utilityKeys(filtered)).size,2);
  const result=summarizeArea([filtered],{players:['a'],selection:selected});assert.equal(result.utility.count,2);assert.equal(result.observations,1);
});
test('Candidate hits respect drawn combat offsets, enabled layers, side, floor and event time',async()=>{
  const {selectionCandidates,candidatesInArea}=await api(),r=round();r.deaths[0].x=0;
  const marks=selectionCandidates([r,round('two')],options),kill=marks.find(m=>m.kind==='kill'),death=marks.find(m=>m.kind==='death');assert.equal(kill.x,-18);assert.equal(death.x,18);
  assert.ok(candidatesInArea(marks,{left:-20,right:-16,top:-2,bottom:2}).some(e=>e.player==='a'));
  assert.ok(selectionCandidates([r],{...options,time:0}).every(i=>i.kind==='player'));
  assert.equal(selectionCandidates([r],{...options,side:2}).filter(i=>i.kind==='utility').length,0);
  assert.equal(selectionCandidates([r],{...options,level:{min:100,max:200}}).length,0);
  assert.ok(selectionCandidates([r,round('two')],{...options,layers:[],utilities:[]}).every(i=>i.kind==='player'));
});
