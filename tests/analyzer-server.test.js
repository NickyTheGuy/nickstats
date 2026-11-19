const {test}=require('node:test'),assert=require('node:assert/strict');
const api=()=>import('../frontend/features/analyzer/state/server.mjs');
const queries=()=>import('../frontend/features/analyzer/state/query.mjs');
const fixtures=()=>import('./fixtures/analyzer.mjs');

test('Analyzer conditions use both team orientations, exact-one XOR and Exclude, with no anchor',async()=>{
  const {analyzerMatches,conditionPlayers}=await queries(),{group,condition}=await import('../frontend/features/groups/state/rules.mjs');
  const m=(id,a,b)=>({id,players:[...a.map(id=>({id,team:0})),...b.map(id=>({id,team:1}))]});
  const matches=[m(1,[1,2],[3]),m(2,[3],[1,2]),m(3,[1],[2,3]),m(4,[2],[3])];
  let rules={friendly:group('and',[condition(1),condition(2)]),enemy:group('or',[condition(3)])};
  assert.deepEqual(analyzerMatches(matches,rules).map(m=>m.id),[1,2]);
  rules.friendly=group('xor',[condition(1),condition(2)]);
  assert.deepEqual(analyzerMatches(matches,rules).map(m=>m.id),[3,4]);
  rules.friendly=group('and',[condition(1),group('none',[condition(2)])]);
  assert.deepEqual(analyzerMatches(matches,rules).map(m=>m.id),[3]);
  assert.deepEqual(conditionPlayers([1,2,3,4].map(id=>({id:String(id)})),rules).map(p=>p.id),['1','2','3']);
  assert.equal(analyzerMatches(matches,rules,()=>false).length,0);
});
test('Groups select all matching buys across matches while numbers and overtime halves remain independent',async()=>{
  const {groupRoundKeys}=await queries(),{replayFixture}=await fixtures();
  const replays=[replayFixture('one',60),replayFixture('two',60)];
  const filters={players:['steam:1'],buy:['full','force'],result:'win'};
  assert.equal(groupRoundKeys(replays,{},filters).length,60);
  assert.equal(groupRoundKeys(replays,{numbers:[3,4]},filters).length,0);
  assert.equal(groupRoundKeys(replays,{numbers:[3,4]},{players:['steam:1']}).length,4);
  const keys=groupRoundKeys(replays,{sections:['ot-1-1','ot-2-1']},{players:['steam:1']});
  assert.equal(keys.length,12);assert.ok(keys.some(k=>k.endsWith(':33')));assert.ok(!keys.some(k=>k.endsWith(':28')));
  assert.equal(groupRoundKeys(replays,{sections:['ot-1-1'],numbers:[25,31]},{players:['steam:1']}).length,2);
});
test('Analyzer handoff routes retain conditions, date/tag filters, map and match identity',async()=>{
  const {normalizeAnalyzerEntry,analyzerRoute,parseAnalyzerRoute}=await queries();
  const source={mode:'groups',players:[{id:1,name:'Nick & <Alex>',steam_id:'1'}],date:{from:'2026-01-01',through:'2026-11-18'},tags:[['tag-1','true']],map:'de_nuke'};
  const normalized=normalizeAnalyzerEntry(source);assert.deepEqual(parseAnalyzerRoute(analyzerRoute(normalized)),normalized);
  assert.deepEqual(parseAnalyzerRoute('#analyzer/match/123'),{mode:'match',matchID:'123'});
  assert.equal(parseAnalyzerRoute('#analyzer/groups?query=%7B'),null);
  assert.equal(parseAnalyzerRoute('#analyzer/match/-1'),null);
  assert.deepEqual(normalizeAnalyzerEntry({...source,tags:[null,{},['x',{}]],date:{from:'2026-99-99'}}).tags,[]);
  assert.equal(normalizeAnalyzerEntry({...source,date:{from:'2026-99-99'}}).date.from,'');
});
test('Roster lookup walks every page and does not stop at a local replay match-count cap',async()=>{
  const {candidateMatches}=await api();const paths=[];
  const found=await candidateMatches({players:[{id:1}]},async path=>{paths.push(path);return {matches:paths.length===1?Array.from({length:100},(_,id)=>({id})):Array.from({length:12},(_,i)=>({id:100+i}))};});
  assert.equal(found.length,112);assert.match(paths[1],/offset=100/);
});
test('Replay upload sends bounded chunks and checksummed manifests, publishing only after all rounds',async()=>{
  const {saveReplay}=await api(),{replayFixture}=await fixtures();const replay=replayFixture(),calls=[];
  replay.rounds[0].duration=600000;for(const track of replay.rounds[0].tracks)track.samples=Array.from({length:3001},(_,i)=>[i*200,1,2,0,100,3,45]);
  const old=global.window;global.window={dispatchEvent(){}};
  try {
    await saveReplay(4,replay,{},async(path,options)=>{calls.push([path,options]);if(path.endsWith('/captures'))return {capture:'capture'};});
    const manifest=JSON.parse(calls[0][1].body);assert.ok(manifest.rounds[0].parts>1);assert.equal(manifest.header.demo_sha256,replay.demo_sha256);assert.equal(manifest.header.rounds,undefined);
    const crypto=require('node:crypto');
    for(const item of manifest.rounds){const chunks=calls.filter(([path])=>path.includes(`/rounds/${item.number}/parts/`)).map(([,o])=>JSON.parse(o.body).data).join('');assert.equal(crypto.createHash('sha256').update(chunks).digest('hex'),item.sha256);assert.equal(Buffer.byteLength(chunks),item.bytes);}
    assert.ok(calls.every(([,o])=>!o.body||Buffer.byteLength(o.body)<2*1024*1024));assert.equal(calls.at(-1)[0],'/captures/capture/complete');
    calls.length=0;
    await assert.rejects(()=>saveReplay(4,replay,{},async path=>{calls.push(path);if(path.endsWith('/captures'))return {capture:'capture'};throw new Error('Disconnected');}),/Disconnected/);
    assert.ok(!calls.some(path=>path.endsWith('/complete')));
  }finally{global.window=old;}
});
test('Movement requests batch selected rounds per match, project players and preserve all names for tooltips',async()=>{
  const {loadSelectedRounds,summarizeRound}=await api(),{replayFixture,projected}=await fixtures();
  const full=[replayFixture('one'),replayFixture('two'),replayFixture('three')],index=full.map((r,i)=>({...r,capture:String(i),matchID:String(i+1),rounds:r.rounds.map(summarizeRound)}));
  let concurrent=0,maxConcurrent=0;const calls=[];
  const rounds=await loadSelectedRounds(index,index.flatMap(r=>r.rounds.filter(x=>[1,3].includes(x.number)).map(x=>`${r.match_uid}:${x.number}`)),['steam:1'],{},async(path,o)=>{
    calls.push(JSON.parse(o.body));maxConcurrent=Math.max(maxConcurrent,++concurrent);await new Promise(r=>setTimeout(r,5));concurrent--;const source=full[Number(path.split('/')[2])];return projected(source,calls.at(-1).rounds,['steam:1']);
  });
  assert.equal(calls.length,3);assert.equal(maxConcurrent,2);assert.equal(rounds.length,6);assert.ok(rounds.every(r=>r.tracks.length===1));assert.equal(rounds[0].match_id,'1');
});
test('Aborted and over-budget movement selections fail without returning a partial analysis',async()=>{
  const {loadSelectedRounds,summarizeRound}=await api(),{replayFixture,projected}=await fixtures();const r=replayFixture();const index={...r,capture:'1',rounds:r.rounds.map(summarizeRound)};
  const keys=r.rounds.map(x=>`${r.match_uid}:${x.number}`),request=async()=>projected(r,[1,2,3,4],['steam:1']);
  await assert.rejects(()=>loadSelectedRounds([index],keys,['steam:1'],{maxSamples:1},request),/memory budget/);
  const controller=new AbortController();
  await assert.rejects(()=>loadSelectedRounds([index],keys,['steam:1'],{signal:controller.signal},async()=>{controller.abort();return request();}),/abort/i);
});
test('Replay indexes batch large histories and restore requested order independently of SQL ordering',async()=>{
  const {loadCaptureHeaders}=await api();const matches=Array.from({length:211},(_,i)=>({id:i,capture:String(i)}));let calls=0;
  const headers=await loadCaptureHeaders(matches,{},async(path,o)=>{assert.equal(path,'/indexes');calls++;const {captures}=JSON.parse(o.body);return {captures:[...captures].reverse().map(capture=>({capture,header:{match_uid:capture},rounds:[]}))};});
  assert.equal(calls,3);assert.deepEqual(headers.map(h=>h.matchID),matches.map(m=>String(m.id)));
});
test('A chosen map scopes every Groups lookup page; Match lookup remains map independent',async()=>{
  const {candidateMatches}=await api(),paths=[];
  await candidateMatches({players:[{id:1}],map:'de_nuke'},async path=>{paths.push(path);return {matches:paths.length===1?Array.from({length:100},(_,id)=>({id})):[]};});
  assert.equal(paths.length,2);for(const path of paths)assert.equal(new URL(path,'https://test').searchParams.get('map'),'de_nuke');
  paths.length=0;await candidateMatches({players:[],matchID:12,map:'de_mirage'},async path=>{paths.push(path);return {matches:[]};});assert.equal(new URL(paths[0],'https://test').searchParams.has('map'),false);
});
