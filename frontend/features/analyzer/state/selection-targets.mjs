import { onLevel,worldToRadar } from './replay.mjs';
import { utilityVisible } from './utility.mjs';
export const isUtilityTarget=target=>['Smoke','Flash','HE','Fire','Decoy'].includes(target);
export function selectionRoundKey(round){return round.match_uid?`${round.match_uid}:${round.number}`:round.match_id?`match:${round.match_id}:${round.number}`:null;}

// Detonation markers remain selectable after their active area expires. This
// history can include every enabled grenade layer.
export function utilitySelectionEvents(round,{target,time,selected,side,utilities,level,allSelected=false}) {
  if(target!=='All'&&(!isUtilityTarget(target)||!utilities.includes(target)))return [];
  return round.utility.filter(e=>(target==='All'?utilities.includes(e.type):e.type===target)&&e.time<=time&&(e.player||allSelected)&&utilityVisible(e,round,selected,side)&&onLevel(level,e.z));
}
export function combatSelectionEvents(round,{target,time,selected,side,layers,level}) {
  if(!layers.includes(target))return [];
  return (round.deaths||[]).flatMap(event=>{
    if(event.time>time)return [];
    if(target==='Deaths'&&selected.has(event.victim)&&(!side||event.victim_side===side)&&onLevel(level,event.z))return [{event,player:event.victim,side:event.victim_side,x:event.x,y:event.y,z:event.z}];
    if(target==='Kills'&&event.from&&event.killer&&event.killer!==event.victim&&event.killer_side!==event.victim_side&&selected.has(event.killer)&&(!side||event.killer_side===side)&&onLevel(level,event.from[2]))return [{event,player:event.killer,side:event.killer_side,x:event.from[0],y:event.from[1],z:event.from[2]}];
    return [];
  });
}
export function insideArea(area,map,x,y){const [rx,ry]=worldToRadar(map,x,y);return rx>=area.left&&rx<=area.right&&ry>=area.top&&ry<=area.bottom;}

// A round total belongs to a specific old marker only when both the recorded
// throw count and the captured effect count prove there was just one throw.
export function grenadeEffectiveness(effect,round) {
  const result={...(effect.effectiveness||{})},stats=round.performance?.find(p=>p.player===effect.player)?.grenades;
  const type=effect.type,throwField={HE:'he_thrown',Flash:'flash_thrown',Fire:'fire_thrown'}[type];
  if(!effect.unlinked_projectile&&stats&&throwField&&stats[throwField]===1&&round.utility.filter(e=>e.player===effect.player&&e.type===type).length===1) {
    const mapping=type==='Flash'?{enemies_flashed:'enemies_flashed',enemy_blind_ms:'blind_ms'}:{enemy_damage:type==='HE'?'he_damage':'fire_damage'};
    for(const [field,key]of Object.entries(mapping))if(result[field]==null&&Number.isFinite(stats[key]))result[field]=stats[key];
  }
  return result;
}
export function summarizeGrenades(effects) {
  const metrics=[];
  for(const [type,label,field,suffix,divisor]of [
    ['Flash','Enemies / flash','enemies_flashed','',1],['Flash','Blind seconds / flash','enemy_blind_ms',' s',1000],
    ['HE','Damage / HE','enemy_damage','',1],['Fire','Damage / fire grenade','enemy_damage','',1]
  ]) {
    const rows=effects.filter(row=>row.effect.type===type);if(!rows.length)continue;
    const values=rows.map(row=>grenadeEffectiveness(row.effect,row.round)[field]);
    const complete=values.every(value=>Number.isFinite(value));
    metrics.push([label,complete?`${(values.reduce((sum,value)=>sum+value,0)/rows.length/divisor).toFixed(2)}${suffix}`:'—']);
  }
  return {count:effects.length,metrics};
}
