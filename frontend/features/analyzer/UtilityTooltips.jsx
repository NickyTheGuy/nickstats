import { useRef } from 'react';
import TooltipButton from '../../shared/components/feedback/TooltipButton.jsx';
import useElementSize from '../../shared/hooks/useElementSize.js';
import { onLevel,worldToRadar,formatTime } from './state/replay.mjs';
import { utilityVisible,effectEnd } from './state/utility.mjs';
import { grenadeEffectiveness } from './state/selection-targets.mjs';

export default function UtilityTooltips({map,level,rounds,selected,players,time,side,view,utilities,target,onSelectMarker}) {
  const host=useRef(null),size=useElementSize(host),scale=Math.min(size.width,size.height)/1024;
  const names=new Map(players.map(p=>[p.id,p.name])),chosen=new Set(selected),groups=new Map();
  if(scale&&!['Kills','Deaths'].includes(target))for(const round of rounds)for(const effect of round.utility) {
    if(!effect.player||!utilities.includes(effect.type)||effect.time>time||time>=effectEnd(effect,round.duration)&&target!==effect.type||!onLevel(level,effect.z)||!utilityVisible(effect,round,chosen,side))continue;
    const [rx,ry]=worldToRadar(map,effect.x,effect.y),x=size.width/2+((rx-512)*view.zoom+view.x)*scale,y=size.height/2+((ry-512)*view.zoom+view.y)*scale;
    if(x<0||y<0||x>size.width||y>size.height)continue;
    const key=`${effect.type}:${Math.round(x/12)}:${Math.round(y/12)}`;
    if(!groups.has(key))groups.set(key,{x,y,rx,ry,type:effect.type,labels:[]});
    const metric=grenadeEffectiveness(effect,round),yieldText=effect.type==='Flash'&&metric.enemies_flashed!=null?` · ${metric.enemies_flashed} enemies flashed`:['HE','Fire'].includes(effect.type)&&metric.enemy_damage!=null?` · ${metric.enemy_damage} enemy damage`:'';
    groups.get(key).labels.push(`${effect.type} · ${names.get(effect.player)||'Unknown'} · ${round.match_id?`Match #${round.match_id} · `:''}Round ${round.number} · ${formatTime(effect.time)}${yieldText}`);
  }
  return <div ref={host} className="combat-tooltip-layer">{[...groups].map(([key,group])=><TooltipButton key={key} className="combat-hit-target utility-hit-target"
    label={group.labels.join('; ')} content={group.labels.map((label,i)=><div key={i}>{label}</div>)}
    onClick={()=>onSelectMarker({target:group.type,x:group.rx,y:group.ry})} style={{left:group.x-13,top:group.y-13,width:26,height:26}} />)}</div>;
}
