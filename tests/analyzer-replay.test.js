const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const load = () => import('../frontend/features/analyzer/state/replay.mjs');
const fixture = () => ({ format:'nickstats.replay',version:1,coordinate_system:'source2-world',sample_hz:5,
  match_uid:'demo:one',map:'de_mirage',source_file:'example.dem.zst',players:[{id:'steam:1',name:'Player',steam_id:'1'}],
  rounds:[{number:1,duration:1000,winner:'CT',tracks:[{player:'steam:1',samples:[[0,0,0,0,100,2],[200,20,30,0,100,2],[400,40,60,0,0,2]]}],
    utility:[{time:300,type:'Smoke',player:'steam:1',x:25,y:35,z:0}]}] });

test('replay validation round trips captures and rejects invalid coordinates, ownership, order and versions', async()=>{
  const {validateReplay}=await load(); assert.deepEqual(validateReplay(fixture()),fixture());
  for (const mutate of [r=>r.version=2,r=>r.players.push(r.players[0]),r=>r.rounds[0].tracks[0].samples[1][0]=0,
    r=>r.rounds[0].tracks[0].samples[0][1]=Infinity,r=>r.rounds[0].tracks[0].samples[0][3]=999999,
    r=>r.rounds[0].utility[0].player='missing',r=>r.rounds[0].duration=-1,r=>r.rounds[0].tracks[0].samples[0][5]=1]) {
    const replay=fixture(); mutate(replay); assert.throws(()=>validateReplay(replay),/Invalid replay/);
  }
});
test('interpolation respects death, gaps, teleports and round bounds',async()=>{
  const {positionAt,sampleIndex}=await load(); const s=fixture().rounds[0].tracks[0].samples;
  assert.equal(sampleIndex(s,-1),-1); assert.equal(sampleIndex(s,200),1);
  assert.deepEqual(positionAt(s,100),[100,10,15,0,100,2]);
  assert.equal(positionAt(s,-1),null); assert.equal(positionAt(s,400),null); assert.equal(positionAt(s,1000),null);
  assert.deepEqual(positionAt([[0,0,0,0,100,2],[200,999,999,0,100,2]],100),[0,0,0,0,100,2]);
  assert.equal(positionAt([[0,0,0,0,100,2],[1000,10,10,0,100,2]],700),null);
});
test('radar calibration and floor thresholds use Source world coordinates',async()=>{
  const {worldToRadar,onLevel}=await load();
  assert.deepEqual(worldToRadar({pos_x:-3230,pos_y:1713,scale:5},-2730,1213),[100,100]);
  assert.equal(onLevel({min:-495,max:10000},-495),true); assert.equal(onLevel({min:-10000,max:-495},-495),false);
});
function collector() {
  const context=vm.createContext({self:{}}); vm.runInContext(fs.readFileSync('js/replay-capture.js','utf8'),context);
  return new context.self.NickStatsReplayCapture();
}
test('capture samples at 5Hz, isolates rounds, excludes incomplete rounds and normalizes utility owners',async()=>{
  const c=collector(), p={id:'steam:1',name:'Player',steam_id:'1',x:-500,y:0,z:200,health:100,side:2};
  let reads=0; const read=()=>{reads++;return [p]};
  c.sample(64,64,1/64,read); c.sample(65,64,1/64,read); c.sample(77,64,1/64,read);
  c.sample(140,128,1/64,read);
  c.utility('smokegrenade_detonate',80,64,1/64,{x:0,y:1,z:2},'missing');
  c.utility('weapon_fire',80,64,1/64,{x:0,y:1,z:2},'steam:1');
  const result={...fixture(),round_timing:[{round:1,live_start_tick:64,duration_ms:500,winner_side:'CT'}]};
  const replay=JSON.parse(JSON.stringify(c.finish(result))); assert.equal(reads,3);
  assert.equal(replay.rounds.length,1); assert.equal(replay.rounds[0].tracks[0].samples.length,2);
  assert.equal(replay.rounds[0].utility.length,1); assert.equal(replay.rounds[0].utility[0].player,null);
  (await load()).validateReplay(replay);
  c.reset(); assert.throws(()=>c.finish(result),/No playable/);
});
test('capture limits fail explicitly rather than silently returning partial tracks',()=>{
  const c=collector();c.samples=1000000;
  assert.throws(()=>c.sample(1,1,1/64,()=>[{id:'1',name:'Player',steam_id:null,x:0,y:0,z:0,health:100,side:2}]),/capture limit/);
});
test('replay coordinate decoder handles signed world space and missing fields',()=>{
  const context=vm.createContext({self:{deadem:{cs2:{}},addEventListener(){},postMessage(){}},importScripts(){}});
  vm.runInContext(fs.readFileSync('js/demo-worker.js','utf8'),context);
  const position=vm.runInContext(`replayWorldPosition({getField(field){return ({
    'CBodyComponent.m_skeletonInstance.m_vecOrigin.m_cellX':31,
    'CBodyComponent.m_skeletonInstance.m_vecOrigin.m_cellY':32,
    'CBodyComponent.m_skeletonInstance.m_vecOrigin.m_cellZ':32,
    'CBodyComponent.m_skeletonInstance.m_vecOrigin.m_vecX':12,
    'CBodyComponent.m_skeletonInstance.m_vecOrigin.m_vecY':34,
    'CBodyComponent.m_skeletonInstance.m_vecOrigin.m_vecZ':56})[field]}})`,context);
  assert.deepEqual(JSON.parse(JSON.stringify(position)),{x:-500,y:34,z:56});
  assert.equal(vm.runInContext('replayWorldPosition({getField(){return undefined}})',context),null);
});

