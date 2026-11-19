const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const plain=value=>JSON.parse(JSON.stringify(value));
function collector(){const self={};vm.runInNewContext(fs.readFileSync('js/replay-capture.js','utf8'),{self});return new self.NickStatsReplayCapture();}
const person=(n=1)=>({id:`steam:${n}`,name:`Player ${n}`,steam_id:String(n),x:n*100,y:0,z:0,health:100,side:n===1?3:2,item:'ak47'});
test('Capture retains post-round movement, combat, equipment, blindness and utility until the transition',async()=>{
  const c=collector(),a=person(),b=person(2),read=()=>[a,b];
  c.beginRound(0,.001);c.sample(0,0,.001,read);c.sample(1000,0,.001,read);
  a.x=300;a.item='flashbang';c.sample(1200,0,.001,read);
  c.utility('flashbang_detonate',1300,0,.001,{entityid:4,x:300,y:0,z:0},a.id);
  c.outcome('flash',1310,0,.001,{player:a.id,victim:b.id,type:'Flash',entity:4,duration:1500});c.blind(1310,0,.001,b.id,1500);
  c.combat('weapon_fire',1400,0,.001,{shooter:a.id},read,'ak47');c.combat('player_death',1500,0,.001,{killer:a.id,victim:b.id},read,'ak47',true);
  b.health=0;c.sample(1600,0,.001,read);c.endRound(1800,.001);
  assert.equal(c.activeStart,null);c.beginRound(5000,.001);c.sample(5000,5000,.001,read);
  const raw=plain(c.finish({match_uid:'post',map:'de_mirage',source_file:'test.dem',demo_sha256:'a'.repeat(64),round_timing:[{round:1,live_start_tick:0,duration_ms:1000,winner_side:'CT'}]}));
  const {validateReplay}=await import('../frontend/features/analyzer/state/replay.mjs'),replay=validateReplay(raw),round=replay.rounds[0];
  assert.equal(round.duration,1800);assert.equal(round.live_duration,1000);assert.equal(round.tracks[0].samples.at(-1)[0],1600);assert.equal(round.deaths[0].time,1500);assert.equal(round.firing[0].samples[0][0],1400);assert.equal(round.blindness[0].time,1310);assert.equal(round.equipment[0].samples.at(-1)[1],'flashbang');assert.equal(round.utility[0].effectiveness.enemies_flashed,1);
  assert.equal(replay.rounds.length,1);assert.ok(round.utility[0].end<=round.duration);
  const {createMovementCache,movementSelection}=await import('../frontend/features/analyzer/state/movement-cache.mjs'),{summarizeRound}=await import('../frontend/features/analyzer/state/server.mjs'),index={...replay,capture:'cap',rounds:replay.rounds.map(summarizeRound)},cache=createMovementCache(),plan=movementSelection([index],['post:1'],[a.id,b.id]);
  cache.pin(plan);cache.put(index,replay.rounds,[a.id,b.id]);assert.equal(cache.read(plan)[0].live_duration,1000);assert.equal(cache.read(plan)[0].deaths[0].time,1500);
  raw.rounds[0].live_duration=1801;assert.throws(()=>validateReplay(raw),/live round duration/);
});
test('EOF keeps the last available post-round time when the final official end is missing',()=>{
  const c=collector();c.beginRound(0,.001);c.sample(0,0,.001,()=>[person()]);c.sample(1234,0,.001,()=>[person()]);
  const round=c.finish({round_timing:[{round:1,live_start_tick:0,duration_ms:1000,winner_side:'CT'}]}).rounds[0];assert.equal(round.duration,1234);assert.equal(round.live_duration,1000);
  c.reset();assert.equal(c.activeStart,null);
});
test('Countdown freezes at live end and the scrubber marks the post-round interval',async()=>{
  const {clockAt,roundSegments,timelineEvents}=await import('../frontend/features/analyzer/state/round-clock.mjs'),round={duration:18000,live_duration:12000,clock:{round_ms:20000,bomb_ms:40000,round_estimated:false,bomb_estimated:false},bomb_events:[]};
  assert.equal(clockAt(round,15000).remaining,8000);assert.equal(clockAt(round,15000).state,'ended');assert.equal(clockAt(round,11000).state,'normal');
  assert.deepEqual(roundSegments(round),[{start:0,end:12000,state:'normal'},{start:12000,end:18000,state:'ended'}]);assert.equal(timelineEvents([],round,[])[0].time,12000);
  round.bomb_events=[{type:'plant',time:14000}];assert.equal(clockAt(round,15000).remaining,8000);assert.equal(roundSegments(round).at(-1).state,'ended');
  round.bomb_events=[{type:'plant',time:1000},{type:'defuse',time:12000}];assert.equal(clockAt(round,15000).state,'defused');assert.equal(roundSegments(round).at(-1).state,'defused');
});

