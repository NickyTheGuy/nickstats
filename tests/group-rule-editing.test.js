const test = require('node:test');
const assert = require('node:assert/strict');
const loaded = Promise.all([import('../frontend/features/groups/state/rules.mjs'),import('../frontend/features/groups/state/editing.mjs')]);

test('marquee grouping wraps separate atoms once and cannot repeatedly nest an existing group',async()=>{
  const [{group,condition},{groupSelection,findRule}]=await loaded;
  const cells=['1','2','3'].map(id=>condition(id));
  const rules={friendly:group('and',cells),enemy:group()};
  const result=groupSelection(rules,[cells[1].id,cells[2].id]);
  assert.equal(result.rules.friendly.children.length,2);
  assert.deepEqual(findRule(result.rules,result.groupId).node.children.map(node=>node.playerId),['2','3']);
  assert.equal(groupSelection(result.rules,[cells[1].id,cells[2].id]),null);
  assert.equal(groupSelection(result.rules,[result.groupId]),null);
  const single = groupSelection(result.rules,[cells[0].id]);
  assert.ok(single, 'an ungrouped player can get its own condition outline once');
  assert.equal(groupSelection(single.rules,[single.groupId]),null);
  assert.ok(groupSelection(result.rules,[cells[0].id,cells[1].id]),'a free cell and an existing group can form meaningful nesting');
});

test('moving cells between teams preserves include/exclude and never duplicates a player condition',async()=>{
  const [{group,condition},{moveCondition,findRule,removeCondition}]=await loaded;
  const cell=condition('1',true),rules={friendly:group('and',[cell]),enemy:group()};
  const moved=moveCondition(rules,cell.id,rules.enemy.id);
  assert.equal(moved.friendly.children.length,0);
  assert.equal(moved.enemy.children[0].exclude,true);
  assert.equal(moved.enemy.children[0].id,cell.id);
  assert.equal(moveCondition(moved,cell.id,moved.enemy.id),moved);
  const removed=removeCondition(moved,cell.id);
  assert.equal(findRule(removed,cell.id),null);
});

test('group moves reject self/descendant drops and cross-team selections cannot be grouped',async()=>{
  const [{group,condition},{moveCondition,groupSelection}]=await loaded;
  const inside=group('or',[condition('2'),condition('3')]),outside=group('and',[inside,condition('1')]);
  const enemy=condition('4'),rules={friendly:group('and',[outside]),enemy:group('and',[enemy])};
  assert.equal(moveCondition(rules,outside.id,inside.id),rules);
  assert.equal(moveCondition(rules,inside.id,inside.id),rules);
  assert.equal(groupSelection(rules,[inside.id,enemy.id]),null);
  const moved=moveCondition(rules,outside.id,rules.enemy.id);
  assert.equal(moved.friendly.children.length,0);
  assert.equal(moved.enemy.children.length,2);
});

test('ungroup keeps child conditions; moves prune empty groups but preserve existing single-player outlines and NONE negation',async()=>{
  const [{group,condition,evaluate},{ungroupCondition,removeCondition,findRule}]=await loaded;
  const one=condition('1'),two=condition('2'),cluster=group('or',[one,two]);
  const rules={friendly:group('and',[cluster]),enemy:group()};
  assert.deepEqual(ungroupCondition(rules,cluster.id).friendly.children.map(node=>node.id),[one.id,two.id]);
  const reduced=removeCondition(rules,two.id);
  assert.equal(reduced.friendly.children[0].children[0].id,one.id);
  const none=group('none',[one,two]);
  const negated=removeCondition({...rules,friendly:group('and',[none])},two.id);
  assert.equal(findRule(negated,none.id).node.op,'none');
  assert.equal(evaluate(negated.friendly,new Set(['1'])),false);
});

test('spatial edits enforce node/depth limits instead of silently truncating conditions',async()=>{
  const [{group,condition,MAX_RULE_NODES},{moveCondition,groupSelection}]=await loaded;
  const cells=Array.from({length:MAX_RULE_NODES-2},(_,i)=>condition(String(i+1)));
  const full={friendly:group('and',cells),enemy:group()};
  assert.equal(groupSelection(full,[cells[0].id]),null);
  const target=group('and',[condition('1')]);
  let chain=target;
  for(let i=0;i<4;i++)chain=group('and',[chain]);
  const moving=group('or',[condition('2'),condition('3')]);
  const deep={friendly:group('and',[chain]),enemy:group('and',[moving])};
  assert.equal(moveCondition(deep,moving.id,target.id),deep);
});


test('legacy player exclusions become editable Exclude outlines without changing matches',async()=>{
  const [{group,condition,evaluate},{normalizeEditorRules,usedPlayers}]=await loaded;
  const legacy={friendly:group('and',[condition('1'),condition('2',true)]),enemy:group('none',[condition('3',true)])};
  const converted=normalizeEditorRules(legacy,['1','2','3']);
  assert.equal(converted.friendly.children[1].op,'none');
  assert.equal(converted.friendly.children[1].children[0].exclude,false);
  for(let mask=0;mask<8;mask++){
    const roster=new Set(['1','2','3'].filter((_,index)=>mask&(1<<index)));
    assert.equal(evaluate(converted.friendly,roster),evaluate(legacy.friendly,roster));
    assert.equal(evaluate(converted.enemy,roster),evaluate(legacy.enemy,roster));
  }
  assert.deepEqual([...usedPlayers(converted)].sort(),['1','2','3']);
  assert.equal(normalizeEditorRules(converted,['1','2','3']).friendly.children[1].id,converted.friendly.children[1].id);
});

test('previously unassigned players return to Friendly and empty outlines are removed',async()=>{
  const [{group,condition},{normalizeEditorRules,usedPlayers}]=await loaded;
  const rules={friendly:group('and',[condition('1'),group()]),enemy:group()};
  const converted=normalizeEditorRules(rules,['1','2']);
  assert.deepEqual(converted.friendly.children.map(node=>node.playerId),['1','2']);
  assert.deepEqual([...usedPlayers(converted)],['1','2']);
});

test('legacy exclusion migration has enough capacity for previously valid large and deep saves',async()=>{
  const [{group,condition,countNodes,MAX_RULE_NODES},{normalizeEditorRules}]=await loaded;
  const large={friendly:group('and',Array.from({length:78},(_,i)=>condition(String(i%2+1),true))),enemy:group()};
  const converted=normalizeEditorRules(large,Array.from({length:20},(_,i)=>String(i+1)));
  assert.equal(converted.friendly.children.filter(node=>node.op==='none').length,78);
  assert.ok(countNodes(converted.friendly)+countNodes(converted.enemy)<=MAX_RULE_NODES);
  let leaf=condition('1',true);
  for(let i=0;i<4;i++)leaf=group('and',[leaf]);
  const deep=normalizeEditorRules({friendly:group('and',[leaf]),enemy:group()},['1']);
  let node=deep.friendly;
  while(node.children?.[0]?.children)node=node.children[0];
  assert.equal(node.op,'none');
  assert.equal(node.children[0].playerId,'1');
  assert.equal(node.children[0].exclude,false);
});
