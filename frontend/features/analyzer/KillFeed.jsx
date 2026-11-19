import { feedRows } from './state/kill-feed.mjs';
import { weaponIconKey,weaponIconPath } from './state/weapon-icons.mjs';
export default function KillFeed({events,time,players,colors}) {
  const names=new Map(players.map(p=>[p.id,p.name])),rows=feedRows(events,time);
  return <div className="analyzer-kill-feed" aria-label="Round kill feed">{rows.map(({event,opacity},i)=><div key={`${event.time}:${i}`} style={{opacity}}>
    <span style={{color:colors.get(event.killer)}}>{names.get(event.killer)||'World'}</span>
    {weaponIconKey(event.weapon)?<img src={weaponIconPath(weaponIconKey(event.weapon))} alt={event.weapon} />:<span>{event.weapon}</span>}
    {event.headshot&&<span aria-label="Headshot">⊕</span>}<span style={{color:colors.get(event.victim)}}>{names.get(event.victim)||'Unknown'}</span>
  </div>)}</div>;
}
