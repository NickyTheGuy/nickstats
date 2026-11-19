import { utilitySelectionData } from './utility-selection.mjs';
import { onLevel,positionAt } from './replay.mjs';
import { selectionRoundKey,insideArea,utilitySelectionEvents,combatSelectionEvents,summarizeGrenades } from './selection-targets.mjs';

// Canvas object-fit:contain leaves letterboxing. Both selection and map drawing
// use the square's center/scale, then undo pan and zoom in radar coordinates.
export function pointerToRadar(point,rect,view) {
  const scale=Math.min(rect.width,rect.height)/1024;
  if(!scale)return null;
  return {x:512+((point.x-rect.left-rect.width/2)/scale-view.x)/view.zoom,
    y:512+((point.y-rect.top-rect.height/2)/scale-view.y)/view.zoom};
}
export function areaBounds(a,b) {
  if(!a||!b)return null;
  const left=Math.max(0,Math.min(a.x,b.x)),right=Math.min(1024,Math.max(a.x,b.x));
  const top=Math.max(0,Math.min(a.y,b.y)),bottom=Math.min(1024,Math.max(a.y,b.y));
  return right>left&&bottom>top?{left,right,top,bottom}:null;
}
export function areaOnScreen(area,size,view) {
  const scale=Math.min(size.width,size.height)/1024;
  return {left:size.width/2+((area.left-512)*view.zoom+view.x)*scale,
    top:size.height/2+((area.top-512)*view.zoom+view.y)*scale,
    width:(area.right-area.left)*view.zoom*scale,height:(area.bottom-area.top)*view.zoom*scale};
}
function killsFor(round,player) {
  return (round.deaths||[]).filter(e=>e.killer===player&&e.victim!==player&&e.killer_side!==e.victim_side).length;
}
export function roundRating({kills,deaths,assists,damage,kast,played}) {
  if(!played)return null;
  const kpr=kills/played,dpr=deaths/played,apr=assists/played,adr=damage/played;
  return Math.max(0,.0073*100*kast/played+.3591*kpr-.5329*dpr+.2372*(2.13*kpr+.42*apr-.41)+.0032*adr+.1587);
}
export function summarizeArea(rounds,{area,map,level,time,players,side=0,target='Players',allSelected=false,utilities=['Smoke','Flash','HE','Fire','Decoy'],layers=['Kills','Deaths','Aim','Gunfire'],selection=null,rosters=null}) {
  const selectionByRound=new Map();
  for(const item of selection||[]){if(!selectionByRound.has(item.roundKey))selectionByRound.set(item.roundKey,[]);selectionByRound.get(item.roundKey).push(item);}
  const selected=new Set(players),matched=new Set(),observations=[],effects=[];let unknownActors=false;
  const instances=[];
  for(const round of rounds) {
    const actors=new Map();
    if(selection) {
      const key=selectionRoundKey(round),indices=new Set(),{effectsByKey}=utilitySelectionData(round);
      const roster=rosters?.get(key),allowed=roster?new Set([...roster.primary,...roster.enemies]):selected;
      for(const item of selectionByRound.get(key)||[]) {
        if(item.player&&!allowed.has(item.player))continue;
        if(item.player&&selected.has(item.player))actors.set(item.player,item.side);
        else if(!item.player){unknownActors=true;matched.add(round);instances.push({roundKey:key,player:null});}
        if(!item.player||selected.has(item.player))for(const key of item.utilities||[])if(effectsByKey.get(key)?.player===item.player)indices.add(key);
      }
      for(const key of indices)effects.push({effect:effectsByKey.get(key),round});
    } else {
    if(target==='Players'&&time<=round.duration)for(const track of round.tracks) {
      if(!selected.has(track.player))continue;
      const point=positionAt(track.samples,time);
      if(!point||!onLevel(level,point[3])||side&&point[5]!==side||!insideArea(area,map,point[1],point[2]))continue;
      actors.set(track.player,point[5]);
    }
    for(const event of combatSelectionEvents(round,{target,time,selected,side,layers,level}))if(insideArea(area,map,event.x,event.y))actors.set(event.player,event.side);
    for(const effect of utilitySelectionEvents(round,{target,time,selected,side,utilities,level,allSelected}))if(insideArea(area,map,effect.x,effect.y)) {
      if(effect.player)actors.set(effect.player,effect.side);else{unknownActors=true;matched.add(round);}effects.push({effect,round});
    }
    }
    if(actors.size)matched.add(round);
    for(const [player,actorSide]of actors) {
      const context=round.context?.find(c=>c.player===player),performance=round.performance?.find(p=>p.player===player),perspective=context?.side||actorSide;
      const result=context?.result||(round.winner&&perspective?((perspective===2?'T':'CT')===round.winner?'win':'loss'):null);
      observations.push({round,player,side:perspective,result,performance});instances.push({roundKey:selectionRoundKey(round),player});
    }
  }
  const totals={kills:0,deaths:0,assists:0,damage:0,kast:0,played:observations.length};let wins=0,known=0,complete=!unknownActors,combatComplete=!unknownActors;const teamResults=new Map();
  for(const row of observations) {
    if(row.result){if(!teamResults.has(row.round))teamResults.set(row.round,new Map());teamResults.get(row.round).set(row.side,row.result);}
    const p=row.performance;
    if(!p&&!Array.isArray(row.round.deaths))combatComplete=false;
    totals.kills+=p?.kills??killsFor(row.round,row.player);
    totals.deaths+=p?.deaths??(row.round.deaths||[]).filter(e=>e.victim===row.player).length;
    if(!p)complete=false;else{totals.assists+=p.assists;totals.damage+=p.damage;totals.kast+=p.kast;}
  }
  for(const results of teamResults.values())for(const result of results.values()){known++;wins+=Number(result==='win');}
  return {matched,instances,total:rounds.length,count:matched.size,percent:rounds.length?100*matched.size/rounds.length:0,
    observations:observations.length,winRate:!unknownActors&&known?100*wins/known:null,knownResults:known,
    utility:summarizeGrenades(effects),target,...totals,combatComplete,rating:complete?roundRating(totals):null};
}
