const test = require('node:test'), assert = require('node:assert/strict');
const modules = import('../frontend/features/graphs/state/graph-settings.mjs');
const config = {metricId:'kills', xMetricId:'tag:1', supportsRounds:true, roundOnly:false};

test('graph view constraints enforce round differential and restore match view for unsupported stats', async () => {
  const {createGraphSettings}=await modules, store=createGraphSettings();store.configure(config);
  store.set('scope','session');store.configure({...config,metricId:'round_diff',roundOnly:true});assert.equal(store.getSnapshot().scope,'round');
  store.set('scope','match');assert.equal(store.getSnapshot().scope,'round');
  store.configure({...config,metricId:'rating',supportsRounds:false});assert.equal(store.getSnapshot().scope,'match');
  store.set('scope','round');assert.equal(store.getSnapshot().scope,'match');store.set('scope','session');assert.equal(store.getSnapshot().scope,'session');
});

test('range and manual drafts belong to the bucket statistic, including the X axis of relationships', async () => {
  const {createGraphSettings}=await modules, store=createGraphSettings();store.configure(config);
  store.range(0,'0.1');store.range(1,'30');store.manual('1,2,3');
  store.configure({...config,metricId:'deaths'});assert.equal(store.getSnapshot().ranges.has('deaths'),false);
  store.range(0,'5');store.set('type','relationship');assert.equal(store.bucketKey(),'tag:1');store.manual('4,8,12');
  store.set('scope','round');assert.equal(store.bucketKey(),'deaths');store.set('scope','match');assert.equal(store.bucketKey(),'tag:1');
  store.set('type','distribution');store.configure(config);
  assert.deepEqual(store.getSnapshot().ranges.get('kills'),['0.1','30','']);assert.equal(store.getSnapshot().cutoffs.get('kills'),'1,2,3');assert.equal(store.getSnapshot().cutoffs.get('tag:1'),'4,8,12');
});

test('bucket stepper respects boundaries and settings reject unsupported values', async () => {
  const {createGraphSettings}=await modules, store=createGraphSettings();
  for(let i=0;i<50;i++)store.step(-1);assert.equal(store.getSnapshot().bucketCount,4);
  for(let i=0;i<50;i++)store.step(1);assert.equal(store.getSnapshot().bucketCount,24);
  store.set('type','unknown');store.set('mode','range');store.set('style','line');store.set('metricId','bad');
  assert.equal(store.getSnapshot().type,'distribution');assert.equal(store.getSnapshot().mode,'range');assert.equal(store.getSnapshot().style,'line');assert.equal(store.getSnapshot().metricId,'rating');
});

test('configuration and validation notify React without redraw loops, and instances stay independent', async () => {
  const {createGraphSettings}=await modules;let redraws=0,notifications=0;
  const first=createGraphSettings(()=>redraws++),second=createGraphSettings();const off=first.subscribe(()=>notifications++);
  first.configure(config);first.configure(config);first.validation('Invalid');first.validation('Invalid');assert.equal(notifications,2);assert.equal(redraws,0);
  first.set('mode','manual');first.manual('');assert.equal(redraws,2);assert.equal(second.getSnapshot().mode,'auto');
  off();first.validation('');assert.equal(notifications,4);assert.equal(first.getSnapshot(),first.getSnapshot());
});
