const test=require('node:test'),assert=require('node:assert/strict');
const modules=import('../frontend/state/chart.mjs');
test('tooltip boxes remain within horizontal graph bounds and flip below markers near the top',async()=>{
 const {tooltipBox}=await modules;
 for(const x of [-100,0,450,900,1200]){
  const box=tooltipBox({label:'Player · value',x,y:30});assert.ok(box.x>=5);assert.ok(box.x+box.width<=895);assert.equal(box.y,40);
 }
 assert.equal(tooltipBox({label:'Value',x:450,y:200}).y,164);
 assert.equal(tooltipBox({label:'x'.repeat(300),x:450,y:200}).width,360);
});
test('chart models own independent mark arrays and SVG props preserve accessible labels and line styling',async()=>{
 const {chartFrame,chartMark,svgProps}=await modules;
 const first=chartFrame(),second=chartFrame();const attributes={'class':'graph-point','aria-label':'Nick: 2','text-anchor':'middle','stroke-width':2};
 const mark=chartMark('circle',attributes);first.add(mark);attributes['aria-label']='Changed';assert.equal(second.marks.length,0);assert.equal(first.marks[0].attributes['aria-label'],'Nick: 2');
 assert.deepEqual(svgProps(mark.attributes),{className:'graph-point','aria-label':'Nick: 2',textAnchor:'middle',strokeWidth:2});
});
