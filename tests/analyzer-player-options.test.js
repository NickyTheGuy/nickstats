const {test}=require('node:test'),assert=require('node:assert/strict');
const api=()=>import('../frontend/features/analyzer/state/player-options.mjs');
const players=[{id:'steam:1',name:'Zoe'},{id:'steam:2',name:'Alex'},{id:'steam:3',name:'Sam'},{id:'steam:4',name:'Ben'}];
test('Match player columns follow stable teams, sort names within each, and do not alternate a flat roster',async()=>{
  const {analyzerPlayerTeams}=await api(),replay={teams:{'steam:1':0,'steam:2':1,'steam:3':0,'steam:4':1},rounds:[{context:players.map((p,i)=>({player:p.id,side:i%2?3:2}))}]};
  const teams=analyzerPlayerTeams(players,replay);assert.deepEqual(teams.map(t=>t.players.map(p=>p.name)),[['Sam','Zoe'],['Alex','Ben']]);
  replay.rounds[0].context.forEach(p=>p.side=p.side===2?3:2);assert.deepEqual(analyzerPlayerTeams(players,replay),teams);assert.equal(players[0].name,'Zoe');
});
test('Old captures use the first recorded sides, and missing team evidence stays separate',async()=>{
  const {analyzerPlayerTeams,sortAnalyzerPlayers}=await api(),replay={rounds:[{context:[{player:'steam:1',side:3},{player:'steam:2',side:2}],tracks:[{player:'steam:3',samples:[[0,0,0,0,100,3]]}]}]};
  assert.deepEqual(analyzerPlayerTeams(players,replay).map(t=>[t.label,t.players.map(p=>p.name)]),[['Team 1',['Sam','Zoe']],['Team 2',['Alex']],['Other players',['Ben']]]);
  assert.deepEqual(sortAnalyzerPlayers(players).map(p=>p.name),['Alex','Ben','Sam','Zoe']);
});
test('Analyzer filter actors omit excluded leaves and groups while query conditions retain all players',async()=>{
  const {conditionPlayers,analyzerMatches}=await import('../frontend/features/analyzer/state/query.mjs'),{condition,group}=await import('../frontend/features/groups/state/rules.mjs'),p=[1,2,3,4,5,6].map(id=>({id:String(id)}));
  const rules={friendly:group('and',[condition(1),group('none',[group('or',[condition(2),condition(3)])]),group('none',[group('none',[condition(4)])])]),enemy:group('and',[condition(5),condition(6,true)])};
  assert.deepEqual(conditionPlayers(p,rules).map(p=>p.id),['1','4','5']);
  const match={id:1,players:[{id:1,team:0},{id:4,team:0},{id:5,team:1}]};assert.equal(analyzerMatches([match],rules).length,1);
  assert.equal(analyzerMatches([{...match,players:[...match.players,{id:2,team:0}]}],rules).length,0);
  assert.equal(analyzerMatches([{...match,players:[...match.players,{id:6,team:1}]}],rules).length,0);
});
