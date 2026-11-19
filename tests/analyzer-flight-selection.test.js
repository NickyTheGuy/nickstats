const {test}=require('node:test'),assert=require('node:assert/strict');
const map={pos_x:0,pos_y:0,scale:1},level={min:-100,max:100};
async function fixture(){
  const {replayFixture}=await import('./fixtures/analyzer.mjs'),r=replayFixture('flight',1),round={...r.rounds[0],match_uid:r.match_uid,duration:2000};
  round.utility=[{type:'HE',icon:'hegrenade',player:'steam:1',side:3,time:500,end:1500,x:30,y:0,z:0,effectiveness:{enemy_damage:45,enemies_flashed:null,enemy_blind_ms:null}}];
  round.projectiles=[{id:'grenade1',type:'HE',icon:'hegrenade',player:'steam:1',side:3,end:500,samples:[[100,10,0,0],[200,20,0,0],[300,30,0,0],[400,30,0,0]]}];return round;
}
const options={map,level,players:['steam:1'],utilities:['HE'],layers:[],showPlayers:false};
test('Flying grenades use the drawn interpolated position and share selection identity with their detonation',async()=>{
  const {selectionCandidates,mergeSelection,entrySelected,candidatesInArea}=await import('../frontend/features/analyzer/state/map-selection.mjs'),{summarizeArea}=await import('../frontend/features/analyzer/state/area-selection.mjs'),round=await fixture();
  const flight=selectionCandidates([round],{...options,time:150})[0],landed=selectionCandidates([round],{...options,time:600})[0];
  assert.ok(flight.projectile);assert.equal(flight.x,15);assert.equal(flight.y,0);assert.deepEqual(flight.entry.utilities,landed.entry.utilities);assert.equal(entrySelected(landed.entry,[flight.entry]),true);
  const selection=mergeSelection([flight.entry],[landed.entry],true),summary=summarizeArea([round],{players:['steam:1'],selection});assert.equal(selection.length,1);assert.equal(summary.count,1);assert.equal(summary.observations,1);assert.equal(summary.utility.count,1);assert.deepEqual(summary.utility.metrics,[['Damage / HE','45.00']]);
  assert.deepEqual(candidatesInArea([flight],{left:14,right:16,top:-1,bottom:1}),[flight.entry]);assert.equal(selectionCandidates([round],{...options,time:50}).length,0);
});
test('Flights respect live utility toggles, grenade types, actor sides, floors and enemy display settings',async()=>{
  const {selectionCandidates}=await import('../frontend/features/analyzer/state/map-selection.mjs'),{createDisplay}=await import('../frontend/features/analyzer/state/display.mjs'),round=await fixture(),display={...createDisplay(),players:false,combat:[],utilities:['HE'],utilityLayers:['History']};
  assert.equal(selectionCandidates([round],{...options,time:200,display}).length,0);
  display.utilityLayers=['Live'];assert.equal(selectionCandidates([round],{...options,time:200,display}).length,1);
  assert.equal(selectionCandidates([round],{...options,time:200,display,side:2}).length,0);assert.equal(selectionCandidates([round],{...options,time:200,display,level:{min:100,max:500}}).length,0);
  display.utilities=['Flash'];assert.equal(selectionCandidates([round],{...options,time:200,display}).length,0);display.utilities=['HE'];
  const rosters=new Map([[`${round.match_uid}:1`,{primary:['steam:2'],enemies:['steam:1']}]]);const enemy=selectionCandidates([round],{...options,time:200,rosters,display:{...display,utilities:[]},enemyDisplay:display});assert.equal(enemy.length,1);assert.equal(enemy[0].enemy,true);
});
test('Unmatched and ambiguous flights remain selectable without borrowing another grenade’s yield',async()=>{
  const {selectionCandidates}=await import('../frontend/features/analyzer/state/map-selection.mjs'),{summarizeArea}=await import('../frontend/features/analyzer/state/area-selection.mjs'),{utilitySelectionData}=await import('../frontend/features/analyzer/state/utility-selection.mjs'),round=await fixture();
  round.utility=[{...round.utility[0],x:2000}];round.performance=[{player:'steam:1',kills:1,deaths:0,assists:0,damage:50,kast:1,grenades:{he_thrown:1,he_damage:90}}];
  const item=selectionCandidates([round],{...options,time:200})[0],summary=summarizeArea([round],{players:['steam:1'],selection:[item.entry]});assert.equal(summary.utility.count,1);assert.deepEqual(summary.utility.metrics,[['Damage / HE','—']]);
  round.utility=[{...round.utility[0],x:30},{...round.utility[0],x:40}];assert.equal(utilitySelectionData(round).projectiles[0].effect.unlinked_projectile,true);
  round.utility=[round.utility[0]];round.projectiles=[round.projectiles[0],{...round.projectiles[0],id:'grenade2'}];assert.ok(utilitySelectionData(round).projectiles.every(p=>p.effect.unlinked_projectile));
  round.utility=[];assert.equal(selectionCandidates([round],{...options,time:200}).length,2);
});
