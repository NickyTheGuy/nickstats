import { summarizeArea } from './area-selection.mjs';
import { selectionRoundKey,summarizeGrenades } from './selection-targets.mjs';
import { utilitySelectionData } from './utility-selection.mjs';
export const combatEventKey=e=>JSON.stringify([e.time,e.killer,e.victim,e.weapon,e.x,e.y,e.z]);
export const eventSelectionKey=(kind,event)=>`${kind}:${combatEventKey(event)}`;
export function defaultSelectionScope(items){return items.some(item=>item.cell)?'rounds':'selection';}
export function exactSelectionSummary(rounds,items){
  const chosen=new Map(items.map(item=>[JSON.stringify([item.roundKey,item.player]),item]));
  let kills=0,deaths=0;const effects=[];
  for(const round of rounds){const key=selectionRoundKey(round),data=utilitySelectionData(round);
    for(const item of items.filter(i=>i.roundKey===key))for(const id of new Set(item.utilities||[])){const effect=data.effectsByKey.get(id);if(effect&&effect.player===item.player)effects.push({round,effect});}
    for(const event of round.deaths||[]){
      if(event.killer&&event.killer!==event.victim&&event.killer_side!==event.victim_side&&chosen.get(JSON.stringify([key,event.killer]))?.events?.includes(eventSelectionKey('kill',event)))kills++;
      if(chosen.get(JSON.stringify([key,event.victim]))?.events?.includes(eventSelectionKey('death',event)))deaths++;
    }
  }
  return {kills,deaths,combatComplete:true,utility:summarizeGrenades(effects),rating:null,winRate:null};
}
export function selectedMatchContext(replays,summary,items){
  const selected=new Set(summary.instances.map(i=>i.roundKey)),matches=[];
  for(const replay of replays){const rounds=replay.rounds.filter(round=>selected.has(`${replay.match_uid}:${round.number}`));if(!rounds.length||!replay.matchID)continue;
    matches.push({id:String(replay.matchID),map:replay.map,played_at:replay.played_at??null,rounds:rounds.map(r=>r.number),players:replay.roster||[],instances:summary.instances.filter(i=>rounds.some(r=>i.roundKey===`${replay.match_uid}:${r.number}`)).map(i=>({player:i.player,round:Number(i.roundKey.split(':').at(-1))}))});
  }
  return {matches,roundSummary:{count:summary.count,observations:summary.observations,kills:summary.combatComplete?summary.kills:null,deaths:summary.combatComplete?summary.deaths:null,winRate:summary.winRate,rating:summary.rating},eventSummary:exactSelectionSummary([...summary.matched],items)};
}
export function friendBreakdown(rounds,items,replays,friends,{self=null}={}){
  const rows=[],known=new Set(friends.map(p=>String(p.steam_id)));
  for(const [value,label]of [['solo','Solo'],['mixed','Mixed'],['friends','All friends'],['unknown','Other / unknown team']]){
    const subset=items.filter(item=>{const replay=replays.find(r=>r.rounds.some(round=>`${r.match_uid}:${round.number}`===item.roundKey)),id=item.player;
      const team=replay?.teams?.[id],roster=team==null?[]:replay.players.filter(p=>replay.teams[p.id]===team);
      const reference=self?roster.find(p=>(p.steam_id||p.id.replace(/^steam:/,''))===self)?.id:id;
      const count=roster.filter(p=>p.id!==reference&&known.has(p.steam_id||p.id.replace(/^steam:/,''))).length;
      return (!id||!reference||roster.length!==5?'unknown':count===0?'solo':count===4?'friends':'mixed')===value;
    });
    if(!subset.length)continue;
    rows.push({value,label,...summarizeArea(rounds,{players:[...new Set(subset.map(i=>i.player).filter(Boolean))],selection:subset})});
  }
  return rows;
}
