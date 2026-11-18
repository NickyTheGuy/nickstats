const test = require('node:test');
const assert = require('node:assert/strict');
const loaded = import('../frontend/features/groups/state/rules.mjs');

test('AND, OR, NONE and exactly-one XOR use Boolean condition semantics',async()=>{
  const {group,condition,evaluate} = await loaded;
  const clauses = ['1','2','3'].map(id=>condition(id));
  for (let mask=0;mask<8;mask++) {
    const present = clauses.filter((_,i)=>mask & 1<<i).map(node=>node.playerId);
    const roster = new Set(present);
    for (const [op,expected] of [['and',present.length===3],['or',present.length>0],['xor',present.length===1],['none',present.length===0]]) {
      assert.equal(evaluate(group(op,clauses),roster),expected,`${op}: ${mask}`);
    }
  }
  assert.equal(evaluate(group('xor',[group(),condition('1')]),new Set(['1'])),true,'empty branches are inactive');
  assert.equal(evaluate(condition('1',true),new Set()),true);
});

function histories() {
  const teams = {
    10:[['1','2'],['4']], 11:[['1','3'],['5']], 12:[['1'],['4']],
    13:[['1','2','3'],['4','5']], 14:[['1','4'],['2']],
    15:[['1','2'],['3']], 16:[['2'],['4']], 17:[['1','2','4'],['9']]
  };
  return ['1','2','3','4','5'].map(profileId=>({profileId,label:profileId,rows:Object.entries(teams)
    .filter(([,sides])=>sides.some(team=>team.includes(profileId)))
    .map(([id,sides])=>({id,date:Number(id),map:id==='11'?'de_nuke':'de_mirage',
      teammateIds:sides.find(team=>team.includes(profileId)).filter(id=>id!==profileId),kills:Number(profileId)}))}));
}

test('nested friendly Me AND (Alex OR Sam) versus (John OR Tim) works without an anchor',async()=>{
  const {group,condition,qualifyingMatches} = await loaded;
  const rules = {friendly:group('and',[condition('1'),group('or',[condition('2'),condition('3')])]),
    enemy:group('or',[condition('4'),condition('5')])};
  const players=histories();
  const matches=qualifyingMatches(players,rules);
  assert.deepEqual(matches.map(match=>match.id),['13','11','10']);
  assert.deepEqual(qualifyingMatches(players.slice().reverse(),rules).map(match=>match.id),['13','11','10']);
  assert.equal(matches.filter(match=>match.id==='13').length,1,'multiple matching OR alternatives never duplicate matches');
  assert.equal(matches.find(match=>match.id==='10').rows.some(item=>item.player.profileId==='3'),false,'absent Sam has no stat row');
  assert.deepEqual(qualifyingMatches(players,rules,row=>row.map==='de_nuke').map(match=>match.id),['11']);
  rules.enemy.op='xor';
  assert.deepEqual(qualifyingMatches(players,rules).map(match=>match.id),['11','10']);
});

test('exclusions apply to their own team and opposite-team presence is not same-team presence',async()=>{
  const {group,condition,qualifyingMatches} = await loaded;
  const rules={friendly:group('and',[condition('1'),condition('4',true)]),enemy:group()};
  const ids=qualifyingMatches(histories(),rules).map(match=>match.id);
  assert.ok(ids.includes('10'),'John on enemy team does not violate friendly exclusion');
  assert.ok(!ids.includes('17'),'John on friendly team violates friendly exclusion');
  assert.ok(!ids.includes('14'));
  rules.friendly=group('and',[condition('1'),condition('2')]);
  assert.ok(!qualifyingMatches(histories(),rules).some(match=>match.id==='14'),'same match on different teams is insufficient');
  rules.enemy=group('none',[condition('3')]);
  const selected=qualifyingMatches(histories(),rules).map(match=>match.id);
  assert.ok(selected.includes('13'),'Sam on friendly team does not violate enemy exclusion');
  assert.ok(!selected.includes('15'),'Sam on enemy team violates enemy exclusion');
});

test('unconstrained and exclusion-only sides allow the opposite orientation with no selected teammate',async()=>{
  const {group,condition,qualifyingMatches} = await loaded;
  const john=histories().filter(player=>player.profileId==='4');
  const rules={friendly:group('and',[condition('1',true)]),enemy:group('and',[condition('4')])};
  assert.ok(qualifyingMatches(john,rules).some(match=>match.id==='16'));
  const onlyMe=histories().filter(player=>player.profileId==='1');
  assert.equal(qualifyingMatches(onlyMe,{friendly:group('and',[condition('1')]),enemy:group()}).length,onlyMe[0].rows.length);
});

test('legacy saved selections migrate and removed players are pruned from nested rules',async()=>{
  const {group,condition,legacyRules,sanitizeRules,evaluate} = await loaded;
  const legacy=legacyRules([{player:{id:1},choice:'include'},{player:{id:2},choice:'exclude'}]);
  assert.equal(evaluate(legacy.friendly,new Set(['1'])),true);
  assert.equal(evaluate(legacy.friendly,new Set(['1','2'])),false);
  const query={friendly:group('and',[condition('1'),group('or',[condition('2'),condition('3')])]),enemy:group()};
  const clean=sanitizeRules(JSON.parse(JSON.stringify(query)),['1','3']);
  assert.equal(clean.friendly.children[1].children.length,1);
  assert.equal(clean.friendly.children[1].children[0].playerId,'3');
  assert.equal(clean.friendly.id,query.friendly.id,'stable component keys survive editing and storage');
});

test('saved expressions are bounded and invalid team metadata cannot match',async()=>{
  const {group,condition,sanitizeRules,countNodes,MAX_RULE_NODES,qualifyingMatches} = await loaded;
  const query={friendly:group('or',Array.from({length:200},()=>condition('1'))),enemy:group()};
  const clean=sanitizeRules(query,['1']);
  assert.ok(countNodes(clean.friendly)+countNodes(clean.enemy)<=MAX_RULE_NODES);
  const players=[{profileId:'1',rows:[{id:'1',teammateIds:[]}]},{profileId:'2',rows:[{id:'1',teammateIds:['1']}]}];
  assert.equal(qualifyingMatches(players,{friendly:group(),enemy:group()}).length,0);
});

test('complete opponent rosters satisfy conditions even when that player has no stat row',async()=>{
  const {group,condition,qualifyingMatches} = await loaded;
  const players=[{profileId:'1',rows:[{id:'1',teammateIds:['2'],opponentIds:['4','5']}]}];
  const rules={friendly:group('and',[condition('1')]),enemy:group('and',[condition('4')])};
  const matches=qualifyingMatches(players,rules);
  assert.equal(matches.length,1);
  assert.equal(matches[0].rows.length,1,'roster presence never fabricates a stats row');
  rules.enemy=group('and',[condition('4',true)]);
  assert.equal(qualifyingMatches(players,rules).length,0);
});
