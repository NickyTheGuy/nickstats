import TooltipButton from '../../shared/components/feedback/TooltipButton.jsx';
function EventIcon({kind}) {
  return <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind==='kill'?<><circle cx="10" cy="10" r="5.5"/><path d="M10 1v6m0 6v6M1 10h6m6 0h6"/></>:kind==='defuse'?<><circle cx="10" cy="10" r="7"/><path d="m6 10 3 3 5-6"/></>:kind==='explode'?<path d="m10 1 2 5 5-3-2 6 4 2-5 2 1 5-5-3-4 3 1-6-5-2 5-2z"/>:<><rect x="4" y="7" width="12" height="11" rx="2"/><path d="M7 7V4c0-3 6-3 6 0v3m-6 4h6m-6 3h3"/></>}
  </svg>;
}
export default function TimelineMarkers({events,duration,onSeek}) {
  const groups=new Map();for(const event of events){if(!groups.has(event.time))groups.set(event.time,[]);groups.get(event.time).push(event);}
  return <div className="analyzer-timeline-events" aria-label="Round timeline events">{duration>0&&[...groups].map(([time,rows])=><TooltipButton key={time} className="analyzer-event-time" data-kind={rows.find(e=>e.kind!=='kill')?.kind||'kill'} style={{left:`${100*Math.min(time,duration)/duration}%`}}
    label={rows.map(e=>e.label).join('; ')} content={rows.map((e,i)=><div key={i}>{e.label}</div>)} onClick={()=>onSeek(time)}><EventIcon kind={rows.find(e=>e.kind!=='kill')?.kind||'kill'} /></TooltipButton>)}</div>;
}
