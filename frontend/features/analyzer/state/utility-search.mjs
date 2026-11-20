export const UTILITY_SEARCH_TYPES=[['HE','HE grenade'],['Flash','Flashbang'],['Fire','Molotov / incendiary']];
export const utilityMetrics=type=>type==='Flash'?[['enemies','Enemies blinded'],['blind_ms','Total enemy blind seconds']]:[['damage','Enemy HP damage']];
export function utilityScopes(replays,keys) {
  const chosen=new Set(keys);
  return replays.filter(r=>r.capture).map(r=>({capture:r.capture,rounds:r.rounds.filter(round=>chosen.has(`${r.match_uid}:${round.number}`)).map(round=>round.number)})).filter(s=>s.rounds.length);
}
export function utilityQuery(scopes,players,{type,metric,minimum,side=0},offset=0) {
  const value=Number(minimum),scaled=metric==='blind_ms'?Math.round(value*1000):value;
  if(!scopes.length||!players.length||players.length>64)throw new Error('Select saved matches, rounds and players first.');
  if(scopes.length>1000||scopes.reduce((n,s)=>n+s.rounds.length,0)>20000)throw new Error('Narrow the map, dates or rounds before searching utility.');
  if(![0,2,3].includes(side)||!UTILITY_SEARCH_TYPES.some(([key])=>key===type)||!utilityMetrics(type).some(([key])=>key===metric)||!String(minimum).trim()||!Number.isSafeInteger(scaled)||scaled<0||scaled>999999999)throw new Error('Enter a valid minimum effectiveness.');
  return {scopes,players,type,metric,minimum:scaled,side,offset,limit:50};
}
export function validateUtilityPage(data,query) {
  const scopes=new Map(query.scopes.map(s=>[s.capture,new Set(s.rounds)])),count=value=>Number.isSafeInteger(value)&&value>=0;
  if(!data||!Array.isArray(data.rows)||data.rows.length>query.limit||!count(data.total)||!count(data.unknown)||data.offset!==query.offset||data.limit!==query.limit||!Array.isArray(data.pending_captures)||data.pending_captures.some(id=>!scopes.has(id)))throw new Error('Invalid utility search response.');
  const seen=new Set();
  for(const row of data.rows){const id=`${row.capture}:${row.round}:${row.event}`;
    if(!scopes.get(row.capture)?.has(row.round)||!query.players.includes(row.player)||query.side&&row.side!==query.side||row.type!==query.type||!count(row.event)||!['x','y','z'].every(key=>Number.isFinite(row[key]))||!count(row.time)||!count(row.match_id)||![0,2,3].includes(row.side)||!['hegrenade','flashbang','molotov','incgrenade'].includes(row.icon)||!['enemy_damage','enemies_flashed','enemy_blind_ms'].every(key=>row[key]==null||count(row[key]))||seen.has(id))throw new Error('Utility results changed. Find matches again.');
    const value=row[query.metric==='damage'?'enemy_damage':query.metric==='enemies'?'enemies_flashed':'enemy_blind_ms'];
    if(value==null||value<query.minimum||query.type==='Flash'&&query.metric==='enemies'&&query.minimum>0&&!(row.enemy_blind_ms>0))throw new Error('Utility results do not meet this threshold.');
    seen.add(id);
  }
  return data;
}
// A stalled request must settle even if the transport ignores cancellation.
async function requestPage(query,request,{signal,requestTimeout}) {
  signal?.throwIfAborted();
  const controller=new AbortController();let timer,abort;
  const stopped=new Promise((_,reject)=>{
    abort=()=>{controller.abort();reject(signal.reason||new DOMException('Search cancelled.','AbortError'));};
    signal?.addEventListener('abort',abort,{once:true});
    timer=setTimeout(()=>{controller.abort();reject(new Error('Utility search timed out. Completed indexing is saved; try again.'));},requestTimeout);
  });
  try{return await Promise.race([stopped,Promise.resolve().then(()=>{controller.signal.throwIfAborted();return request(query,{signal:controller.signal});})]);}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
// Preparation and paging are transport details, not separate user actions.
export async function searchUtility(query,request,{signal,maxResults=5000,requestTimeout=45000,onProgress=()=>{}}={}) {
  let page,pending=query.scopes.length+1,offset=0,total=null;const rows=[],seen=new Set();
  do {
    signal?.throwIfAborted();
    const next={...query,offset,limit:100};
    page=validateUtilityPage(await requestPage(next,request,{signal,requestTimeout}),next);
    signal?.throwIfAborted();
    if(page.pending_captures.length){
      if(offset||page.pending_captures.length>=pending)throw new Error('Utility search could not finish. Try again.');
      pending=page.pending_captures.length;onProgress({phase:'indexing',complete:query.scopes.length-pending,total:query.scopes.length});continue;
    }
    if(page.total>maxResults)throw new Error('Too many matching grenades. Raise the minimum or narrow the filters.');
    if(total!==null&&total!==page.total)throw new Error('Utility results changed. Search again.');
    total=page.total;
    for(const row of page.rows){const key=`${row.capture}:${row.round}:${row.event}`;if(seen.has(key))throw new Error('Utility results changed. Search again.');seen.add(key);rows.push(row);}
    offset+=page.rows.length;
    onProgress({phase:'results',complete:offset,total});
    if(offset<total&&!page.rows.length)throw new Error('Utility results changed. Search again.');
  }while(page.pending_captures.length||offset<total);
  return {rows,total,type:query.type};
}

// The index already contains the exact markers. Showing a result does not need
// any movement download. Do not invent round combat statistics from these hits.
export function utilityResultRounds(replays,hits) {
  const captures=new Map(replays.map(replay=>[replay.capture,replay])),rounds=new Map();
  for(const hit of hits){
    const replay=captures.get(hit.capture),source=replay?.rounds.find(round=>round.number===hit.round);
    if(!source)throw new Error('Utility results changed. Find matches again.');
    const key=`${replay.match_uid}:${source.number}`;
    if(!rounds.has(key))rounds.set(key,{number:source.number,duration:source.duration,winner:source.winner,context:source.context,
      match_uid:replay.match_uid,match_id:hit.match_id,tracks:[],firing:[],projectiles:[],utility:[]});
    const round=rounds.get(key);round.duration=Math.max(round.duration,hit.time);
    round.utility.push({type:hit.type,icon:hit.icon,player:hit.player,side:hit.side,time:hit.time,end:hit.time,
      x:hit.x,y:hit.y,z:hit.z,event_number:hit.event,effectiveness:{enemy_damage:hit.enemy_damage??null,enemies_flashed:hit.enemies_flashed??null,enemy_blind_ms:hit.enemy_blind_ms??null}});
  }
  return [...rounds.values()];
}
export const utilityResultDisplay=type=>({players:false,names:false,items:false,blindness:false,utilities:[type],utilityLayers:['History'],combat:[]});
