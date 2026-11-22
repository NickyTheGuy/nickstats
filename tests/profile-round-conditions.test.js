const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const api=()=>import('../frontend/features/profiles/state/round-conditions.mjs');
function fixture(){
 const slice=(condition,round,kills,deaths,damage,won,side='CT',buy='full',hero=false)=>({condition,side,buy_type:buy,opponent_buy_type:'eco',round_result:won?'win':'loss',round_phase:'REGULATION',hero,rounds:[round],stats:{rounds:1,round_wins:won,kills,deaths,assists:1,damage,kast_rounds:1,opening_kills:condition==='opening_kill'?1:0,opening_deaths:condition==='opening_death'?1:0},weapons:[]});
 const data={player_id:1,matches:[{id:1,expected_rounds:3,covered_rounds:3,slices:[slice('opening_kill',1,3,0,250,1),slice('opening_death',2,1,1,100,0,'CT','eco'),slice('no_opening',3,0,1,20,0,'T','force',true)]},{id:2,expected_rounds:3,covered_rounds:2,slices:[slice('opening_kill',1,1,1,100,0,'T'),slice('no_opening',2,0,0,0,1,'CT','pistol')]}]};
 const matches=data.matches.map(row=>({id:row.id,rounds:3,result:'w',schema:'nickstats.match/27',kills:99,deaths:2,damage:9999,sides:[],teammate_ids:[],round_kills:[1,2,3].map(round=>({round}))}));return{data,matches};
}
async function aggregateAPI(){
 const conditionAPI=await api(),ctx={window:{},Number,Math,Map,Set};vm.createContext(ctx);vm.runInContext(fs.readFileSync('js/stat-availability.js','utf8'),ctx);vm.runInContext(fs.readFileSync('js/filters.js','utf8'),ctx);
 Object.assign(ctx,{number:v=>Number.isFinite(Number(v))?Number(v):0,ratio:(a,b)=>b>0?(a||0)/b:(a||0),availability:ctx.window.NickStatsAvailability,scoreBreakdown:ctx.window.NickStatsFilters.scoreBreakdown,conditionAPI});
 const src=fs.readFileSync('js/players.js','utf8');vm.runInContext(src.slice(src.indexOf('  function mergeStats('),src.indexOf('  function matchesFor('))+';globalThis.aggregateStats=aggregate;',ctx);return ctx.aggregateStats;
}
test('Opening conditions select full-round stats, combine attempts without duplication and exclude unknown rounds',async()=>{
 const {validateRoundConditions,conditionMatches}=await api(),{data,matches}=fixture();validateRoundConditions(data,1);
 assert.equal(conditionMatches(matches,data,'ALL'),matches);
 const kill=conditionMatches(matches,data,'opening_kill');assert.equal(kill[0].sides[0].stats.kills,3);assert.deepEqual(kill[0].round_kills,[{round:1}]);
 assert.equal(conditionMatches(matches,data,'opening_attempt').flatMap(m=>m.sides).reduce((n,s)=>n+s.stats.rounds,0),3);
 assert.equal(conditionMatches(matches,data,'no_opening').flatMap(m=>m.sides).reduce((n,s)=>n+s.stats.rounds,0),2);
 assert.equal(matches[0].kills,99);assert.equal(matches[0].sides.length,0);
 const invalid=structuredClone(data);invalid.matches[0].slices[1].rounds=[1];assert.throws(()=>validateRoundConditions(invalid,1),/Overlapping/);assert.throws(()=>validateRoundConditions(data,2),/Invalid/);
});
test('Filtered rating and ADR use pooled selected player rounds rather than whole-match totals or match averages',async()=>{
 const {conditionMatches}=await api(),{data,matches}=fixture(),aggregate=await aggregateAPI(),rows=conditionMatches(matches,data,'opening_kill');
 const result=aggregate(rows,'ALL','ALL','ALL','ALL','ALL',false,{},'opening_kill');assert.equal(result.rounds,2);assert.equal(result.stats.kills,4);assert.equal(result.stats.deaths,1);assert.equal(result.adr,175);assert.equal(result.winRate,50);assert.equal(result.winRateKind,'round');assert.equal(result.matches,2);
 const kpr=2,dpr=.5,apr=1,adr=175,kast=100,expected=.0073*kast+.3591*kpr-.5329*dpr+.2372*(2.13*kpr+.42*apr-.41)+.0032*adr+.1587;assert.ok(Math.abs(result.rating-expected)<1e-10);
 const none=aggregate(conditionMatches(matches,data,'no_opening'),'CT','pistol','ALL','ALL','ALL',false,{},'no_opening');assert.equal(none.rounds,1);assert.equal(none.matches,1);assert.equal(none.winRate,100);
 const empty=aggregate(rows,'ALL','pistol','ALL','ALL','ALL',false,{},'opening_kill');assert.equal(empty.rounds,0);assert.equal(empty.matches,0);assert.equal(empty.stats.kills||0,0);
});
test('Condition leaf slices intersect filters once, retaining hero rounds in All and requiring hero for Hero',async()=>{
 const {conditionSliceMatches,conditionCoverage}=await api(),{data,matches}=fixture(),row=data.matches[0].slices[2];assert.equal(conditionSliceMatches(row),true);assert.equal(conditionSliceMatches(row,{heroOnly:true}),true);assert.equal(conditionSliceMatches({...row,hero:false},{buy:'hero'}),false);assert.equal(conditionSliceMatches(row,{side:'CT'}),false);assert.equal(conditionSliceMatches(row,{opponentBuy:'full'}),false);assert.equal(conditionSliceMatches(row,{roundResult:'win'}),false);assert.equal(conditionSliceMatches(row,{roundPhase:'OVERTIME'}),false);assert.deepEqual(conditionCoverage(matches,data),{covered:5,expected:6});
});

