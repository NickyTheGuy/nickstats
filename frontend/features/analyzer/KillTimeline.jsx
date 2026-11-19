import TooltipButton from '../../shared/components/feedback/TooltipButton.jsx';
import { deathLabel } from './state/combat.mjs';
import { formatTime } from './state/replay.mjs';
export default function KillTimeline({events,duration,players,onSeek}) {
  const names=new Map(players.map(p=>[p.id,p.name])),groups=new Map();
  for(const event of events){if(!groups.has(event.time))groups.set(event.time,[]);groups.get(event.time).push(event);}
  return <div className="analyzer-timeline-kills" aria-label="Kill times">{duration>0&&[...groups].map(([time,rows])=><TooltipButton key={time} className="analyzer-kill-time" style={{left:`${100*Math.min(time,duration)/duration}%`}}
    label={`Kill at ${formatTime(time)} · ${rows.map(e=>deathLabel(e,names)).join('; ')}`} content={rows.map((e,i)=><div key={i}>{formatTime(time)} · {deathLabel(e,names)}</div>)} onClick={()=>onSeek(time)}>
    <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="10" cy="10" r="5.5"/><path d="M10 1v6m0 6v6M1 10h6m6 0h6"/></svg>
  </TooltipButton>)}</div>;
}
