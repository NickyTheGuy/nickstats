const {test}=require('node:test');
const assert=require('node:assert/strict');

function surface(){
  const doc=new EventTarget(),win=new EventTarget(),classes=new Set();
  doc.body={style:{overflow:'auto'}};doc.documentElement={style:{overflow:''}};doc.fullscreenElement=null;
  const target={classList:{add(...names){names.forEach(n=>classes.add(n));},remove(...names){names.forEach(n=>classes.delete(n));}}};
  return {doc,win,target,classes};
}
test('native fullscreen follows browser state and restores dimensions on Escape/native exit',async()=>{
  const {createFullscreenController}=await import('../frontend/shared/state/fullscreen.mjs'),s=surface(),states=[];
  s.target.requestFullscreen=async()=>{s.doc.fullscreenElement=s.target;s.doc.dispatchEvent(new Event('fullscreenchange'));};
  s.doc.exitFullscreen=async()=>{s.doc.fullscreenElement=null;s.doc.dispatchEvent(new Event('fullscreenchange'));};
  const control=createFullscreenController({getTarget:()=>s.target,document:s.doc,window:s.win,onChange:state=>states.push(state)});
  await control.toggle();assert.equal(control.getState().mode,'native');assert.ok(s.classes.has('ui-fullscreen-target'));assert.equal(s.doc.body.style.overflow,'auto');
  s.doc.fullscreenElement=null;s.doc.dispatchEvent(new Event('fullscreenchange'));assert.equal(control.getState().active,false);assert.equal(s.classes.size,0);
  await control.toggle();await control.toggle();assert.equal(control.getState().active,false);control.dispose();
});
test('unsupported or rejected native fullscreen uses a viewport fallback and restores scroll on exit/navigation',async()=>{
  const {createFullscreenController}=await import('../frontend/shared/state/fullscreen.mjs');
  for(const reject of [false,true]){
    const s=surface();if(reject)s.target.requestFullscreen=async()=>{throw new Error('unavailable');};
    const control=createFullscreenController({getTarget:()=>s.target,document:s.doc,window:s.win});
    await control.toggle();assert.equal(control.getState().mode,'viewport');assert.equal(s.doc.body.style.overflow,'hidden');assert.ok(s.classes.has('ui-fullscreen-fallback'));
    const event=new Event('keydown',{cancelable:true});Object.defineProperty(event,'key',{value:'Escape'});s.doc.dispatchEvent(event);
    assert.equal(control.getState().active,false);assert.equal(s.doc.body.style.overflow,'auto');assert.equal(s.doc.documentElement.style.overflow,'');
    await control.toggle();s.win.dispatchEvent(new Event('hashchange'));assert.equal(s.classes.size,0);assert.equal(control.getState().active,false);control.dispose();
  }
});
test('fullscreen disposal cleans up pending requests and never locks a removed viewer',async()=>{
  const {createFullscreenController}=await import('../frontend/shared/state/fullscreen.mjs'),s=surface();let resolve;
  s.target.requestFullscreen=()=>new Promise(done=>{resolve=done;});
  const control=createFullscreenController({getTarget:()=>s.target,document:s.doc,window:s.win});const pending=control.toggle();control.dispose();resolve();await pending;
  assert.equal(s.classes.size,0);assert.equal(s.doc.body.style.overflow,'auto');
});
test('webkit-prefixed fullscreen updates the same reusable controller',async()=>{
  const {createFullscreenController}=await import('../frontend/shared/state/fullscreen.mjs'),s=surface();
  s.target.webkitRequestFullscreen=()=>{s.doc.webkitFullscreenElement=s.target;s.doc.dispatchEvent(new Event('webkitfullscreenchange'));};
  s.doc.webkitExitFullscreen=()=>{s.doc.webkitFullscreenElement=null;s.doc.dispatchEvent(new Event('webkitfullscreenchange'));};
  const control=createFullscreenController({getTarget:()=>s.target,document:s.doc,window:s.win});await control.toggle();assert.equal(control.getState().mode,'native');await control.exit();assert.equal(control.getState().active,false);control.dispose();
});
