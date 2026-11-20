const {test}=require('node:test'),assert=require('node:assert/strict');
const api=()=>import('../frontend/features/analyzer/state/map-selection.mjs');
const entry=(event,extra={})=>({roundKey:'u:1',player:'a',side:3,events:[event],utilities:[],...extra});
const sorted=rows=>rows.map(row=>({...row,events:[...(row.events||[])].sort(),utilities:[...row.utilities].sort()})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
test('Click removes only the clicked event, grenade or cell, retaining other selected atoms and actors',async()=>{
 const {mergeSelection,toggleSelection,entrySelected}=await api(),cell=entry(null,{events:[],cell:true}),kill=entry('kill:1'),other=entry('kill:2'),grenade=entry(null,{events:[],utilities:['g']}),second={...entry('death:1'),player:'b'};
 let selected=mergeSelection([], [cell,kill,other,grenade,second]);
 selected=toggleSelection(selected,[kill]);assert.equal(entrySelected(kill,selected),false);assert.equal(entrySelected(other,selected),true);assert.equal(entrySelected(cell,selected),true);assert.equal(entrySelected(second,selected),true);
 selected=toggleSelection(selected,[grenade]);assert.equal(entrySelected(grenade,selected),false);selected=toggleSelection(selected,[cell]);assert.equal(entrySelected(cell,selected),false);assert.equal(entrySelected(other,selected),true);
 selected=toggleSelection(selected,[other]);assert.equal(selected.length,1);selected=toggleSelection(selected,[second]);assert.deepEqual(selected,[]);
});
test('Plain/additive click semantics remain intact, grouped markers normalize duplicates and drags never toggle',async()=>{
 const {mergeSelection,toggleSelection,entrySelected}=await api(),a=entry('a'),b=entry('b'),c={...entry('c'),player:'b'};
 assert.equal(entrySelected(c,toggleSelection([c],[a])),false);assert.equal(entrySelected(c,toggleSelection([c],[a],true)),true);
 let selected=mergeSelection([], [a,b,c]);assert.equal(entrySelected(a,mergeSelection(selected,[a,b],true)),true);assert.equal(entrySelected(a,mergeSelection(selected,[a,b])),true);
 selected=toggleSelection(selected,[a,a,b]);assert.equal(selected.length,1);assert.equal(entrySelected(c,selected),true);
});
test('Invert chooses the remaining six of eleven visible kills and is reversible while retaining hidden selection',async()=>{
 const {mergeSelection,invertSelection,entrySelected}=await api(),visible=Array.from({length:11},(_,i)=>entry(`kill:${i}`)),hidden={...entry('hidden'),roundKey:'u:2'},selected=mergeSelection([], [...visible.slice(0,5),hidden]);
 const inverted=invertSelection(selected,[...visible,...visible]);assert.equal(visible.filter(item=>entrySelected(item,inverted)).length,6);assert.equal(entrySelected(hidden,inverted),true);assert.ok(visible.slice(0,5).every(item=>!entrySelected(item,inverted)));
 assert.deepEqual(sorted(invertSelection(inverted,visible)),sorted(selected));assert.deepEqual(sorted(invertSelection([],visible)),sorted(mergeSelection([],visible)));
});
test('Inversion handles partially selected actor groups and duplicate grenade representations atomically',async()=>{
 const {mergeSelection,invertSelection,entrySelected}=await api(),cell=entry('',{events:[],cell:true}),a=entry('a'),b=entry('b'),grenade=entry('',{events:[],utilities:['g']});
 const inverse=invertSelection(mergeSelection([],[cell,a]),[cell,a,b,grenade,grenade]);assert.equal(entrySelected(cell,inverse),false);assert.equal(entrySelected(a,inverse),false);assert.equal(entrySelected(b,inverse),true);assert.equal(entrySelected(grenade,inverse),true);
 assert.equal(invertSelection(inverse,[b,grenade]).length,0);
});
test('Visible universe matches marker clipping after zoom/pan and inversion ignores typing or modified/repeated shortcuts',async()=>{
 const {visibleMapCandidates,invertSelectionShortcut}=await api(),candidates=[{x:512,y:512,entry:entry('a')},{x:0,y:0,entry:entry('b')},{x:1024,y:1024,entry:entry('c')}];
 assert.equal(visibleMapCandidates(candidates,{width:1024,height:1024},{zoom:1,x:0,y:0}).length,3);assert.equal(visibleMapCandidates(candidates,{width:1024,height:1024},{zoom:2,x:0,y:0}).length,1);assert.equal(visibleMapCandidates(candidates,{width:0,height:0},{zoom:1,x:0,y:0}).length,0);
 assert.equal(invertSelectionShortcut({key:'i'}),true);assert.equal(invertSelectionShortcut({key:'I'}),true);for(const key of ['ctrlKey','metaKey','altKey','repeat'])assert.equal(invertSelectionShortcut({key:'i',[key]:true}),false);assert.equal(invertSelectionShortcut({key:'i',target:{closest:()=>({})}}),false);
});
