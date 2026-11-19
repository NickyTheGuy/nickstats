import { validateReplay, MAX_REPLAY_BYTES } from './replay.mjs';
import { createMovementCache, movementSelection } from './movement-cache.mjs';
const endpoint='/nickstats/api/analyzer';
export async function analyzerJSON(path,{signal,...options}={}) {
  const response=await fetch(`${endpoint}${path}`,{credentials:'same-origin',cache:'no-store',signal,...options,
    headers:{Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}});
  const body=response.status===204?null:await response.json().catch(()=>null);
  if(!response.ok)throw new Error(body?.reason||`Analyzer returned HTTP ${response.status}.`);
  return body;
}
export async function candidateMatches({players=[],matchID,map,signal},request=analyzerJSON) {
  const matches=[];
  for(let offset=0;;offset+=100) {
    signal?.throwIfAborted();
    const query=new URLSearchParams({limit:'100',offset:String(offset),...(matchID?{match:String(matchID)}:{players:players.map(p=>p.id).join(','),...(map?{map}:{})})});
    const page=await request(`/matches?${query}`,{signal});
    if(!Array.isArray(page?.matches))throw new Error('Could not read Analyzer match rosters.');
    matches.push(...page.matches);
    if(page.matches.length<100||matchID)return matches;
  }
}
const sha256=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),n=>n.toString(16).padStart(2,'0')).join('');
export function summarizeRound(round) {
  return {number:round.number,duration:round.duration,winner:round.winner,context:round.context,
    player_ids:round.tracks.map(t=>t.player).sort()};
}
function* replayChunks(text) {
  for(let start=0;start<text.length;) {
    let end=Math.min(start+160000,text.length);
    if(end<text.length&&text.charCodeAt(end-1)>=0xd800&&text.charCodeAt(end-1)<=0xdbff)end--;
    yield text.slice(start,end);start=end;
  }
}
// Small independent requests fit the existing nginx 2 MB body limit, including
// JSON escaping. An interrupted upload never replaces a usable capture.
export async function saveReplay(matchID,input,{signal,onStatus=()=>{}}={},request=analyzerJSON) {
  const replay=validateReplay(input);
  if(replay.version!==4||!replay.demo_sha256)throw new Error('Capture this demo again with the current parser to save its movement.');
  const {rounds,...header}=replay,manifest=[];
  let total=0;
  for(const round of rounds) {
    signal?.throwIfAborted();
    const text=JSON.stringify(round),bytes=new TextEncoder().encode(text).length;
    total+=bytes;
    if(total>MAX_REPLAY_BYTES)throw new Error('Movement capture exceeds 128 MB. Statistics have still been saved.');
    manifest.push({number:round.number,parts:[...replayChunks(text)].length,bytes,sha256:await sha256(text),summary:summarizeRound(round)});
  }
  signal?.throwIfAborted();onStatus('Saving analyzer movement…');
  const {capture}=await request(`/matches/${encodeURIComponent(matchID)}/captures`,{method:'POST',body:JSON.stringify({header,rounds:manifest}),signal});
  for(let i=0;i<rounds.length;i++) {
    onStatus(`Saving analyzer movement · round ${i+1}/${rounds.length}…`);
    let part=0;
    for(const data of replayChunks(JSON.stringify(rounds[i]))) {
      signal?.throwIfAborted();
      await request(`/captures/${capture}/rounds/${rounds[i].number}/parts/${part++}`,{method:'PUT',body:JSON.stringify({data}),signal});
    }
  }
  await request(`/captures/${capture}/complete`,{method:'POST',signal});
  window.dispatchEvent(new Event('nickstats:replays-changed'));
  return capture;
}
export async function loadCaptureHeaders(matches,{signal,onStatus=()=>{}}={},request=analyzerJSON) {
  const replays=[];
  for(let offset=0;offset<matches.length;offset+=100) {
    signal?.throwIfAborted();onStatus(`Reading replay indexes · ${Math.min(offset+100,matches.length)}/${matches.length}…`);
    const batch=matches.slice(offset,offset+100),payload=await request('/indexes',{method:'POST',body:JSON.stringify({captures:batch.map(m=>m.capture)}),signal});
    if(!Array.isArray(payload?.captures))throw new Error('Invalid replay index.');
    const byID=new Map(payload.captures.map(index=>[index.capture,index]));
    for(const match of batch) {
      const index=byID.get(match.capture);
      if(!index?.header||!Array.isArray(index.rounds))throw new Error('Movement captures changed. Find matches again.');
      replays.push({...index.header,rounds:index.rounds,capture:match.capture,matchID:String(match.id),teams:Object.fromEntries((match.players||[]).filter(p=>p.steam_id&&p.team!=null).map(p=>[`steam:${p.steam_id}`,p.team]))});
    }
  }
  return replays;
}
// Reuse immutable player/round slices; a match request contains only missing
// rounds and players. Two concurrent match reads bound transfer pressure.
export async function loadSelectedRounds(replays,keys,players,{signal,onStatus=()=>{},maxSamples=2000000,playersForRound=null,cache=createMovementCache({maxSamples})}={},request=analyzerJSON) {
  const plan=movementSelection(replays,keys,players,{playersForRound});cache.pin(plan);
  signal?.throwIfAborted();
  const existing=cache.read(plan,{sampleLimit:maxSamples});if(existing!==null)return existing;
  const jobs=plan.map(job=>cache.missing(job)).filter(job=>job.rounds.length);
  let next=0,done=0,failed=false;
  async function worker() {
    while(!failed&&next<jobs.length) {
      const {replay,rounds,players:missingPlayers}=jobs[next++];signal?.throwIfAborted();
      try {
        const data=await request(`/captures/${replay.capture}/selection`,{method:'POST',body:JSON.stringify({rounds:rounds.map(r=>r.number),players:missingPlayers}),signal});
        signal?.throwIfAborted();
        const validated=validateReplay({...data.header,rounds:data.rounds});
        const received=validated.rounds.map(r=>r.number);
        if(validated.match_uid!==replay.match_uid||validated.map!==replay.map||received.length!==rounds.length||rounds.some(r=>!received.includes(r.number)))throw new Error('Replay selection changed. Find matches again.');
        cache.put(replay,validated.rounds,missingPlayers);
        onStatus(`Loading movement · ${++done}/${jobs.length} matches…`);
      }catch(error){failed=true;throw error;}
    }
  }
  await Promise.all([worker(),worker()]);signal?.throwIfAborted();
  const result=cache.read(plan,{sampleLimit:maxSamples});
  if(result===null)throw new Error('Movement selection changed. Try loading the selection again.');
  return result;
}
