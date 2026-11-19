const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const api=()=>import('../frontend/features/analyzer/state/round-clock.mjs');
const clock={round_ms:115000,bomb_ms:40000,round_estimated:false,bomb_estimated:false};
test('Countdown resets at an on-time plant, freezes at defuse, scrubs backwards and never restarts after timeout',async()=>{
  const {clockAt,countdownText}=await api(),r={duration:180000,clock,bomb_events:[{type:'plant',time:60000,player:null},{type:'defuse',time:80000,player:null}]};
  assert.deepEqual(clockAt(r,0),{remaining:115000,state:'normal',estimated:false});assert.equal(countdownText(clockAt(r,59000).remaining),'0:56');
  assert.equal(clockAt(r,60000).remaining,40000);assert.equal(clockAt(r,70000).remaining,30000);assert.equal(clockAt(r,90000).remaining,20000);assert.equal(clockAt(r,90000).state,'defused');assert.equal(clockAt(r,10000).state,'normal');
  r.bomb_events=[{type:'plant',time:115001,player:null}];assert.equal(clockAt(r,116000).remaining,0);r.bomb_events[0].time=115000;assert.equal(clockAt(r,115000).remaining,40000);
  assert.equal(clockAt({duration:2000},1000).estimated,true);assert.equal(countdownText(1),'0:01');
});
test('Bomb state colors and markers keep exact times independently of selected actors',async()=>{
  const {roundSegments,timelineEvents,clockAt}=await api(),round={duration:100000,clock,bomb_events:[{type:'plant',time:30000,player:'enemy'},{type:'defuse',time:60000,player:'friend'}]};
  assert.deepEqual(roundSegments(round),[{start:0,end:30000,state:'normal'},{start:30000,end:60000,state:'planted'},{start:60000,end:100000,state:'defused'}]);
  const events=timelineEvents([],round,[{id:'enemy',name:'Enemy'},{id:'friend',name:'Friend'}]);assert.equal(events.length,2);assert.match(events[0].label,/Bomb planted at 0:30.0 · Enemy/);assert.equal(events[1].time,60000);
  round.bomb_events[1].type='explode';assert.equal(clockAt(round,65000).remaining,0);assert.equal(roundSegments(round).at(-1).state,'exploded');
});
test('Round arrows disable ambiguous selection, respect filters and navigate unlimited overtime',async()=>{
  const {replayFixture}=await import('./fixtures/analyzer.mjs'),{adjacentRounds}=await import('../frontend/features/analyzer/state/round-selection.mjs'),r=replayFixture('arrows',60),filters={players:['steam:1']};
  assert.deepEqual(adjacentRounds([r],[`${r.match_uid}:59`],filters),{previous:`${r.match_uid}:58`,next:`${r.match_uid}:60`});assert.equal(adjacentRounds([r],[`${r.match_uid}:1`],filters).previous,null);assert.equal(adjacentRounds([r],[`${r.match_uid}:60`],filters).next,null);
  assert.deepEqual(adjacentRounds([r],[`${r.match_uid}:1`,`${r.match_uid}:2`],filters),{previous:null,next:null});
  r.rounds[1].context[0].result='loss';assert.equal(adjacentRounds([r],[`${r.match_uid}:1`],{...filters,result:'win'}).next,`${r.match_uid}:3`);
});
test('Capture preserves configured clocks and objective events through validation and cached player projection',async()=>{
  const self={};vm.runInNewContext(fs.readFileSync('js/replay-capture.js','utf8'),{self});const c=new self.NickStatsReplayCapture(),p={id:'steam:1',name:'One',steam_id:'1',x:0,y:0,z:0,health:100,side:3};
  c.configure('mp_roundtime_defuse',2);c.configure('mp_c4timer',35);c.sample(0,0,.001,()=>[p]);c.setClock(0,110,36);c.objective('bomb_planted',1000,0,.001,p.id);c.objective('bomb_planted',1000,0,.001,p.id);c.objective('bomb_defused',2000,0,.001,p.id);
  const raw=JSON.parse(JSON.stringify(c.finish({match_uid:'clock',demo_sha256:'a'.repeat(64),map:'de_mirage',source_file:'test.dem',round_timing:[{round:1,live_start_tick:0,duration_ms:3000,winner_side:'CT'}]}))),{validateReplay}=await import('../frontend/features/analyzer/state/replay.mjs'),validated=validateReplay(raw);
  assert.equal(validated.rounds[0].clock.round_ms,110000);assert.equal(validated.rounds[0].clock.bomb_ms,36000);assert.equal(validated.rounds[0].bomb_events.length,2);
  const {createMovementCache,movementSelection}=await import('../frontend/features/analyzer/state/movement-cache.mjs'),{summarizeRound}=await import('../frontend/features/analyzer/state/server.mjs'),index={...validated,capture:'cap',rounds:validated.rounds.map(summarizeRound)},cache=createMovementCache(),plan=movementSelection([index],['clock:1'],[p.id]);cache.pin(plan);cache.put(index,validated.rounds,[p.id]);assert.deepEqual(cache.read(plan)[0].bomb_events,validated.rounds[0].bomb_events);assert.deepEqual(cache.read(plan)[0].clock,validated.rounds[0].clock);
  raw.rounds[0].bomb_events[0].time=4000;assert.throws(()=>validateReplay(raw),/bomb event/);
});
