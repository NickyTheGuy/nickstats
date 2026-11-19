const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../js/groups.js'),'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

function setup() {
  const listeners = new Map(), requests = [], rendered = [], statuses = [], ratingRequests = [], measures = new Map();
  let now = 100000;
  const nodes = {groupsPage:{hidden:false},groupResults:{hidden:false}};
  const state = {selected:new Map([['1',{id:'1'}],['2',{id:'2'}]]),
    players:[{profileId:'1',rows:[{id:'old'}]}],groupController:null,groupStale:false,
    groupLoadedAt:now,side:'CT',buy:'full',comboDisplay:'graphs',graphPlayers:new Set(['1'])};
  const document = {hidden:false,addEventListener:(event,fn)=>listeners.set(event,fn)};
  const sandbox = {state,document,AbortController,URLSearchParams,Date:{now:()=>now},
    GROUP_DATA_ENDPOINT:'/nickstats/api/groups',GROUP_REFRESH_AGE_MS:60000,
    $:id=>nodes[id],ui:{groupBuildButton:{update(){}}},
    window:{addEventListener:(event,fn)=>listeners.set(event,fn),
      performance:{now:()=>now,clearMeasures:name=>measures.delete(name),measure:(name,value)=>measures.set(name,value)},
      NickStatsPlayerStats:{expandDenseProfile:value=>value,teammateRatingsFor:async id=>{ratingRequests.push(String(id));return {'3':1.2};}}},
    fetch:(url,options)=>new Promise((resolve,reject)=>requests.push({url,options,resolve,reject})),
    apiJson:response=>response.json(),
    normalizePlayer:player=>({profileId:String(player.id),label:player.name,rows:player.matches}),
    populateMaps(){},
    persistRoster(){},renderSelectedRoster(){},
    runCombination:()=>rendered.push(Array.from(state.players).flatMap(player=>Array.from(player.rows,row=>row.id))),
    displayedPlayers:()=>state.players,
    canBuild:()=>state.selected.size>=1,
    setStatus:(...args)=>statuses.push(args)
  };
  const start=source.indexOf('  async function buildGroup('), end=source.indexOf('  function displayedPlayers(',start);
  vm.runInNewContext(`${source.slice(start,end)} globalThis.build = buildGroup;`,sandbox);
  const finish = (index,ids) => requests[index].resolve({json:async()=>({players:[
    {id:1,name:'Current name',matches:ids.map(id=>({id}))},
    {id:2,name:'Excluded',matches:[]}
  ]})});
  return {state,nodes,document,listeners,requests,rendered,statuses,ratingRequests,measures,finish,
    build:sandbox.build,advance:ms=>{now+=ms;}};
}

test('manual Build profiles gets current histories and ratings without changing conditions',async()=>{
  const app=setup();app.build();assert.equal(app.requests.length,1);assert.equal(app.requests[0].url,'/nickstats/api/groups?players=1%2C2&wire=4');assert.equal(app.requests[0].options.cache,'no-store');assert.deepEqual(app.ratingRequests,['1','2']);
  app.finish(0,['old','new-this-week']);await tick();assert.deepEqual(app.rendered,[['old','new-this-week']]);assert.equal(app.state.side,'CT');assert.equal(app.state.buy,'full');assert.equal(app.state.selected.get('1').match_count,2);
});
test('restored rosters and navigation, focus and visibility never trigger a build',async()=>{
  const app=setup();app.state.players=[];app.state.groupLoadedAt=0;
  app.listeners.get('nickstats:page')?.({detail:{page:'groups'}});app.listeners.get('focus')?.();app.listeners.get('visibilitychange')?.();app.advance(7*24*60*60*1000);app.listeners.get('focus')?.();assert.equal(app.requests.length,0);
  assert.equal(app.state.selected.size,2);app.build();assert.equal(app.requests.length,1);app.finish(0,['current']);await tick();app.advance(60001);app.listeners.get('focus')?.();assert.equal(app.requests.length,1);
});
test('match changes invalidate pending builds without automatically starting another request',async()=>{
  const app=setup();app.build();app.listeners.get('nickstats:matches-changed')();assert.equal(app.requests.length,1);assert.equal(app.requests[0].options.signal.aborted,true);assert.equal(app.state.groupController,null);assert.equal(app.state.groupStale,true);
  app.build();assert.equal(app.requests.length,2);app.finish(1,['newest']);await tick();app.finish(0,['stale']);await tick();assert.deepEqual(app.rendered,[['newest']]);
});
test('failed manual builds can be retried and empty selections never build',async()=>{
  const app=setup();app.state.selected.clear();app.build();assert.equal(app.requests.length,0);app.state.selected.set('1',{id:'1'});app.build();app.requests[0].reject(new Error('offline'));await tick();assert.equal(app.state.groupController,null);app.build();assert.equal(app.requests.length,2);app.finish(1,['current']);await tick();
});
