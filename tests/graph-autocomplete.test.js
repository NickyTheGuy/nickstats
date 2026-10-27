const test = require('node:test'), assert = require('node:assert/strict');
const modulePromise = import('../frontend/features/graphs/state/metric-picker.mjs');
const choices = [{ id: 'rating', label: 'Rating', group: 'Core' }, { id: 'kills', label: 'Kills', group: 'Core' },
  { id: 'opening', label: 'Opening kills per round', group: 'Opening' }, { id: 'tag:1', label: 'Sleep hours', group: 'Tags' }];
const config = { choices, categories: [['All','All categories'], ['Core','Core'], ['Opening','Opening'], ['Tags','Tags']], metricId:'rating', category:'Core', query:null };

test('metric search respects empty-query categories and searches across categories with every word', async () => {
  const { metricSuggestions } = await modulePromise;
  assert.deepEqual(metricSuggestions(choices, 'Core').map(c=>c.id), ['rating','kills']);
  assert.deepEqual(metricSuggestions(choices, 'Core','ROUND OPENING').map(c=>c.id), ['opening']);
  assert.deepEqual(metricSuggestions(choices, 'All','tags sleep').map(c=>c.id), ['tag:1']);
  assert.equal(metricSuggestions(choices, 'Core','missing').length, 0);
  assert.equal(metricSuggestions(Array.from({length:50},(_,i)=>({id:i,label:'Match',group:'Core'})), 'All').length, 30);
});

test('keyboard movement wraps, Enter selects and Escape restores the last selection', async () => {
  const { createMetricPicker } = await modulePromise;
  const selected=[], store=createMetricPicker({onSelect:state=>selected.push(state.metricId)});store.sync(config);
  store.move(-1);assert.equal(store.getSnapshot().index,1);store.enter();assert.deepEqual(selected,['kills']);
  assert.equal(store.getSnapshot().open,false);store.input('Opening');store.move(1);store.move(1);assert.equal(store.getSnapshot().index,0);
  store.escape();assert.equal(store.getSnapshot().metricId,'kills');assert.equal(store.getSnapshot().query,null);
  store.enter();assert.deepEqual(selected,['kills']);store.input('no match');store.move(-1);store.enter();assert.equal(store.getSnapshot().index,-1);
});

test('category edits clear the draft, cross-category selection changes its category and All remains All', async () => {
  const { createMetricPicker } = await modulePromise;
  const drafts=[],store=createMetricPicker({onDraft:state=>drafts.push(state.query)});store.sync(config);
  store.input('sleep');store.choose('tag:1');assert.equal(store.getSnapshot().category,'Tags');
  store.category('Opening');assert.equal(store.getSnapshot().query,'');assert.equal(store.getSnapshot().open,true);
  store.category('All');store.choose('rating');assert.equal(store.getSnapshot().category,'All');
  store.choose('removed');assert.equal(store.getSnapshot().metricId,'rating');assert.deepEqual(drafts,['sleep','','']);
});

test('axis stores remain independent and synchronization retains drafts while replacing revoked tag choices', async () => {
  const { createMetricPicker } = await modulePromise;
  const y=createMetricPicker({}),x=createMetricPicker({});y.sync(config);x.sync(config);
  y.input('');y.close();y.sync({...config,query:''});assert.equal(y.getSnapshot().query,'');assert.equal(x.getSnapshot().query,null);
  x.input('sleep');x.choose('tag:1');x.sync({...config,choices:choices.filter(c=>c.group!=='Tags'),query:null});x.choose('tag:1');
  assert.equal(x.getSnapshot().metricId,'rating');assert.equal(x.getSnapshot().open,false);
  let count=0;const off=y.subscribe(()=>count++);y.label('Y-axis');y.label('Y-axis');assert.equal(count,1);off();y.open();assert.equal(count,1);
});
