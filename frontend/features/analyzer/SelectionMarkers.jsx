import { useRef } from 'react';
import TooltipButton from '../../shared/components/feedback/TooltipButton.jsx';
import useElementSize from '../../shared/hooks/useElementSize.js';
import { deathLabel } from './state/combat.mjs';
import { formatTime } from './state/replay.mjs';
import { grenadeEffectiveness } from './state/selection-targets.mjs';
import { actorKey,entrySelected } from './state/map-selection.mjs';

export default function SelectionMarkers({candidates,players,view,selection,onSelect}) {
  const host=useRef(null),size=useElementSize(host),scale=Math.min(size.width,size.height)/1024;
  const names=new Map(players.map(p=>[p.id,p.name])),groups=new Map(),chosen=new Map(selection.map(e=>[actorKey(e),e]));
  if(scale)for(const item of candidates) {
    const x=size.width/2+((item.x-512)*view.zoom+view.x)*scale,y=size.height/2+((item.y-512)*view.zoom+view.y)*scale;
    if(x<0||y<0||x>size.width||y>size.height)continue;
    const key=`${item.kind}:${item.effect?.type||''}:${item.entry.player}:${Math.round(x/12)}:${Math.round(y/12)}`;
    if(!groups.has(key))groups.set(key,{x,y,kind:item.kind,items:[],labels:[]});
    const group=groups.get(key),{round,event,effect}=item;
    const actor=names.get(item.entry.player)||'Unknown thrower',prefix=`${round.match_id?`Match #${round.match_id} · `:''}Round ${round.number}`;
    let text=`${item.enemy?'Enemy':'Player'} · ${actor} · ${prefix}${item.item?` · ${item.item}`:''}${item.blind?` · blinded ${(item.blind/1000).toFixed(1)}s`:''}`;
    if(event)text=`${item.kind==='kill'?'Kill':'Death'} · ${prefix} · ${formatTime(event.time)} · ${deathLabel(event,names)} · ${event.weapon}${event.headshot?' · headshot':''}`;
    if(effect){const metric=grenadeEffectiveness(effect,round),yieldText=effect.type==='Flash'&&metric.enemies_flashed!=null?` · ${metric.enemies_flashed} enemies flashed${metric.enemy_blind_ms!=null?` · ${(metric.enemy_blind_ms/1000).toFixed(2)}s blind`:""}`:['HE','Fire'].includes(effect.type)&&metric.enemy_damage!=null?` · ${metric.enemy_damage} enemy damage`:'';
      text=`${effect.type} · ${actor} · ${prefix} · ${item.projectile?`In flight${effect.unlinked_projectile?'':` · detonates ${formatTime(effect.time)}`}`:formatTime(effect.time)}${yieldText}`;}
    group.items.push(item.entry);group.labels.push(text);
  }
  return <div ref={host} className="combat-tooltip-layer">{[...groups].sort(([,a],[,b])=>['player','kill','death','utility'].indexOf(a.kind)-['player','kill','death','utility'].indexOf(b.kind)).map(([key,group])=><TooltipButton key={key}
    className={`combat-hit-target analyzer-selection-marker ${group.kind}-hit-target`} label={group.labels.join('; ')} content={group.labels.map((label,i)=><div key={i}>{label}</div>)}
    aria-pressed={group.items.every(item=>entrySelected(item,chosen))}
    onClick={event=>onSelect(group.items,event.shiftKey||event.ctrlKey||event.metaKey)}
    style={{left:group.x-(group.kind==='kill'?20:12),top:group.y-12,width:group.kind==='kill'?40:24,height:24,touchAction:'none'}} />)}</div>;
}
