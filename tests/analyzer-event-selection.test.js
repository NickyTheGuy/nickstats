const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
async function fixture(){const {replayFixture}=await import('./fixtures/analyzer.mjs');return replayFixture('events');}
function capture(){const self={};vm.runInNewContext(fs.readFileSync('js/replay-capture.js','utf8'),{self});return new self.NickStatsReplayCapture();}
const area={left:-10,right:40,top:-10,bottom:10},map={pos_x:0,pos_y:0,scale:1},level={min:-100,max:100};
const flash=(player='steam:1',time=100)=>({time,end:time+500,type:'Flash',player,side:3,x:5,y:0,z:0,icon:'flashbang',radius:0,estimated:false});
test('Event selection separates passers-by, killers, victims and grenade throwers and persists after death',async()=>{
  const {summarizeArea}=await import('../frontend/features/analyzer/state/area-selection.mjs'),r=await fixture();r.rounds=r.rounds.slice(0,1);r.rounds[0].utility=[flash()];
  const options={area,map,level,time:1200,players:['steam:1','steam:2','steam:3']};
  assert.equal(summarizeArea(r.rounds,{...options,target:'Players'}).count,0);
  const kills=summarizeArea(r.rounds,{...options,target:'Kills'});assert.equal(kills.count,1);assert.equal(kills.observations,1);assert.equal(kills.kills,1);
  const deaths=summarizeArea(r.rounds,{...options,target:'Deaths'});assert.equal(deaths.count,1);assert.equal(deaths.deaths,1);assert.equal(deaths.winRate,0);
  const grenade=summarizeArea(r.rounds,{...options,target:'Flash'});assert.equal(grenade.count,1);assert.equal(grenade.utility.count,1);assert.equal(grenade.observations,1);
  assert.equal(summarizeArea(r.rounds,{...options,time:0,target:'Flash'}).count,0);
  assert.equal(summarizeArea(r.rounds,{...options,target:'Flash',utilities:[]}).count,0);
  assert.equal(summarizeArea(r.rounds,{...options,target:'Kills',layers:['Deaths']}).count,0);
});
test('Multiple selected grenades in one player round count as separate throws, with one round outcome',async()=>{
  const {summarizeArea}=await import('../frontend/features/analyzer/state/area-selection.mjs'),r=await fixture();r.rounds=r.rounds.slice(0,1);
  r.rounds[0].utility=[flash(),flash('steam:1',300)].map((e,i)=>({...e,effectiveness:{enemies_flashed:i,enemy_blind_ms:i*1000,enemy_damage:null}}));
  const summary=summarizeArea(r.rounds,{area,map,level,time:500,players:['steam:1'],target:'Flash'});
  assert.equal(summary.count,1);assert.equal(summary.observations,1);assert.equal(summary.utility.count,2);assert.deepEqual(summary.utility.metrics[0],['Enemies / flash','0.50']);
});
test('Legacy round totals are attributed only when both throw count and effect count prove a single grenade',async()=>{
  const {grenadeEffectiveness}=await import('../frontend/features/analyzer/state/selection-targets.mjs');const e=flash();
  const round={utility:[e],performance:[{player:'steam:1',grenades:{flash_thrown:1,enemies_flashed:2,blind_ms:1500}}]};
  assert.equal(grenadeEffectiveness(e,round).enemies_flashed,2);round.performance[0].grenades.flash_thrown=2;assert.equal(grenadeEffectiveness(e,round).enemies_flashed,undefined);
  round.performance[0].grenades.flash_thrown=1;round.utility.push(flash('steam:1',300));assert.equal(grenadeEffectiveness(e,round).enemies_flashed,undefined);
});
test('Flash outcomes correlate by grenade entity, deduplicate enemies and retain true zero yield',()=>{
  const c=capture(),r=c.getRound(0),one=c.effect(r,100,{type:'Flash',entity:11,player:'p',side:3,x:0,y:0,z:0}),two=c.effect(r,105,{type:'Flash',entity:12,player:'p',side:3,x:0,y:0,z:0});
  c.outcome('flash',110,0,.001,{type:'Flash',entity:11,player:'p',victim:'v1',duration:500});c.outcome('flash',111,0,.001,{type:'Flash',entity:11,player:'p',victim:'v1',duration:1000});c.outcome('flash',112,0,.001,{type:'Flash',entity:11,player:'p',victim:'v2',duration:2000});
  const metrics=c.effectiveness(r,1000);assert.equal(metrics.get(one).enemies_flashed,2);assert.equal(metrics.get(one).enemy_blind_ms,3000);assert.equal(metrics.get(two).enemies_flashed,0);
});
test('Fire/HE outcomes use corrected enemy damage and refuse ambiguous overlapping fires',()=>{
  const c=capture(),r=c.getRound(0),one=c.effect(r,100,{type:'Fire',entity:1,player:'p',side:3,x:0,y:0,z:0});
  c.outcome('damage',200,0,.001,{type:'Fire',player:'p',victim:'v',damage:41,entity:null});c.outcome('damage',300,0,.001,{type:'Fire',player:'p',victim:'v',damage:42,entity:null});assert.equal(c.effectiveness(r,1000).get(one).enemy_damage,83);
  const two=c.effect(r,150,{type:'Fire',entity:2,player:'p',side:3,x:500,y:0,z:0});const ambiguous=c.effectiveness(r,1000);assert.equal(ambiguous.get(one).enemy_damage,null);assert.equal(ambiguous.get(two).enemy_damage,null);
  const he=c.effect(r,500,{type:'HE',entity:3,player:'q',side:3,x:0,y:0,z:0});c.outcome('damage',499,0,.001,{type:'HE',player:'q',victim:'v',damage:70,entity:null});assert.equal(c.effectiveness(r,1000).get(he).enemy_damage,70);
});
test('Effectiveness and nullable round utility totals survive validation and movement caching',async()=>{
  const r=await fixture(),{validateReplay}=await import('../frontend/features/analyzer/state/replay.mjs');r.rounds[0].utility=[{...flash(),effectiveness:{enemies_flashed:0,enemy_blind_ms:0,enemy_damage:null}}];
  r.rounds[0].performance=[{player:'steam:1',kills:1,deaths:0,assists:0,damage:10,kast:1,grenades:{flash_thrown:1,enemies_flashed:0}}];
  const validated=validateReplay(r);assert.equal(validated.rounds[0].utility[0].effectiveness.enemies_flashed,0);assert.equal(validated.rounds[0].performance[0].grenades.he_thrown,null);
  const {createMovementCache,movementSelection}=await import('../frontend/features/analyzer/state/movement-cache.mjs'),{summarizeRound}=await import('../frontend/features/analyzer/state/server.mjs');
  const index={...r,capture:'cap',rounds:r.rounds.map(summarizeRound)},cache=createMovementCache(),plan=movementSelection([index],[`${r.match_uid}:1`],['steam:1']);cache.pin(plan);cache.put(index,validated.rounds,['steam:1']);
  assert.equal(cache.read(plan)[0].utility[0].effectiveness.enemies_flashed,0);assert.equal(cache.read(plan)[0].performance[0].grenades.flash_thrown,1);
  r.rounds[0].utility[0].effectiveness.enemy_damage=-1;assert.throws(()=>validateReplay(r),/effectiveness/);
});
test('Focus keys identify a complete round independently of which event or player matched it',async()=>{
  const {selectionRoundKey}=await import('../frontend/features/analyzer/state/selection-targets.mjs');assert.equal(selectionRoundKey({match_uid:'faceit:abc',number:29}),'faceit:abc:29');assert.notEqual(selectionRoundKey({match_uid:'a',number:1}),selectionRoundKey({match_uid:'b',number:1}));assert.equal(selectionRoundKey({number:1}),null);
});

test('A specific combat selection keeps its marker at the geographic point and on top',async()=>{
  const {combatMarkers}=await import('../frontend/features/analyzer/state/combat.mjs');
  const event={killer:'k',victim:'v',killer_side:3,victim_side:2,from:[5,0,0],x:0,y:0,z:0};
  const marks=combatMarkers(event,{selected:new Set(['k','v']),side:0,layers:['Kills','Deaths'],map,level,unit:1,preferredRole:'death'});
  assert.equal(marks.at(-1).kind,'death');assert.equal(marks.at(-1).x,marks.at(-1).baseX);
});

test('A visible unowned grenade can focus its round without inventing a player outcome',async()=>{
  const {summarizeArea}=await import('../frontend/features/analyzer/state/area-selection.mjs'),r=await fixture();r.rounds=r.rounds.slice(0,1);r.rounds[0].utility=[{...flash(),player:null}];
  const options={area,map,level,time:800,players:['steam:1','steam:2','steam:3'],target:'Flash'};
  assert.equal(summarizeArea(r.rounds,options).count,0);const result=summarizeArea(r.rounds,{...options,allSelected:true});assert.equal(result.count,1);assert.equal(result.combatComplete,false);assert.equal(result.rating,null);assert.equal(result.winRate,null);
});