test('local file import waits for worker readiness, opts into replay capture, and terminates on completion',async()=>{
  const {openReplayFile}=await import('../frontend/features/analyzer/state/files.mjs');
  const original=global.Worker;let worker;
  global.Worker=class {
    constructor(url){this.url=url;worker=this;queueMicrotask(()=>this.onmessage({data:{type:'ready'}}));}
    postMessage(message,transfer){this.request=message;this.transfer=transfer;queueMicrotask(()=>this.onmessage({data:{type:'result',replay:fixture()}}));}
    terminate(){this.stopped=true;}
  };
  try {
    const controller=new AbortController(),data=new ArrayBuffer(8);
    const replay=await openReplayFile({name:'match.dem.zst',size:8,arrayBuffer:async()=>data},{signal:controller.signal});
    assert.equal(replay.match_uid,'demo:one'); assert.equal(worker.request.captureReplay,true);
    assert.equal(worker.request.compression,'zstd');assert.equal(worker.transfer[0],data);assert.equal(worker.stopped,true);
  } finally {global.Worker=original;}
});
test('cancelled imports terminate the parsing worker and invalid files never start one',async()=>{
  const {openReplayFile}=await import('../frontend/features/analyzer/state/files.mjs');
  const original=global.Worker;let worker;
  global.Worker=class {constructor(){worker=this;} terminate(){this.stopped=true;}};
  try {
    const controller=new AbortController();
    const pending=openReplayFile({name:'match.dem',size:8,arrayBuffer:async()=>new ArrayBuffer(8)},{signal:controller.signal});
    await new Promise(resolve=>setImmediate(resolve));controller.abort();
    await assert.rejects(pending,{name:'AbortError'});assert.equal(worker.stopped,true);
    worker=null;
    await assert.rejects(()=>openReplayFile({name:'bad.txt',size:8},{signal:new AbortController().signal}),/Choose a/);
    await assert.rejects(()=>openReplayFile({name:'bad.json',size:129*1024*1024},{signal:new AbortController().signal}),/too large/);
    assert.equal(worker,null);
  } finally {global.Worker=original;}
});
test('ordinary stats requests retain their result and never import the replay collector',async()=>{
  const messages=[],imports=[];let listener;
  const context=vm.createContext({self:{deadem:{cs2:{}},addEventListener(type,fn){listener=fn;},postMessage(m){messages.push(m);}},
    importScripts(url){imports.push(url);}});
  vm.runInContext(fs.readFileSync('js/demo-worker.js','utf8'),context);
  vm.runInContext('parseDemo = async function(name, buffer, capture){return {result:{match_uid:"stats"},diagnostics:{ok:true},replay:capture?{version:1}:null}}',context);
  await listener({data:{type:'parse',name:'test.dem',data:new ArrayBuffer(1)}});
  assert.equal(imports.length,1);assert.equal(messages.at(-1).result.match_uid,'stats');assert.equal('replay' in messages.at(-1),false);
  await listener({data:{type:'parse',name:'test.dem',data:new ArrayBuffer(1),captureReplay:true}});
  assert.match(imports.at(-1),/replay-capture/);assert.equal(messages.at(-1).replay.version,1);assert.equal('result' in messages.at(-1),false);
});

