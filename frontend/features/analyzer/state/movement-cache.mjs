import { MAX_REPLAY_BYTES } from './replay.mjs';
import { replaySampleCount } from './round-selection.mjs';

export const movementBudgetError=()=>new Error('This selection exceeds the viewer’s memory budget. Narrow the map, dates, tags or rounds.');
const fields=['tracks','firing','utility','projectiles','context','performance','equipment','blindness'];
const key=(capture,number,player)=>JSON.stringify([capture,number,player]);
const rosterPlayers=(replay,players)=>players.filter(id=>replay.players.some(p=>p.id===id));
export function movementSelection(replays,keys,players,{playersForRound=null}={}) {
  const wanted=new Set(keys);
  return replays.flatMap(replay=>{
    const jobs=new Map();
    for(const round of replay.rounds) {
      if(!wanted.has(`${replay.match_uid}:${round.number}`))continue;
      const roster=rosterPlayers(replay,playersForRound?playersForRound(replay,round):players),chosen=new Set(roster);
      if(!round.player_ids.some(id=>chosen.has(id)))continue;
      const key=JSON.stringify([...roster].sort());
      if(!jobs.has(key))jobs.set(key,{replay,players:roster,rounds:[]});
      jobs.get(key).rounds.push(round);
    }
    return [...jobs.values()];
  });
}

// Completed captures are immutable. Keep independent player/round slices so
// narrower filters reuse sample arrays without copying coordinates or fetching.
// LRU eviction favors inactive slices; the active selection must fit as a whole.
export function createMovementCache({maxSamples=2000000,maxBytes=MAX_REPLAY_BYTES,maxEntries=100000}={}) {
  const entries=new Map();let samples=0,bytes=0,pinned=new Set();
  function remove(id) {
    const entry=entries.get(id);if(!entry)return;
    entries.delete(id);samples-=entry.samples;bytes-=entry.bytes;
  }
  function get(id) {
    const entry=entries.get(id);if(entry){entries.delete(id);entries.set(id,entry);}return entry;
  }
  function insert(id,entry) {
    if(entries.has(id))return;
    // Only verified, complete responses reach the cache. Do not evict needed
    // slices to make an over-budget selection appear to have loaded partially.
    entries.set(id,entry);samples+=entry.samples;bytes+=entry.bytes;
    for(const candidate of entries.keys()) {
      if(samples<=maxSamples&&bytes<=maxBytes&&entries.size<=maxEntries)break;
      if(!pinned.has(candidate))remove(candidate);
    }
    if(samples>maxSamples||bytes>maxBytes||entries.size>maxEntries){remove(id);throw movementBudgetError();}
  }
  function slices(job,round) {return job.players.map(player=>get(key(job.replay.capture,round.number,player)));}
  return {
    clear(){entries.clear();pinned.clear();samples=0;bytes=0;},
    invalidateCaptures(captures){const ids=new Set(captures);for(const [id,entry]of entries)if(ids.has(entry.capture))remove(id);},
    pin(plan){pinned=new Set(plan.flatMap(job=>job.rounds.flatMap(round=>job.players.map(player=>key(job.replay.capture,round.number,player)))));},
    missing(job) {
      const rounds=[],players=new Set();
      for(const round of job.rounds) {
        const missing=job.players.filter(player=>!entries.has(key(job.replay.capture,round.number,player)));
        if(missing.length){rounds.push(round);missing.forEach(player=>players.add(player));}
      }
      // A newly selected player may have events but no position sample in one
      // round. Include a sampled anchor so the existing projection API returns
      // that round; its already-cached slice is simply reused.
      for(const round of rounds)if(!round.player_ids.some(id=>players.has(id)))players.add(round.player_ids.find(id=>job.players.includes(id)));
      return {...job,rounds,players:[...players]};
    },
    put(replay,rounds,players) {
      for(const round of rounds)for(const player of rosterPlayers(replay,players)) {
        const id=key(replay.capture,round.number,player);if(entries.has(id))continue;
        const slice={number:round.number,duration:round.duration,winner:round.winner};
        for(const field of fields)slice[field]=(round[field]||[]).filter(item=>item.player===player);
        slice.deaths=(round.deaths||[]).filter(event=>event.victim===player||event.killer===player);
        insert(id,{capture:replay.capture,slice,samples:replaySampleCount({rounds:[slice]}),bytes:JSON.stringify(slice).length});
      }
    },
    read(plan,{sampleLimit=maxSamples,byteLimit=maxBytes}={}) {
      const result=[];let activeSamples=0,activeBytes=0;
      for(const job of plan)for(const round of job.rounds) {
        const cached=slices(job,round);if(cached.some(entry=>!entry))return null;
        const output={number:round.number,duration:round.duration,winner:round.winner,match_id:job.replay.matchID,match_uid:job.replay.match_uid};
        for(const field of fields)output[field]=cached.flatMap(entry=>entry.slice[field]);
        output.utility.sort((a,b)=>a.time-b.time);
        const deaths=new Map();for(const entry of cached)for(const event of entry.slice.deaths)deaths.set(JSON.stringify(event),event);
        output.deaths=[...deaths.values()].sort((a,b)=>a.time-b.time);
        activeSamples+=cached.reduce((sum,entry)=>sum+entry.samples,0);activeBytes+=cached.reduce((sum,entry)=>sum+entry.bytes,0);
        if(activeSamples>sampleLimit||activeBytes>byteLimit)throw movementBudgetError();
        result.push(output);
      }
      return result;
    },
    get usage(){return {samples,bytes,entries:entries.size};}
  };
}
