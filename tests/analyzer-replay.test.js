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
  assert.throws(()=>c.sample(1,1,1/64,()=>[{id:'1'}]),/capture limit/);
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