test('round presets combine regulation/overtime with recorded player sides through repeated overtime',async()=>{
  const {presetRounds,roundSections}=await import('../frontend/features/analyzer/state/round-selection.mjs');
  const replay=fixture();replay.rules={regulation_rounds:24,overtime_rounds:6};
  replay.rounds=Array.from({length:60},(_,i)=>({number:i+1,tracks:[{player:'steam:1',samples:[[0,0,0,0,100,(i<24?Math.floor(i/12):Math.floor((i-24)/3))%2?3:2]]}]}));
  assert.equal(presetRounds([replay]).length,60);
  assert.equal(presetRounds([replay],{phase:'regulation',side:2,players:['steam:1']}).length,12);
  assert.equal(presetRounds([replay],{phase:'overtime',side:3,players:['steam:1']}).length,18);
  assert.equal(roundSections(replay).at(-1).label,'OT 6 · half 2');
  replay.rules={regulation_rounds:30,overtime_rounds:10};
  assert.equal(presetRounds([replay],{phase:'regulation'}).length,30);
  assert.equal(roundSections(replay).find(s=>s.key==='ot-1-1').rounds.length,5);
  const long=fixture();long.rounds=Array.from({length:300},(_,i)=>({...long.rounds[0],number:i+1}));
  assert.equal((await load()).validateReplay(long).rounds.length,300);
});
test('inferno entities recover missing legacy starts and ownership, then stop when extinguished',async()=>{
  const c=collector(),player={id:'steam:1',name:'Player',steam_id:'1',x:0,y:0,z:0,health:100,side:2};
  c.sample(64,64,1/64,()=>[player]);
  c.utility('inferno_startburn',70,64,1/64,{entityid:20,x:10,y:20,z:0},null);
  const fire={id:16404,entity:20,effect:true,type:'Fire',icon:'molotov',x:10,y:20,z:0,player:'steam:1',side:2,radius:140,active:true};
  c.observe(72,64,1/64,()=>[fire]);c.observe(128,64,1/64,()=>[fire]);
  c.observe(256,64,1/64,()=>[{...fire,active:false}]);
  const result={...fixture(),round_timing:[{round:1,live_start_tick:64,duration_ms:10000,winner_side:'CT'}]};
  const replay=JSON.parse(JSON.stringify(c.finish(result))),effect=replay.rounds[0].utility[0];
  assert.equal(replay.rounds[0].utility.length,1);assert.equal(effect.player,'steam:1');assert.equal(effect.end,3000);assert.equal(effect.estimated,false);
  assert.equal(effect.radius,140);(await load()).validateReplay(replay);
  const missing=collector();missing.sample(64,64,1/64,()=>[player]);missing.observe(72,64,1/64,()=>[fire]);
  assert.equal(missing.finish(result).rounds[0].utility.length,1);
});
test('smoke expiry and projectile identity survive entity reuse and validate on export/import',async()=>{
  const c=collector(),player={id:'steam:1',name:'Player',steam_id:'1',x:0,y:0,z:0,health:100,side:2};
  c.sample(64,64,1/64,()=>[player]);c.configure('mp_overtime_maxrounds','10');
  const flight={id:100,entity:20,type:'Smoke',icon:'smokegrenade',x:10,y:20,z:0,player:'steam:1',side:2};
  c.observe(64,64,1/64,()=>[flight]);c.observe(68,64,1/64,()=>[{...flight,x:20}]);
  c.utility('smokegrenade_detonate',72,64,1/64,{entityid:20,x:30,y:20,z:0},'steam:1');
  c.observe(72,64,1/64,()=>[{...flight,effect:true,active:true,x:30}]);
  c.utility('smokegrenade_expired',256,64,1/64,{entityid:20},'steam:1');
  c.observe(260,64,1/64,()=>[{...flight,id:200,x:100}]);
  const replay=JSON.parse(JSON.stringify(c.finish({...fixture(),round_timing:[{round:1,live_start_tick:64,duration_ms:10000,winner_side:'CT'}]})));
  assert.equal(replay.rules.overtime_rounds,10);assert.equal(replay.rounds[0].utility[0].end,3000);
  assert.equal(replay.rounds[0].projectiles.length,2);assert.equal(replay.rounds[0].projectiles[0].end,125);
  (await load()).validateReplay(replay);
  const {validateReplay}=await load();
  const malformed=structuredClone(replay);malformed.rounds[0].projectiles[0].samples[0][1]=Infinity;
  assert.throws(()=>(validateReplay(malformed)),/invalid projectile sample/);
});
test('projectile interpolation and effects obey recorded lifetime instead of the old 1.5-second window',async()=>{
  const {effectEnd,projectilePosition,utilityVisible}=await import('../frontend/features/analyzer/state/utility.mjs');
  const p={player:'steam:1',side:2,end:300,samples:[[0,0,0,0],[100,10,20,0],[200,20,40,-600]]};
  assert.deepEqual(projectilePosition(p,50),[50,5,10,0]);assert.equal(projectilePosition(p,300),null);
  assert.equal(effectEnd({type:'Smoke',time:1000,end:18000},20000),18000);
  assert.equal(utilityVisible(p,{},new Set(['steam:1']),2),true);assert.equal(utilityVisible(p,{},new Set(['steam:1']),3),false);
  assert.equal(utilityVisible(p,{},new Set(['steam:2']),0),false);
});
test('inferno geometry reads active fire cells and detects extinguished fires',()=>{
  const context=vm.createContext({self:{deadem:{cs2:{}},addEventListener(){},postMessage(){}},importScripts(){}});
  vm.runInContext(fs.readFileSync('js/demo-worker.js','utf8'),context);
  const state=vm.runInContext(`replayInfernoState({getField(path){return ({m_fireCount:2,'m_bFireIsBurning.0000':true,'m_bFireIsBurning.0001':false,'m_firePositions.0000':[100,0,0]})[path]}},{x:0,y:0,z:0})`,context);
  assert.equal(state.active,true);assert.equal(state.radius,130);
  assert.equal(vm.runInContext(`replayInfernoState({getField(p){return p==='m_fireCount'?1:false}},{x:0,y:0,z:0}).active`,context),false);
});
test('utility drawing keeps smoke/fire areas through their endpoints and leaves only a one-second grenade trail',async()=>{
  const {drawUtility}=await import('../frontend/features/analyzer/state/draw-utility.mjs');
  let arcs=0,lines=0,icons=0;
  const ctx={globalAlpha:1,beginPath(){},arc(){arcs++;},fill(){},stroke(){},moveTo(){},lineTo(){lines++;},drawImage(){icons++;}};
  const round={duration:20000,tracks:[],utility:[{type:'Fire',player:'steam:1',side:2,time:0,end:7000,x:0,y:0,z:0,radius:120},
    {type:'Smoke',player:'steam:1',side:2,time:0,end:18000,x:0,y:0,z:0,radius:144}],
    projectiles:[{id:'1',type:'HE',icon:'hegrenade',player:'steam:1',side:2,end:300,samples:[[0,0,0,0],[100,10,10,0],[200,20,20,0]]}]};
  const options={time:5000,map:{pos_x:0,pos_y:0,scale:5},level:{min:-100,max:100},selected:new Set(['steam:1']),side:0,utilities:['Fire','Smoke','HE'],icons:{hegrenade:{naturalWidth:20,naturalHeight:30}},allSelected:true};
  drawUtility(ctx,round,options);assert.equal(arcs,2);assert.equal(lines,0);
  arcs=0;drawUtility(ctx,round,{...options,time:8000});assert.equal(arcs,1);
  arcs=0;drawUtility(ctx,round,{...options,time:19000});assert.equal(arcs,0);
  drawUtility(ctx,round,{...options,time:250});assert.equal(icons,1);assert.ok(lines>0);
  lines=0;drawUtility(ctx,round,{...options,time:1400});assert.equal(lines,0);
});

