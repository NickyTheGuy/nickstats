const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const loaded = Promise.all([
  import('../frontend/features/groups/state/rules.mjs'),
  import('../frontend/features/groups/state/editing.mjs')
]);
const source = fs.readFileSync(require.resolve('../frontend/features/groups/hooks/useRuleGestures.js'),'utf8')
  .replace(/^import .*;\n/gm,'').replace('export default function','function');

function fixture(editing, rules) {
  const values=[], updates=[], moves=[], capture=new Set();
  let cursor=0, drop=null, api;
  const board={setPointerCapture:id=>capture.add(id),hasPointerCapture:id=>capture.has(id),releasePointerCapture:id=>capture.delete(id)};
  const sandbox={
    ...editing,
    useRef:initial=>{const i=cursor++;if(!(i in values))values[i]={current:initial};return values[i];},
    useState:initial=>{const i=cursor++;if(!(i in values))values[i]=initial;return [values[i],value=>{values[i]=typeof value==='function'?value(values[i]):value;}];},
    document:{elementsFromPoint:()=>drop?[drop]:[]}
  };
  const hook=vm.runInNewContext(source+'\nuseRuleGestures',sandbox);
  function render(){cursor=0;api=hook({rules,onRules:value=>updates.push(value),onMove:(moving,target)=>moves.push({moving,target})});api.board.current=board;return api;}
  render();
  return {render,updates,moves,setDrop:value=>{drop=value;}};
}
function container(id,children=[]) {
  const node={dataset:{dropGroup:id,movableId:id},classList:{contains:()=>false},
    getBoundingClientRect:()=>({left:0,top:0,right:100,bottom:100}),
    querySelector:()=>({children}),closest:selector=>selector==='[data-drop-group]'?node:null};
  return node;
}
const cell=(id,left,top)=>({dataset:{movableId:id},getBoundingClientRect:()=>({left,top,right:left+10,bottom:top+10})});
function background(parent){return {closest:selector=>selector==='[data-drop-group]'||selector==='[data-movable-id]'?parent:null};}
function event(target,x=5,y=5,extra={}){return {target,clientX:x,clientY:y,button:0,isPrimary:true,pointerId:7,pointerType:'mouse',preventDefault(){},stopPropagation(){},...extra};}

test('marquee starts within a nested group and only selects its direct children',async()=>{
  const [{group,condition},editing]=await loaded;
  const [a,b,c]=['1','2','3'].map(id=>condition(id)),nested=group('or',[a,b,c]);
  const rules={friendly:group('and',[nested]),enemy:group()};
  const inner=container(nested.id,[cell(a.id,10,10),cell(b.id,30,10),cell(c.id,80,80)]);
  const target=background(inner),view=fixture(editing,rules),api=view.render();
  api.boardEvents.onPointerDown(event(target));
  api.boardEvents.onPointerMove(event(target,60,60));
  api.boardEvents.onPointerUp(event(target,60,60));
  assert.equal(view.updates.length,1);
  const updated=editing.findRule(view.updates[0],nested.id).node;
  assert.equal(updated.children.length,2);
  assert.equal(updated.children[0].children.length,2);
  assert.equal(updated.children[1].id,c.id);
});

test('selecting an entire nested group does not wrap it but its selected cells drag together',async()=>{
  const [{group,condition},editing]=await loaded;
  const [a,b]=['1','2'].map(id=>condition(id)),nested=group('or',[a,b]);
  const rules={friendly:group('and',[nested]),enemy:group()};
  const inner=container(nested.id,[cell(a.id,10,10),cell(b.id,30,10)]),target=background(inner);
  const view=fixture(editing,rules);
  let api=view.render();
  api.boardEvents.onPointerDown(event(target));
  api.boardEvents.onPointerMove(event(target,60,60));
  api.boardEvents.onPointerUp(event(target,60,60));
  assert.equal(view.updates.length,0);
  api=view.render();
  assert.deepEqual(Array.from(api.selected),[a.id,b.id]);
  view.setDrop(container(rules.enemy.id));
  api.begin(event(target),{id:a.id});
  api.boardEvents.onPointerMove(event(target,70,70));
  api.boardEvents.onPointerUp(event(target,70,70));
  assert.deepEqual(Array.from(view.moves[0].moving.ids),[a.id,b.id]);
  assert.equal(view.moves[0].target,rules.enemy.id);
});

test('dragging a member of a selected whole group moves that group; a click can select the member alone',async()=>{
  const [{group,condition},editing]=await loaded;
  const [a,b]=['1','2'].map(id=>condition(id)),nested=group('or',[a,b]);
  const rules={friendly:group('and',[nested]),enemy:group()},view=fixture(editing,rules),target=background(container(nested.id));
  let api=view.render();api.select(nested.id,true);api=view.render();
  view.setDrop(container(rules.enemy.id));
  api.begin(event(target),{id:a.id});
  api.boardEvents.onPointerMove(event(target,70,70));
  api.boardEvents.onPointerUp(event(target,70,70));
  assert.deepEqual(Array.from(view.moves[0].moving.ids),[nested.id]);
  api=view.render();
  api.begin(event(target),{id:a.id});
  api.boardEvents.onPointerUp(event(target));
  assert.deepEqual(Array.from(view.render().selected),[a.id]);
});

test('keyboard grouping uses the same nested rules without on-screen action buttons',async()=>{
  const [{group,condition},editing]=await loaded;
  const [a,b,c]=['1','2','3'].map(id=>condition(id)),nested=group('or',[a,b,c]);
  const rules={friendly:group('and',[nested]),enemy:group()},view=fixture(editing,rules);
  let api=view.render();api.select(a.id,true);api=view.render();api.select(b.id,true);api=view.render();
  api.boardEvents.onKeyDown({key:'g',ctrlKey:true,shiftKey:false,preventDefault(){}});
  assert.equal(view.updates.length,1);
  assert.equal(editing.findRule(view.updates[0],nested.id).node.children.length,2);
});