test('Condition responses accept signed clutch economics while rejecting invalid counters and nonfinite values',async()=>{
 const {validateRoundConditions}=await api();
 const signed=['differential','swing','team_cash_change','enemy_cash_change','save_impact','t1_victory','ct5_victory_dead','t3_failure','ct2_failure_late'];
 for(const outcome of ['win_survive','win_die','loss_survive','loss_die']){
  const {data}=fixture();
  for(const field of signed)data.matches[0].slices[0].stats[`clutch_econ_${outcome}_${field}`]=-5000;
  assert.equal(validateRoundConditions(JSON.parse(JSON.stringify(data)),1).matches[0].slices[0].stats[`clutch_econ_${outcome}_swing`],-5000);
 }
 for(const [key,value] of [['kills',-1],['clutch_econ_loss_die_count',-1],['clutch_econ_loss_die_saved',-1],['clutch_econ_unknown_swing',-1],['damage',NaN],['damage',Infinity],['damage','200']]){
  const {data}=fixture();data.matches[0].slices[0].stats[key]=value;
  assert.throws(()=>validateRoundConditions(data,1),/Invalid condition statistic/);
 }
});

test('Group conditions keep only eligible matches, preserve rule identities and aggregate each player independently',async()=>{
 const conditionAPI=await api(),{data}=fixture();
 const rows=[{id:'1',map:'de_mirage',schema:'nickstats.match/27',legacy:{rounds:3,kills:99},
   teammateIds:['2'],opponentIds:['3'],sideRows:[],round_kills:[1,2,3].map(round=>({round}))}];
 const selected=conditionAPI.conditionGroupRows(rows,data,'opening_attempt');
 assert.equal(selected.length,1);assert.equal(selected[0].id,'1');
 assert.deepEqual(selected[0].teammateIds,['2']);assert.equal(selected[0].sideRows.length,2);
 assert.equal(selected[0].sideRows.reduce((n,row)=>n+row.stats.kills,0),4);
 assert.deepEqual(selected[0].round_kills,[{round:1},{round:2}]);
 assert.equal(rows[0].legacy.kills,99);assert.equal(rows[0].sideRows.length,0);
 const context=vm.createContext({state:{side:'ALL',buy:'ALL',opponentBuy:'ALL',roundResult:'ALL',roundPhase:'ALL',heroOnly:false},conditionAPI,
   num:value=>Number(value)||0,scoreBreakdown:()=>null});
 vm.runInContext(fs.readFileSync('js/stat-availability.js','utf8'),Object.assign(context,{window:{}}));
 context.availability=context.window.NickStatsAvailability;
 const source=fs.readFileSync('js/groups.js','utf8');
 vm.runInContext(source.slice(source.indexOf('  function playerRating('),source.indexOf('  function populateMaps(')),context);
 const summary=context.summarize(selected,'opening_attempt');
 assert.equal(summary.n,1);assert.equal(summary.rounds,2);assert.equal(summary.kills,4);assert.equal(summary.adr,175);
 assert.equal(summary.winRateKind,'round');assert.equal(summary.winRate,50);assert.equal(summary.conditioned,true);
 context.state.buy='pistol';
 const empty=context.summarize(selected,'opening_attempt');assert.equal(empty.n,0);assert.equal(empty.rounds,0);assert.equal(empty.kills||0,0);
});
