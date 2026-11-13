const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../js/groups.js'),'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

function setup() {
  const listeners = new Map(), requests = [], rendered = [], statuses = [];
  let now = 100000;
  const nodes = {groupsPage:{hidden:false},groupResults:{hidden:false}};
  const state = {selected:new Map([['1',{id:'1'}],['2',{id:'2'}]]),
    choices:new Map([['1','include'],['2','exclude']]),
    players:[{profileId:'1',rows:[{id:'old'}]}],groupController:null,groupStale:false,
    groupLoadedAt:now,side:'CT',buy:'full',comboDisplay:'graphs',graphPlayers:new Set(['1'])};
  const document = {hidden:false,addEventListener:(event,fn)=>listeners.set(event,fn)};
  const sandbox = {state,document,AbortController,URLSearchParams,Date:{now:()=>now},
    GROUP_DATA_ENDPOINT:'/nickstats/api/groups',GROUP_REFRESH_AGE_MS:60000,
    $:id=>nodes[id],ui:{groupBuildButton:{update(){}}},
    window:{addEventListener:(event,fn)=>listeners.set(event,fn),
      NickStatsPlayerStats:{teammateRatingsFor:async()=>({'3':1.2})}},
    fetch:(url,options)=>new Promise((resolve,reject)=>requests.push({url,options,resolve,reject})),
    apiJson:response=>response.json(),
    normalizePlayer:player=>({profileId:String(player.id),label:player.name,rows:player.matches}),
    populateMaps:options=>assert.equal(options.reset,false),
    persistRoster(){},renderSelectedRoster(){},
    runCombination:()=>rendered.push(Array.from(state.players).flatMap(player=>Array.from(player.rows,row=>row.id))),
    selectedPlayers:choice=>state.players.filter(player=>state.choices.get(player.profileId)===choice),
    setStatus:(...args)=>statuses.push(args)
  };
  const start=source.indexOf('  async function buildGroup('), end=source.indexOf('  function choiceFor(',start);
  vm.runInNewContext(`${source.slice(start,end)} globalThis.ensure = ensureCurrentGroup;`,sandbox);
  const finish = (index,ids) => requests[index].resolve({json:async()=>({players:[
    {id:1,name:'Current name',matches:ids.map(id=>({id}))},
    {id:2,name:'Excluded',matches:[]}
  ]})});
  return {state,nodes,document,listeners,requests,rendered,statuses,finish,
    ensure:sandbox.ensure,advance:ms=>{now+=ms;}};
}

test('returning to Groups reloads matches without resetting its roster, roles, filters or view',async()=>{
  const app=setup();
  app.listeners.get('nickstats:page')({detail:{page:'groups'}});
  assert.equal(app.requests.length,1);
  assert.equal(app.requests[0].url,'/nickstats/api/groups?players=1%2C2');
  assert.equal(app.requests[0].options.cache,'no-store');
  app.finish(0,['old','new-this-week']);
  await tick();
  assert.deepEqual(app.rendered,[['old','new-this-week']]);
  assert.equal(app.state.selected.get('1').match_count,2);
  assert.equal(app.state.choices.get('2'),'exclude');
  assert.equal(app.state.side,'CT');
  assert.equal(app.state.buy,'full');
  assert.equal(app.state.comboDisplay,'graphs');
  assert.deepEqual([...app.state.graphPlayers],['1']);
});

test('restored rosters fetch initially; week-old focus refresh coalesces visibility events',async()=>{
  const app=setup();
  app.state.players=[];app.state.groupLoadedAt=0;
  app.ensure();
  app.listeners.get('focus')();
  app.listeners.get('visibilitychange')();
  assert.equal(app.requests.length,1);
  app.finish(0,['first']);await tick();
  app.listeners.get('focus')();
  assert.equal(app.requests.length,1,'fresh focus does not rebuild repeatedly');
  app.advance(7*24*60*60*1000);
  app.listeners.get('focus')();app.listeners.get('visibilitychange')();
  assert.equal(app.requests.length,2,'one request for an idle return');
  app.finish(1,['first','new']);await tick();
  assert.deepEqual(app.rendered.at(-1),['first','new']);
  app.nodes.groupsPage.hidden=true;app.advance(60001);
  app.listeners.get('focus')();
  assert.equal(app.requests.length,2,'hidden Groups waits until visited');
});

test('failed refreshes remain retryable and an aborted older request cannot replace newer data',async()=>{
  const app=setup();app.advance(60001);
  app.ensure();app.requests[0].reject(new Error('offline'));await tick();
  assert.equal(app.state.players[0].rows[0].id,'old');
  assert.equal(app.state.groupController,null);
  assert.ok(app.statuses.some(([message,error])=>error&&message.includes('offline')));
  app.ensure();assert.equal(app.requests.length,2);
  app.listeners.get('nickstats:matches-changed')();
  assert.equal(app.requests.length,3);
  app.finish(2,['newest']);await tick();
  app.finish(1,['stale']);await tick();
  assert.deepEqual(app.rendered,[['newest']]);
});

test('invalid or wholly excluded saved selections never auto-build',()=>{
  const app=setup();app.state.players=[];
  app.state.choices.set('1','exclude');app.ensure();
  app.state.choices.set('1','include');app.state.selected.delete('2');app.ensure();
  assert.equal(app.requests.length,0);
});