// Exercise the actual registered worker event handlers without a 300 MB demo.
async function workerHarness(){
  let parser;const callbacks={},demo={freeze:false,getEntitiesByClassNameIterator(name){return name==='CCSGameRulesProxy'?[{getField:field=>field.endsWith('m_bFreezePeriod')?this.freeze:null}]:[];},getEntityByHandle(){return null;}};
  const self={crypto:require('node:crypto').webcrypto,addEventListener(){},postMessage(){},deadem:{cs2:{InterceptorStage:{DEMO_PACKET:'packet',MESSAGE_PACKET:'message'},MessagePacketType:{GE_SOURCE1_LEGACY_GAME_EVENT:1},ParserConfiguration:class{},Parser:class{constructor(){parser=this;}registerPostInterceptor(stage,fn){callbacks[stage]=fn;}getDemo(){return demo;}}}}};
  const context=vm.createContext({self,importScripts(){}});vm.runInContext(fs.readFileSync('js/replay-capture.js','utf8'),context);
  const hook=`return {capture:replayCapture,rows:stats,freeze(value){parser.getDemo().freeze=value;},setup(){const a=ensurePlayer(1,{name:'One',xuid:'1'}),b=ensurePlayer(2,{name:'Two',xuid:'2'});teamNow.set(1,3);teamNow.set(2,2);round.liveStartTick=0;round.live=false;round.finished=true;round.healthByUser.set(2,100);replayCapture.beginRound(0,tickInterval);readReplayPlayers=()=>[{id:'steam:1',name:'One',steam_id:'1',x:0,y:0,z:0,health:100,side:3},{id:'steam:2',name:'Two',steam_id:'2',x:20,y:0,z:0,health:100,side:2}];},emit(name,tick,event){descriptors.set(1,{name,keys:Object.keys(event).map(name=>({name}))});parser.callback({tick},{type:1,data:{eventid:1,keys:Object.values(event).map(value=>typeof value==='string'?{type:1,valString:value}:{type:2,valFloat:value})}});},step(tick){parser.packet({tick,getIsInitial:()=>false});}};`;
  vm.runInContext(fs.readFileSync('js/demo-worker.js','utf8').replace('  try {\n    const bytes = new Uint8Array(buffer);',hook+'\n  try {\n    const bytes = new Uint8Array(buffer);'),context);
  const h=await vm.runInContext("parseDemo('test.dem',new ArrayBuffer(1),true)",context);parser.callback=callbacks.message;parser.packet=callbacks.packet;h.setup();return h;
}
test('Worker captures post-round actions without adding them to live combat counters, and stops on the round transition',async()=>{
  const h=await workerHarness();h.step(0);h.emit('hegrenade_detonate',65,{userid:1,entityid:4,x:0,y:0,z:0});h.emit('player_hurt',66,{userid:2,attacker:1,weapon:'hegrenade',dmg_health:45,health:55});
  h.emit('flashbang_detonate',70,{userid:1,entityid:5,x:0,y:0,z:0});h.emit('player_blind',71,{userid:2,attacker:1,entityid:5,blind_duration:2});h.emit('weapon_fire',72,{userid:1,weapon:'ak47'});h.emit('player_death',73,{userid:2,attacker:1,weapon:'ak47',headshot:true});h.step(74);
  const captured=h.capture.getRound(0);assert.equal(captured.deaths.length,1);assert.equal(captured.firing.get('steam:1').length,1);assert.equal(captured.blindness.length,1);assert.equal(captured.outcomes.length,2);assert.equal(captured.outcomes[0].damage,45);
  assert.equal(h.rows.get(1).kills,0);assert.equal(h.rows.get(1).heDamage,0);assert.equal(h.rows.get(1).enemiesFlashed,0);
  h.emit('round_prestart',80,{});assert.equal(h.capture.activeStart,null);const before=h.capture.samples;h.step(90);h.emit('weapon_fire',91,{userid:1,weapon:'ak47'});assert.equal(h.capture.samples,before);assert.equal(captured.firing.get('steam:1').length,1);assert.equal(captured.captureEnd,1250);
});

test('Official-end and game-rules freeze close replay windows, while a delayed old end cannot truncate the next live round',async()=>{
  const h=await workerHarness();h.step(0);h.emit('round_officially_ended',80,{});assert.equal(h.capture.activeStart,null);
  h.emit('round_freeze_end',100,{});assert.equal(h.capture.activeStart,100);h.emit('round_officially_ended',101,{});assert.equal(h.capture.activeStart,100);
  const fallback=await workerHarness();fallback.step(0);fallback.freeze(true);fallback.step(90);assert.equal(fallback.capture.activeStart,null);assert.equal(fallback.capture.getRound(0).captureEnd,1406);
});
