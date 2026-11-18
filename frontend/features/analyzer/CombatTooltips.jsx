import { useRef } from 'react';
import TooltipButton from '../../shared/components/feedback/TooltipButton.jsx';
import useElementSize from '../../shared/hooks/useElementSize.js';
import { combatMarkers, deathLabel } from './state/combat.mjs';
import { formatTime } from './state/replay.mjs';

export default function CombatTooltips({map,level,rounds,selected,players,time,side,view,layers,unit,onSelectMarker,preferredRole}) {
  const host=useRef(null),size=useElementSize(host);
  const scale=Math.min(size.width,size.height)/1024,names=new Map(players.map(p=>[p.id,p.name])),selectedSet=new Set(selected),groups=new Map();
  if(scale)for(const round of rounds)for(const event of round.deaths||[]) {
    if(event.time>time)break;
    for(const mark of combatMarkers(event,{selected:selectedSet,side,layers,map,level,unit,preferredRole})) {
      const x=size.width/2+((mark.x-512)*view.zoom+view.x)*scale,y=size.height/2+((mark.y-512)*view.zoom+view.y)*scale;
      if(x<0||y<0||x>size.width||y>size.height)continue;
      const key=`${mark.kind}:${Math.round(x/12)}:${Math.round(y/12)}`;
      if(!groups.has(key))groups.set(key,{x,y,kind:mark.kind,radarX:mark.baseX,radarY:mark.baseY,labels:[]});
      groups.get(key).labels.push(`${mark.kind==='kill'?'Kill':'Death'} · ${round.match_id?`Match #${round.match_id} · `:''}Round ${round.number} · ${formatTime(event.time)} · ${deathLabel(event,names)} · ${event.weapon}${event.headshot?' · headshot':''}`);
    }
  }
  return <div ref={host} className="combat-tooltip-layer">{[...groups].map(([key,group])=><TooltipButton key={key}
    className="combat-hit-target" onClick={()=>onSelectMarker?.({target:group.kind==='kill'?'Kills':'Deaths',x:group.radarX,y:group.radarY})} label={group.labels.join('; ')} content={group.labels.map((label,i)=><div key={i}>{label}</div>)}
    style={{left:group.x-(group.kind==='kill'?20:12),top:group.y-12,width:group.kind==='kill'?40:24,height:24}} />)}</div>;
}
