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