test('v3 capture keeps exact event positions, coalesces firing, and round-trips combat data',async()=>{
  const c=collector(),a={id:'steam:1',name:'Attacker',steam_id:'1',x:100,y:0,z:0,health:100,side:2,yaw:90},b={id:'steam:2',name:'Victim',steam_id:'2',x:120,y:30,z:0,health:100,side:3,yaw:null};
  const read=()=>[a,b];c.sample(64,64,1/64,read);
  c.combat('weapon_fire',72,64,1/64,{shooter:a.id},read,'ak47');
  c.combat('weapon_fire',73,64,1/64,{shooter:a.id},read,'ak47');
  c.combat('weapon_fire',80,64,1/64,{shooter:a.id},read,'ak47');
  c.combat('player_death',90,64,1/64,{killer:a.id,victim:b.id},read,'ak47',true);
  const replay=JSON.parse(JSON.stringify(c.finish({...fixture(),round_timing:[{round:1,live_start_tick:64,duration_ms:1000,winner_side:'T'}]})));
  assert.equal(replay.version,3);assert.equal(replay.rounds[0].tracks[0].samples[0][6],90);
  assert.equal(replay.rounds[0].firing[0].samples.length,2);
  assert.deepEqual(replay.rounds[0].deaths[0].from,[100,0,0]);assert.equal(replay.rounds[0].deaths[0].victim,'steam:2');
  const {validateReplay}=await load();validateReplay(replay);
  for(const mutate of [r=>r.rounds[0].tracks[0].samples[0][6]=Infinity,r=>r.rounds[0].deaths[0].killer='missing',r=>r.rounds[0].firing[0].samples[0][4]=999,r=>r.rounds[0].deaths[0].time=-1]){
    const invalid=structuredClone(replay);mutate(invalid);assert.throws(()=>validateReplay(invalid),/Invalid replay/);
  }
  const {measureReplaySize}=await import('../tools/measure-replay-size.mjs');const size=measureReplaySize(replay);
  assert.ok(size.combat_added_bytes>0);assert.equal(size.server_replay_storage_bytes,0);assert.equal(size.firing_samples,2);
});
test('aim interpolates the shortest yaw arc and radar direction reverses world Y',async()=>{
  const {positionAt}=await load(),{aimVector}=await import('../frontend/features/analyzer/state/combat.mjs');
  assert.equal(positionAt([[0,0,0,0,100,2,179],[200,0,0,0,100,2,-179]],100)[6],180);
  assert.equal(positionAt([[0,0,0,0,100,2,null],[200,0,0,0,100,2,90]],100)[6],null);
  const east=aimVector(0),north=aimVector(90);assert.equal(east[0],32);assert.ok(Math.abs(north[0])<0.0001);assert.equal(north[1],-32);
});
test('skulls remain after round end and filters include selected killers or victims, including world/self deaths',async()=>{
  const {drawCombat,deathVisible}=await import('../frontend/features/analyzer/state/combat.mjs');
  const event={time:100,victim:'b',killer:'a',victim_side:3,killer_side:2,x:0,y:0,z:0,from:[100,0,0],weapon:'ak47',headshot:false};
  assert.equal(deathVisible(event,new Set(['a']),2),true);assert.equal(deathVisible(event,new Set(['b']),3),true);
  assert.equal(deathVisible(event,new Set(['a']),3),false);
  assert.equal(deathVisible({...event,killer:null},new Set(['b']),0),true);
  let skulls=0,labels=[];const ctx={globalAlpha:1,beginPath(){},arc(){skulls++;},moveTo(){},lineTo(){},closePath(){},fill(){},stroke(){},setLineDash(){},strokeText(){},fillText(s){labels.push(s);}};
  const options={time:2000,map:{pos_x:0,pos_y:0,scale:5},level:{min:-100,max:100},selected:new Set(['a']),side:0,colors:new Map([['a','red'],['b','blue']]),names:new Map([['a','Attacker'],['b','Victim']]),layers:['Deaths']};
  drawCombat(ctx,{duration:1000,deaths:[event]},options);assert.ok(skulls>0);assert.deepEqual(labels,['Attacker → Victim']);
  skulls=0;drawCombat(ctx,{deaths:[event]},{...options,time:0});assert.equal(skulls,0);
});
test('missing aim stays unavailable and source yaw wraps into a stable signed angle',()=>{
  const context=vm.createContext({self:{deadem:{cs2:{}},addEventListener(){},postMessage(){}},importScripts(){}});
  vm.runInContext(fs.readFileSync('js/demo-worker.js','utf8'),context);
  assert.equal(vm.runInContext('replayAimYaw({getField(){return undefined}})',context),null);
  assert.equal(vm.runInContext('replayAimYaw({getField(){return [0,270,0]}})',context),-90);
});
