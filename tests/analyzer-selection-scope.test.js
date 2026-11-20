const {test}=require('node:test'),assert=require('node:assert/strict');
const api=()=>import('../frontend/features/analyzer/state/selection-scope.mjs');
const event=(time,killer,victim)=>({time,killer,victim,killer_side:3,victim_side:2,weapon:'ak47',x:1,y:2,z:0});
test('Exact selection counts event markers, not the full round, and cell defaults remain round based',async()=>{
 const {eventSelectionKey,exactSelectionSummary,defaultSelectionScope}=await api(),{mergeSelection}=await import('../frontend/features/analyzer/state/map-selection.mjs');
 const a=event(100,'p','e'),b=event(200,'p','f'),c={...event(300,'g','p'),killer_side:2,victim_side:3},round={match_uid:'uid',number:1,utility:[],deaths:[a,b,c]},item={roundKey:'uid:1',player:'p',side:3,utilities:[],events:[eventSelectionKey('kill',a)]};
 let selection=mergeSelection([item],[item,{...item,events:[eventSelectionKey('death',c)]}],true),summary=exactSelectionSummary([round],selection);
 assert.equal(summary.kills,1);assert.equal(summary.deaths,1);assert.equal(summary.rating,null);assert.equal(summary.winRate,null);assert.equal(defaultSelectionScope(selection),'selection');
 selection=mergeSelection(selection,[{...item,events:[],cell:true}],true);assert.equal(defaultSelectionScope(selection),'rounds');assert.equal(exactSelectionSummary([round],selection).kills,1);
 assert.equal(exactSelectionSummary([round],[{...item,events:[],cell:true}]).kills,0);
});
test('Team composition uses same-team friends, excludes self, anchors to your team and retains unknown rosters',async()=>{
 const {friendBreakdown}=await api();const players=Array.from({length:10},(_,n)=>({id:`steam:${n+1}`,steam_id:String(n+1)})),teams=Object.fromEntries(players.map((p,i)=>[p.id,i<5?0:1]));
 const round={match_uid:'u',number:1,duration:1,utility:[],deaths:[],context:[{player:'steam:1',side:3,result:'win'},{player:'steam:2',side:3,result:'win'}],performance:[{player:'steam:1',kills:2,deaths:1,assists:0,damage:100,kast:1},{player:'steam:2',kills:1,deaths:1,assists:0,damage:100,kast:1}]},replays=[{match_uid:'u',rounds:[round],players,teams}],items=['steam:1','steam:2'].map(player=>({roundKey:'u:1',player,side:3,cell:true,utilities:[]}));
 const solo=friendBreakdown([round],items,replays,[{steam_id:'1'},{steam_id:'6'}],{self:'1'});assert.equal(solo.length,1);assert.equal(solo[0].value,'solo');assert.equal(solo[0].knownResults,1);assert.equal(solo[0].kills,3);
 const mixed=friendBreakdown([round],items,replays,[{steam_id:'2'}],{self:'1'});assert.equal(mixed[0].value,'mixed');assert.equal(mixed[0].winRate,100);
 assert.equal(friendBreakdown([round],items,replays,[2,3,4,5].map(n=>({steam_id:String(n)})),{self:'1'})[0].value,'friends');
 assert.equal(friendBreakdown([round],items,[{...replays[0],players:players.slice(0,4)}],[],{self:'1'})[0].value,'unknown');
});
test('Selection context preserves exact rounds, unique matches and selected actors without movement samples',async()=>{
 const {selectedMatchContext}=await api(),round={number:3,match_uid:'u',utility:[],deaths:[]},summary={instances:[{roundKey:'u:3',player:'p'}],matched:new Set([round]),count:1,observations:1,kills:2,deaths:0,combatComplete:true,winRate:100,rating:1.2};
 const context=selectedMatchContext([{matchID:'12',match_uid:'u',map:'de_nuke',roster:[{id:1,steam_id:'1',team:0}],rounds:[round,{number:4}]}],summary,[]);
 assert.equal(context.matches.length,1);assert.deepEqual(context.matches[0].rounds,[3]);assert.deepEqual(context.matches[0].instances,[{player:'p',round:3}]);assert.equal(context.matches[0].tracks,undefined);assert.equal(JSON.parse(JSON.stringify(context)).roundSummary.kills,2);
});
test('Match scope deduplicates player matches and team outcomes and requests only specified IDs',async()=>{
 const {loadSelectionMatches,selectedMatchTotals}=await import('../frontend/features/analyzer/state/selection-matches.mjs'),urls=[];
 const row={id:88,result:'w',kills:9,deaths:5,assists:2,damage:800,kast_rounds:8,rounds:10},context={matches:[{id:'88',players:[{id:1,steam_id:'1',team:0},{id:2,steam_id:'2',team:0}],instances:[{player:'steam:1',round:1},{player:'steam:1',round:2},{player:'steam:2',round:2}]}]};
 const players=await loadSelectionMatches(context,{request:async url=>{urls.push(url);return{ok:true,json:async()=>({players:[{id:1,name:'One',matches:[row]},{id:2,name:'Two',matches:[row]}]})};}});
 assert.equal(urls.length,1);const q=new URL(urls[0],'http://local').searchParams;assert.equal(q.get('matches'),'88');assert.equal(q.get('wire'),'4');
 const totals=selectedMatchTotals(context,players);assert.equal(totals.kills,18);assert.equal(totals.observations,2);assert.equal(totals.winRate,100);assert.ok(Number.isFinite(totals.rating));
});
test('Match queries pair each batch only with players actually present in that batch',async()=>{
 const {loadSelectionMatches}=await import('../frontend/features/analyzer/state/selection-matches.mjs'),requests=[],context={matches:Array.from({length:26},(_,i)=>({id:String(100+i),players:[{id:100+i,steam_id:String(100+i),team:0}],instances:[]}))};
 await loadSelectionMatches(context,{request:async url=>{const q=new URL(url,'http://local').searchParams;requests.push(q);return{ok:true,json:async()=>({players:q.get('players').split(',').map(id=>({id,name:id,matches:[]}))})};}});
 assert.equal(requests.length,3);const last=requests.at(-1);assert.equal(last.get('matches'),'125');assert.equal(last.get('players'),'125');
});
