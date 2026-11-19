import { onLevel,positionAt,worldToRadar } from './replay.mjs';
import { combatMarkers } from './combat.mjs';
import { utilityVisible,effectEnd } from './utility.mjs';
import { selectionRoundKey } from './selection-targets.mjs';

// Filtering to another player roster can renumber an effect array. Keep a
// deterministic identity within its owner/round, including coincident throws.
export function utilityKeys(round) {
  const counts=new Map();
  return round.utility.map(e=>{
    const signature=JSON.stringify([e.player,e.type,e.time,e.x,e.y,e.z]),ordinal=counts.get(signature)||0;
    counts.set(signature,ordinal+1);return `${signature}:${ordinal}`;
  });
}
export function entrySelected(item,selection) {
  const row=selection instanceof Map?selection.get(actorKey(item)):selection.find(e=>actorKey(e)===actorKey(item));
  return Boolean(row&&(!item.utilities.length||item.utilities.every(key=>row.utilities.includes(key))));
}
export const actorKey=entry=>JSON.stringify([entry.roundKey,entry.player]);
// Snapshot identities, rather than a live geographic query: scrubbing, zooming,
// adding another box, or crossing floors must not change an existing cohort.
export function mergeSelection(previous,incoming,append=false) {
  const actors=new Map();
  for(const item of [...(append?previous:[]),...incoming]) {
    const key=actorKey(item),old=actors.get(key);
    actors.set(key,{...item,utilities:[...new Set([...(old?.utilities||[]),...(item.utilities||[])])]});
  }
  return [...actors.values()];
}
export function selectionCandidates(rounds,{map,level,time,players,side=0,utilities,layers,allSelected=false,unit=1,showPlayers=true,permanentUtility=true,rosters=null}) {
  const items=[];
  for(const round of rounds) {
    const roundKey=selectionRoundKey(round);if(!roundKey)continue;
    const roster=rosters?.get(roundKey),selected=new Set(roster?roster.primary:players),cells=new Set([...selected,...(roster?.enemies||[])]);
    const add=(kind,player,actorSide,x,y,details={})=>items.push({kind,x,y,round,...details,entry:{roundKey,player,side:actorSide,utilities:details.utilityKey==null?[]:[details.utilityKey]}});
    if(showPlayers&&time<=round.duration)for(const track of round.tracks) {
      if(!cells.has(track.player))continue;
      const s=positionAt(track.samples,time);
      if(!s||!onLevel(level,s[3])||selected.has(track.player)&&side&&s[5]!==side)continue;
      add('player',track.player,s[5],...worldToRadar(map,s[1],s[2]),{enemy:!selected.has(track.player)});
    }
    for(const event of round.deaths||[]) {
      if(event.time>time)continue;
      for(const mark of combatMarkers(event,{selected,side,layers,map,level,unit}))add(mark.kind,mark.actor,mark.kind==='kill'?event.killer_side:event.victim_side,mark.x,mark.y,{event});
    }
    const keys=utilityKeys(round);
    for(const [utilityIndex,effect]of round.utility.entries()) {
      if(effect.time>time||!permanentUtility&&time>=effectEnd(effect,round.duration)||!utilities.includes(effect.type)||!effect.player&&!allSelected||!utilityVisible(effect,round,selected,side)||!onLevel(level,effect.z))continue;
      add('utility',effect.player,effect.side,...worldToRadar(map,effect.x,effect.y),{effect,utilityKey:keys[utilityIndex]});
    }
  }
  return items;
}
export function candidatesInArea(candidates,area) {
  return candidates.filter(p=>p.x>=area.left&&p.x<=area.right&&p.y>=area.top&&p.y<=area.bottom).map(p=>p.entry);
}
