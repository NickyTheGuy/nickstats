import { validateReplay, MAX_REPLAY_BYTES } from './replay.mjs';
import { replaySampleCount } from './round-selection.mjs';
const endpoint='/nickstats/api/analyzer';
export async function analyzerJSON(path,{signal,...options}={}) {
  const response=await fetch(`${endpoint}${path}`,{credentials:'same-origin',cache:'no-store',signal,...options,
    headers:{Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}});
  const body=response.status===204?null:await response.json().catch(()=>null);
  if(!response.ok)throw new Error(body?.reason||`Analyzer returned HTTP ${response.status}.`);
  return body;
}
export async function candidateMatches({players=[],matchID,signal},request=analyzerJSON) {
  const matches=[];
  for(let offset=0;;offset+=100) {
    signal?.throwIfAborted();
    const query=new URLSearchParams({limit:'100',offset:String(offset),...(matchID?{match:String(matchID)}:{players:players.map(p=>p.id).join(',')})});
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
// Small independent requests fit the existing nginx 2 MB body limit, including
// JSON escaping. An interrupted upload never replaces a usable capture.
export async function saveReplay(matchID,input,{signal,onStatus=()=>{}}={},request=analyzerJSON) {
  const replay=validateReplay(input);
  if(replay.version!==4||!replay.demo_sha256)throw new Error('Capture this demo again with the current parser to save its movement.');
  const {rounds,...header}=replay,serialized=rounds.map(round=>JSON.stringify(round));
  const total=serialized.reduce((sum,text)=>sum+new TextEncoder().encode(text).length,0);
  if(total>MAX_REPLAY_BYTES)throw new Error('Movement capture exceeds 128 MB. Statistics have still been saved.');
  const pieces=serialized.map(text=>{
    // UTF-16 slicing can split a surrogate pair; replay rounds contain bounded
    // ASCII IDs and weapon names. Array.from also safely handles future Unicode.
    const chars=Array.from(text),parts=[];
    for(let start=0;start<chars.length;start+=64000)parts.push(chars.slice(start,start+64000).join(''));
    return parts;
  });
  const manifest=await Promise.all(rounds.map(async(round,i)=>({number:round.number,parts:pieces[i].length,
    bytes:new TextEncoder().encode(serialized[i]).length,sha256:await sha256(serialized[i]),summary:summarizeRound(round)})));
  signal?.throwIfAborted();onStatus('Saving analyzer movement…');
  const {capture}=await request(`/matches/${encodeURIComponent(matchID)}/captures`,{method:'POST',body:JSON.stringify({header,rounds:manifest}),signal});
  for(let i=0;i<rounds.length;i++) {
    onStatus(`Saving analyzer movement · round ${i+1}/${rounds.length}…`);
    for(let part=0;part<pieces[i].length;part++) {
      signal?.throwIfAborted();
      await request(`/captures/${capture}/rounds/${rounds[i].number}/parts/${part}`,{method:'PUT',body:JSON.stringify({data:pieces[i][part]}),signal});
    }
  }
  await request(`/captures/${capture}/complete`,{method:'POST',signal});
  window.dispatchEvent(new Event('nickstats:replays-changed'));
  return capture;
}
export async function loadCaptureHeaders(matches,{signal,onStatus=()=>{}}={},request=analyzerJSON) {
  const replays=[];
  for(const [index,match]of matches.entries()) {
    signal?.throwIfAborted();onStatus(`Reading replay indexes · ${index+1}/${matches.length}…`);
    const payload=await request(`/captures/${match.capture}`,{signal});
    if(!payload?.header||!Array.isArray(payload.rounds))throw new Error('Invalid replay index.');
    replays.push({...payload.header,rounds:payload.rounds,capture:match.capture,matchID:String(match.id)});
  }
  return replays;
}
// One selection read per match, with two in flight. Old data is released and
// aborted/late selections never replace the current view.
export async function loadSelectedRounds(replays,keys,players,{signal,onStatus=()=>{},maxSamples=2000000}={},request=analyzerJSON) {
  const wanted=new Set(keys),chosen=new Set(players),jobs=[];
  for(const replay of replays) {
    const rounds=replay.rounds.filter(round=>wanted.has(`${replay.match_uid}:${round.number}`)&&round.player_ids.some(id=>chosen.has(id)));
    if(rounds.length)jobs.push({replay,rounds});
  }
  const result=new Array(jobs.length);let next=0,samples=0,bytes=0,done=0,failed=false;
  async function worker() {
    while(!failed&&next<jobs.length) {
      const index=next++,{replay,rounds}=jobs[index];signal?.throwIfAborted();
      try {
        const data=await request(`/captures/${replay.capture}/selection`,{method:'POST',body:JSON.stringify({rounds:rounds.map(r=>r.number),players}),signal});
        signal?.throwIfAborted();
        const validated=validateReplay({...data.header,rounds:data.rounds});
        const received=validated.rounds.map(r=>r.number);
        if(validated.match_uid!==replay.match_uid||validated.map!==replay.map||received.length!==rounds.length||rounds.some(r=>!received.includes(r.number)))throw new Error('Replay selection changed. Find matches again.');
        samples+=replaySampleCount(validated);bytes+=JSON.stringify(data).length;
        if(samples>maxSamples||bytes>MAX_REPLAY_BYTES)throw new Error('This selection exceeds the viewer’s memory budget. Narrow the map, dates, tags or rounds.');
        result[index]=validated.rounds.map(round=>({...round,match_id:replay.matchID}));onStatus(`Loading movement · ${++done}/${jobs.length} matches…`);
      }catch(error){failed=true;throw error;}
    }
  }
  await Promise.all([worker(),worker()]);
  return result.flat();
}
