const test = require('node:test'), assert = require('node:assert/strict');
const modules = import('../frontend/state/graph-output.mjs');
const metric = {label:'Rating',digits:2,suffix:'%'}, xMetric={label:'Sleep',digits:1,suffix:'h'};
const base = {roundsMode:false,relationship:false,metric,xMetric,unit:'match',colors:['red','blue','green'],note:'Graph note',format:(value,metric)=>`${value.toFixed(metric.digits)}${metric.suffix}`};

test('graph summary preserves population deviation, median, formatting and sample count without changing source order', async () => {
  const {graphOutputModel}=await modules;
  const values=[9,2,4,4,4,5,5,7].map(value=>({value}));
  const model=graphOutputModel({...base,series:[{id:'1',label:'Nick',values}]});
  assert.equal(model.cards[0].lines[0],'Mean 5.00% · Median 4.50% · SD 2.00% · Range 2.00%–9.00% · n=8');
  assert.deepEqual(values.map(point=>point.value),[9,2,4,4,4,5,5,7]);assert.equal(model.note,'Graph note');assert.equal(model.empty,'');
});

test('relationship summaries use the same paired samples for both axes and distinguish match/session counts', async () => {
  const {graphOutputModel}=await modules;
  const series=[{id:'1',label:'Nick',values:[{value:8,y:10},{value:6,y:30}]}];
  const model=graphOutputModel({...base,series,relationship:true,unit:'session'});
  assert.equal(model.cards[0].lines[0],'X · Sleep: Mean 7.0h · Median 7.0h · SD 1.0h · Range 6.0h–8.0h');
  assert.equal(model.cards[0].lines[1],'Y · Rating: Mean 20.00% · Median 20.00% · SD 10.00% · Range 10.00%–30.00%');
  assert.equal(model.cards[0].lines[2],'2 paired sessions');
  assert.equal(graphOutputModel({...base,series,relationship:true}).cards[0].lines[2],'2 paired matches');
});

test('round summaries count distinct numbered rounds and actual appearances, while colors and IDs survive filtering', async () => {
  const {graphOutputModel}=await modules;
  const series=[{id:'2',label:'Same name',colorIndex:4,roundValues:[{appearances:3},{appearances:1}]},{id:'3',label:'Same name',colorIndex:2,roundValues:[{appearances:1}]}];
  const full=graphOutputModel({...base,series,roundsMode:true});
  assert.equal(full.cards[0].lines[0],'2 numbered rounds · 4 played rounds');assert.equal(full.cards[0].color,'blue');
  const filtered=graphOutputModel({...base,series:[series[1]],roundsMode:true});assert.equal(filtered.cards[0].color,full.cards[1].color);assert.equal(filtered.cards[0].id,'3');assert.notEqual(full.cards[0].id,full.cards[1].id);
});

test('empty graph messages distinguish match, session and unavailable round data, and single values have zero deviation', async () => {
  const {graphOutputModel}=await modules;
  assert.equal(graphOutputModel({...base,series:[]}).empty,'No qualifying match samples for this statistic.');
  assert.equal(graphOutputModel({...base,series:[],unit:'session'}).empty,'No qualifying session samples for this statistic.');
  assert.match(graphOutputModel({...base,series:[],roundsMode:true}).empty,/No per-round data.*Reparse/);
  const single=graphOutputModel({...base,series:[{label:'Nick',values:[{value:-2}]}]});
  assert.equal(single.cards[0].lines[0],'Mean -2.00% · Median -2.00% · SD 0.00% · Range -2.00%–-2.00% · n=1');
});
