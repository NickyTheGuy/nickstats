const {test}=require('node:test'),assert=require('node:assert/strict');
const api=()=>import('../frontend/features/analyzer/state/map-view.mjs');
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('Wheel zoom keeps the radar point under the pointer fixed in rectangular panes',async()=>{
  const {transformMapView}=await api(),{pointerToRadar}=await import('../frontend/features/analyzer/state/area-selection.mjs');
  for(const rect of [{left:10,top:20,width:1400,height:700},{left:10,top:20,width:700,height:1400}]){
    const point={x:rect.left+rect.width*.55,y:rect.top+rect.height*.55},view={zoom:1.5,x:20,y:-10},before=pointerToRadar(point,rect,view),next=transformMapView(view,1.2,point,point,rect),after=pointerToRadar(point,rect,next);close(before.x,after.x);close(before.y,after.y);close(next.zoom,1.8);
  }
});
test('Wheel units normalize, extreme gestures stay bounded, and zooming out to fit recenters',async()=>{
  const {transformMapView,wheelZoomFactor}=await api(),rect={left:0,top:0,width:1024,height:1024},point={x:512,y:512};
  close(wheelZoomFactor(1,1),wheelZoomFactor(16,0));assert.ok(wheelZoomFactor(-100)>1);assert.ok(wheelZoomFactor(100)<1);close(wheelZoomFactor(100000),wheelZoomFactor(100));
  assert.deepEqual(transformMapView({zoom:2,x:300,y:200},.01,point,point,rect),{zoom:1,x:0,y:0});assert.equal(transformMapView({zoom:2,x:0,y:0},100,point,point,rect).zoom,4);
  assert.deepEqual(transformMapView({zoom:2,x:0,y:0},1,point,{x:5000,y:-5000},rect),{zoom:2,x:512,y:-512});
});
test('Two-finger pinch and pan preserve the shared center point and the zoom-at-fit bounds',async()=>{
  const {touchTransform}=await api(),{pointerToRadar}=await import('../frontend/features/analyzer/state/area-selection.mjs'),rect={left:0,top:0,width:1024,height:1024},view={zoom:1,x:0,y:0};
  const before=[{x:400,y:500},{x:600,y:500}],after=[{x:350,y:550},{x:750,y:550}],next=touchTransform(view,before,after,rect);assert.equal(next.zoom,2);
  const a=pointerToRadar({x:500,y:500},rect,view),b=pointerToRadar({x:550,y:550},rect,next);close(a.x,b.x);close(a.y,b.y);
  assert.deepEqual(touchTransform(view,before,[{x:450,y:500},{x:550,y:500}],rect),{zoom:1,x:0,y:0});
});
