export const UTILITY_SEARCH_TYPES=[['HE','HE grenade'],['Flash','Flashbang'],['Fire','Molotov / incendiary']];
export const utilityMetrics=type=>type==='Flash'?[['enemies','Enemies blinded'],['blind_ms','Total enemy blind seconds']]:[['damage','Enemy HP damage']];
export function utilityScopes(replays,keys) {
  const chosen=new Set(keys);
  return replays.filter(r=>r.capture).map(r=>({capture:r.capture,rounds:r.rounds.filter(round=>chosen.has(`${r.match_uid}:${round.number}`)).map(round=>round.number)})).filter(s=>s.rounds.length);
}
export function utilityQuery(scopes,players,{type,metric,minimum},offset=0) {
  const value=Number(minimum),scaled=metric==='blind_ms'?Math.round(value*1000):value;
  if(!scopes.length||!players.length||players.length>64)throw new Error('Select saved matches, rounds and players first.');
  if(scopes.length>1000||scopes.reduce((n,s)=>n+s.rounds.length,0)>20000)throw new Error('Narrow the map, dates or rounds before searching utility.');
  if(!UTILITY_SEARCH_TYPES.some(([key])=>key===type)||!utilityMetrics(type).some(([key])=>key===metric)||!String(minimum).trim()||!Number.isSafeInteger(scaled)||scaled<0||scaled>999999999)throw new Error('Enter a valid minimum effectiveness.');
  return {scopes,players,type,metric,minimum:scaled,offset,limit:50};
}
export function validateUtilityPage(data,query) {
  const scopes=new Map(query.scopes.map(s=>[s.capture,new Set(s.rounds)])),count=value=>Number.isSafeInteger(value)&&value>=0;
  if(!data||!Array.isArray(data.rows)||data.rows.length>query.limit||!count(data.total)||!count(data.unknown)||data.offset!==query.offset||data.limit!==query.limit||!Array.isArray(data.pending_captures)||data.pending_captures.some(id=>!scopes.has(id)))throw new Error('Invalid utility search response.');
  const seen=new Set();
  for(const row of data.rows){const id=`${row.capture}:${row.round}:${row.event}`;
    if(!scopes.get(row.capture)?.has(row.round)||!query.players.includes(row.player)||row.type!==query.type||!count(row.event)||!count(row.time)||!count(row.match_id)||![0,2,3].includes(row.side)||!['hegrenade','flashbang','molotov','incgrenade'].includes(row.icon)||!['enemy_damage','enemies_flashed','enemy_blind_ms'].every(key=>row[key]==null||count(row[key]))||seen.has(id))throw new Error('Utility results changed. Find matches again.');
    const value=row[query.metric==='damage'?'enemy_damage':query.metric==='enemies'?'enemies_flashed':'enemy_blind_ms'];
    if(value==null||value<query.minimum||query.type==='Flash'&&query.metric==='enemies'&&query.minimum>0&&!(row.enemy_blind_ms>0))throw new Error('Utility results do not meet this threshold.');
    seen.add(id);
  }
  return data;
}
export function utilityWatchKey(replays,hit) {
  const replay=replays.find(r=>r.capture===hit.capture);
  return replay?.rounds.some(r=>r.number===hit.round)?`${replay.match_uid}:${hit.round}`:null;
}
