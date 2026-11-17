const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../js/players.js'),'utf8');
const start = source.indexOf('  function expandDenseProfile('), end = source.indexOf('  function setPlayerView(',start);
const decode = vm.runInNewContext(`${source.slice(start,end)} expandDenseProfile`);

test('dense Groups preserves sparse historical counters, zeros, metadata and both players',()=>{
  const payload = {stat_keys:['deaths','kills','new_counter'],players:[
    {id:1,name:'One',steam_id:'76561198000000001',matches:[{id:10,teammate_ids:[2],round_kills:[{round:1,kills:2}],
      sides:[{side:'T',buy_type:'ALL',stats:[0,12,null],weapons:[]}]}]},
    {id:2,name:'Two',matches:[{id:10,sides:[{side:'CT',round_phase:'OT',hero:true,stats:[3,0,4]}]}]}
  ]};
  const result = decode(payload);
  assert.equal(result.players.length,2);
  assert.deepEqual({...result.players[0].matches[0].sides[0].stats},{deaths:0,kills:12});
  assert.deepEqual({...result.players[1].matches[0].sides[0].stats},{deaths:3,kills:0,new_counter:4});
  assert.equal(result.players[0].steam_id,'76561198000000001');
  assert.equal(result.players[0].matches[0].round_kills[0].kills,2);
  assert.equal(result.players[1].matches[0].sides[0].hero,true);
  assert.ok(!Object.hasOwn(result,'stat_keys'));
  assert.equal(decode(result),result,'already-expanded responses are accepted');
});

test('old-server verbose group responses and empty groups remain compatible',()=>{
  const payload={players:[{id:1,matches:[{id:10,sides:[{stats:{kills:0}}]}]}]};
  assert.equal(decode(payload),payload);
  assert.equal(decode({stat_keys:[],players:[]}).players.length,0);
});

test('shared layouts decode to the same stats as padded arrays across players and slices',()=>{
  const metadata = {side:'T',buy_type:'FULL',opponent_buy_type:'ECO',round_result:'W',
    round_phase:'OT',hero:true,weapons:[{weapon:'ak47',kills:2}]};
  const padded = {stat_keys:['damage','deaths','kills'],players:[
    {id:1,steam_id:'1',name:'One',matches:[{id:10,played_at:123,teammate_ids:[2],
      round_kills:[{round:1,kills:2}],sides:[{...metadata,stats:[null,0,2]},{side:'CT',stats:[80,null,0]}]}]},
    {id:2,name:'Two',matches:[{id:11,sides:[{side:'T',stats:[null,3,1]},{side:'CT',stats:[null,null,null]}]}]}
  ]};
  const shared = JSON.parse(JSON.stringify(padded));
  shared.stat_layouts = [[1,2],[0,2],[]];
  const rows = shared.players.flatMap(player=>player.matches.flatMap(match=>match.sides));
  rows[0].stat_layout=0; rows[0].stats=[0,2];
  rows[1].stat_layout=1; rows[1].stats=[80,0];
  rows[2].stat_layout=0; rows[2].stats=[3,1];
  rows[3].stat_layout=2; rows[3].stats=[];
  const result = decode(shared);
  assert.equal(JSON.stringify(result),JSON.stringify(decode(padded)));
  assert.ok(!Object.hasOwn(result,'stat_layouts'));
  assert.ok(!Object.hasOwn(rows[0],'stat_layout'));
  assert.equal(decode(result),result);
});

test('shared layouts support empty statistics and empty groups',()=>{
  const payload = {stat_keys:[],stat_layouts:[[]],players:[{id:1,matches:[{sides:[{stat_layout:0,stats:[]}]}]}]};
  const result = decode(payload);
  assert.deepEqual({...result.players[0].matches[0].sides[0].stats},{});
  assert.ok(!Object.hasOwn(result,'stat_layouts'));
  assert.equal(decode({stat_keys:[],stat_layouts:[],players:[]}).players.length,0);
});

test('invalid shared layouts fail instead of assigning counters to the wrong stat',()=>{
  const payload = (layout, id=0, values=[2]) => ({stat_keys:['kills'],stat_layouts:[layout],
    players:[{matches:[{sides:[{stat_layout:id,stats:values}]}]}]});
  for (const invalid of [payload([1]),payload([-1]),payload([0.5]),payload([0],1),payload([0],0,[])]) {
    assert.throws(()=>decode(invalid),/Invalid group statistic/);
  }
});

test('individual padded profiles still preserve zero and unavailable statistics',()=>{
  const result = decode({player:{id:1},stat_keys:['kills','deaths','damage'],matches:[
    {id:10,sides:[{stats:[0,null,80]}]}
  ]});
  assert.deepEqual({...result.matches[0].sides[0].stats},{kills:0,damage:80});
  assert.equal(result.player.id,1);
});

test('shared-layout individual profiles decode with the original identity and match metadata',()=>{
  const payload = {player:{id:1,steam_id:'1',first_seen_at:50,last_seen_at:100},
    stat_keys:['damage','deaths','kills'],stat_layouts:[[1,2]],matches:[
      {id:10,played_at:100,teammate_ids:[2],sides:[{side:'T',stat_layout:0,stats:[0,2]}]}
    ]};
  const result = decode(payload);
  assert.deepEqual({...result.matches[0].sides[0].stats},{deaths:0,kills:2});
  assert.equal(result.player.first_seen_at,50);
  assert.equal(result.matches[0].played_at,100);
  assert.equal(decode(result),result);
});

test('wire-4 Groups keeps per-player layouts independent and normalizes the group envelope',()=>{
  const payload = {players:[
    {player:{id:1,steam_id:'1',name:'One'},stat_keys:['deaths','kills'],stat_layouts:[[0,1]],
      matches:[{id:10,teammate_ids:[2],sides:[{side:'T',stat_layout:0,stats:[0,2]}]}]},
    {player:{id:2,steam_id:'2',name:'Two'},stat_keys:['damage','kills'],stat_layouts:[[0,1]],
      matches:[{id:10,sides:[{side:'CT',hero:true,stat_layout:0,stats:[80,0]}]}]}
  ]};
  const result = decode(payload);
  assert.equal(result.players[0].id,1);
  assert.equal(result.players[1].name,'Two');
  assert.deepEqual({...result.players[0].matches[0].sides[0].stats},{deaths:0,kills:2});
  assert.deepEqual({...result.players[1].matches[0].sides[0].stats},{damage:80,kills:0});
  assert.equal(result.players[1].matches[0].sides[0].hero,true);
  assert.equal(result.players[0].matches[0].teammate_ids[0],2);
  assert.equal(decode(result),result);
  assert.ok(!Object.hasOwn(result.players[0],'stat_keys'));
});

test('wire-4 empty player histories remain distinct and malformed inner layouts fail',()=>{
  const result = decode({players:[{player:{id:1},stat_keys:[],stat_layouts:[],matches:[]}]});
  assert.equal(result.players[0].id,1);
  assert.equal(result.players[0].matches.length,0);
  assert.throws(()=>decode({players:[{player:{id:1},stat_keys:['kills'],stat_layouts:[[1]],
    matches:[{sides:[{stat_layout:0,stats:[2]}]}]}]}),/Invalid group statistic/);
});
