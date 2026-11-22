const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

async function fixture() {
  const conditionAPI = await import('../frontend/features/profiles/state/round-conditions.mjs');
  const context = vm.createContext({ window: { NickStatsRoundConditions: conditionAPI }, document: {} });
  for (const file of ['stat-availability', 'match-sessions', 'round-timeline', 'graphs']) {
    vm.runInContext(fs.readFileSync(`js/${file}.js`, 'utf8'), context);
  }
  const history = [1,2,3,4].map(round => ({ round, kills: round===3?2:0, deaths:round===3?1:0,
    damage:round===3?90:0, result:round<=2?'win':'loss', side:'T', buy:'eco', opponent_buy:'full',hero:false }));
  const match = (id,date)=>({id,played_at:date,schema:'nickstats.match/27',rounds:4,kills:999,damage:9999,
    teammate_ids:[2],sides:[],round_kills:history.map(row=>({...row,damage:row.round===3&&id===3?210:row.damage}))});
  const leaf = (damage=90)=>({condition:'opening_death',side:'T',buy_type:'eco',opponent_buy_type:'full',
    round_result:'loss',round_phase:'REGULATION',hero:false,rounds:[3],
    stats:{rounds:1,round_wins:0,kills:2,deaths:1,damage,kast_rounds:1,opening_kills:0,opening_deaths:1},weapons:[]});
  const matches=[match(1,10000),match(2,15000),match(3,20000)];
  const data={matches:[{id:1,expected_rounds:4,slices:[leaf()]},{id:3,expected_rounds:4,slices:[leaf(210)]}]};
  return {api:context.window.NickStatsGraphs,rounds:context.window.NickStatsRoundTimeline,conditionAPI,matches,data};
}

test('Graph match and session samples pool only selected full rounds and never fall back to whole matches',async()=>{
  const {api,conditionAPI,matches,data}=await fixture();
  const projected=conditionAPI.conditionMatches(matches,data,'opening_death');
  const samples=api.samplesForMatches(projected,'ALL','ALL','ALL','ALL','ALL',false,{2:1.5});
  assert.deepEqual(Array.from(samples,s=>s.id),['1','3']);
  assert.equal(samples[0].stats.kills,2);assert.equal(samples[0].stats.damage,90);assert.equal(samples[0].stats.rounds,1);
  assert.equal(samples[0].stats.teammate_rating_samples,undefined);
  assert.equal(api.samplesForMatches(projected,'CT').length,0);
  assert.equal(api.samplesForMatches(projected,'T','full').length,0);
  assert.equal(api.samplesForMatches(projected,'T','eco','loss','full').length,2);
  const sessions=api.sessionSamples(samples,matches);
  assert.equal(sessions.length,1);assert.equal(sessions[0].matchIDs.length,2);
  assert.equal(sessions[0].stats.rounds,2);assert.equal(sessions[0].stats.kills,4);
  assert.equal(api.metrics.get('adr').value(sessions[0].stats),150);
  for(const id of ['teammate_rating','clawback_kr','enemy_5_kr','mid_kr','pistol_win','team_win_survivors']){
    assert.ok(Number.isNaN(api.metrics.get(id).value(samples[0].stats)),id);
    assert.ok(Number.isNaN(api.metrics.get(id).value(sessions[0].stats)),id);
  }
  assert.equal(matches[0].kills,999);assert.equal(matches[0].round_kills.length,4);
});

test('Numbered-round graphs keep sparse cohort rounds and compute differential from full history first',async()=>{
  const {api,rounds,conditionAPI,matches,data}=await fixture();
  const projected=conditionAPI.conditionMatches(matches,data,'opening_death');
  const selected=api.roundMatchesFor(projected,{side:'T',buy:'eco',result:'loss',opponentBuy:'full'});
  assert.deepEqual(Array.from(selected[0].round_kills,r=>r.round),[3]);
  assert.equal(selected[0].round_kills[0].differential,1);
  assert.equal(rounds.averages(selected,{},'kills')[0].value,2);
  assert.equal(rounds.averages(selected,{},'damage')[0].value,150);
  assert.equal(api.roundMatchesFor(projected,{side:'CT'})[0].round_kills.length,0);
  const partial={...projected[0],condition_round_history:[matches[0].round_kills[2]]};
  const incomplete=api.roundMatchesFor([partial]);
  assert.equal(incomplete[0].round_kills[0].kills,2);
  assert.equal(incomplete[0].round_kills[0].differential,undefined);
  assert.equal(rounds.averages(incomplete,{},'differential').length,0);
});

test('Empty conditioned graphs distinguish missing qualifying rounds from parser coverage',async()=>{
  const {graphOutputModel}=await import('../frontend/features/graphs/state/graph-output.mjs');
  const base={series:[],colors:[],roundsMode:true,conditioned:true};
  assert.equal(graphOutputModel(base).empty,'No qualifying round samples for this statistic.');
  assert.equal(graphOutputModel({...base,unavailable:true}).empty,'This statistic is unavailable for round conditions.');
});
