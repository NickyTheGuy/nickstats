const {test}=require('node:test'),assert=require('node:assert/strict');
const api=()=>import('../frontend/shared/state/preferences.mjs');
test('Preferences coalesce changes and flush the latest state on navigation without storing replay payloads',async()=>{
  const {createPreferenceStore}=await api(),writes=[];let pending;const store=createPreferenceStore({getItem:()=>null,setItem:(key,value)=>writes.push(JSON.parse(value))},{schedule:fn=>{pending=fn;return 1;},cancel(){}});
  store.set('analyzer.time',100);store.set('analyzer.time',250);store.set('analyzer.players',['steam:1']);assert.equal(writes.length,0);store.flush();assert.equal(writes.length,1);assert.equal(writes[0].values['analyzer.time'],250);store.flush();store.set('analyzer.time',250);store.flush();assert.equal(writes.length,1);
  const restored=createPreferenceStore({getItem:()=>JSON.stringify(writes[0])});assert.deepEqual(restored.read('analyzer.players',[]),['steam:1']);assert.equal(restored.read('absent',()=>5),5);
});
test('Malformed or unavailable browser storage never prevents using the Analyzer',async()=>{
  const {createPreferenceStore}=await api();for(const raw of ['bad','null','{"version":9,"values":{}}','{"version":1,"values":[]}'])assert.equal(createPreferenceStore({getItem:()=>raw}).read('value',2),2);
  const store=createPreferenceStore({getItem(){throw Error('denied');},setItem(){throw Error('quota');}});store.set('value',3);assert.doesNotThrow(()=>store.flush());assert.equal(store.read('value',2),3);
});
test('Saved Analyzer controls validate stale values and preserve meaningful empty selections',async()=>{
  const {displayPreferences,roundPreferences,groupRoundPreferences,viewPreferences,utilityPreferences}=await import('../frontend/features/analyzer/state/preferences.mjs');
  assert.deepEqual(displayPreferences({players:false,utilityLayers:[],utilities:['HE','bad']}).utilityLayers,[]);assert.deepEqual(displayPreferences({utilities:['HE','bad']}).utilities,['HE']);
  assert.deepEqual(roundPreferences({buy:['full','force','bad'],enemyBuy:['hero','eco'],result:'bad'}),{buy:['full','force'],enemyBuy:['eco'],result:'all'});
  assert.deepEqual(groupRoundPreferences({sections:['ot-10-2','bad'],numbers:[1,29,29,-1]}),{sections:['ot-10-2'],numbers:[1,29]});assert.deepEqual(viewPreferences({zoom:9,x:1e9,y:NaN}),{zoom:4,x:1536,y:0});assert.deepEqual(utilityPreferences({type:'HE',metric:'enemies',minimum:'40'}),{type:'HE',metric:'damage',minimum:'40'});
});
test('Saved source keeps conditions, chosen map, dates and account-scoped tags while dropping unsafe input',async()=>{
  const {sourcePreferences}=await import('../frontend/features/analyzer/state/preferences.mjs'),saved=sourcePreferences({mode:'groups',loaded:true,players:[{id:1,name:'Nick',steam_id:'1'}],map:'de_nuke',date:{from:'2026-11-01',through:'bad'},tags:[['tag','true']],account:'nick',route:'#analyzer'});
  assert.equal(saved.players[0].id,'1');assert.equal(saved.loaded,true);assert.equal(saved.date.from,'2026-11-01');assert.equal(saved.date.through,'');assert.deepEqual(saved.tags,[['tag','true']]);assert.equal(saved.account,'nick');assert.equal(sourcePreferences({...saved,map:'bad/path',matchID:'NaN'}).map,'');
});

test('Focused cohorts persist identities only, and stale or excessive snapshots cannot fill browser storage',async()=>{
  const {focusPreferences}=await import('../frontend/features/analyzer/state/preferences.mjs'),focus={map:'de_nuke',keys:['match:1'],instances:[{roundKey:'match:1',player:'steam:1',unwanted:'large data'}],previousMatchRounds:['match:1','match:2']};
  assert.deepEqual(focusPreferences(focus).instances,[{roundKey:'match:1',player:'steam:1'}]);assert.equal(focusPreferences({...focus,instances:[{roundKey:'stale',player:'steam:1'}]}),null);assert.equal(focusPreferences(null),null);
});
