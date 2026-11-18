import { useLayoutEffect, useRef, useState } from 'react';
import TooltipButton from '../../shared/components/feedback/TooltipButton.jsx';
import { deathVisible, deathLabel } from './state/combat.mjs';
import { formatTime,onLevel,worldToRadar } from './state/replay.mjs';

export default function SkullTooltips({map,level,rounds,selected,players,time,side,view,enabled}) {
  const host=useRef(null),[size,setSize]=useState({width:0,height:0});
  useLayoutEffect(()=>{
    const observer=new ResizeObserver(([entry])=>setSize({width:entry.contentRect.width,height:entry.contentRect.height}));
    observer.observe(host.current);return ()=>observer.disconnect();
  },[]);
  const scale=Math.min(size.width,size.height)/1024,names=new Map(players.map(p=>[p.id,p.name])),selectedSet=new Set(selected),groups=new Map();
  if(enabled&&scale)for(const round of rounds)for(const event of round.deaths||[]) {
    if(event.time>time)break;
    if(!onLevel(level,event.z)||!deathVisible(event,selectedSet,side))continue;
    const [rx,ry]=worldToRadar(map,event.x,event.y),x=size.width/2+((rx-512)*view.zoom+view.x)*scale,y=size.height/2+((ry-512)*view.zoom+view.y)*scale;
    if(x<0||y<0||x>size.width||y>size.height)continue;
    const key=`${Math.round(x/12)}:${Math.round(y/12)}`;
    if(!groups.has(key))groups.set(key,{x,y,labels:[]});
    groups.get(key).labels.push(`Round ${round.number} · ${formatTime(event.time)} · ${deathLabel(event,names)} · ${event.weapon}${event.headshot?' · headshot':''}`);
  }
  return <div ref={host} className="skull-tooltip-layer">{[...groups].map(([key,group])=><TooltipButton key={key}
    className="skull-hit-target" label={group.labels.join('; ')} content={group.labels.map((label,i)=><div key={i}>{label}</div>)}
    style={{left:group.x-Math.max(12,11*scale*view.zoom),top:group.y-Math.max(12,11*scale*view.zoom),width:Math.max(24,22*scale*view.zoom),height:Math.max(24,22*scale*view.zoom)}} />)}</div>;
}
