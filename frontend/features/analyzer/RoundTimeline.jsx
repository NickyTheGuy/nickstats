import TimelineMarkers from './TimelineMarkers.jsx';
import { roundSegments } from './state/round-clock.mjs';
import { formatTime } from './state/replay.mjs';
export default function RoundTimeline({events,round,time,duration,onSeek,onEventSeek}) {
  return <div className={`analyzer-timeline${events.length?' has-events':''}${round?' state-timeline':''}`}>
    <TimelineMarkers events={events} duration={duration} onSeek={onEventSeek} />
    {round&&<div className="analyzer-state-track" aria-hidden="true">{roundSegments(round).map((segment,i)=><span key={i} data-state={segment.state} style={{left:`${100*segment.start/duration}%`,width:`${100*(segment.end-segment.start)/duration}%`}} />)}</div>}
    <input disabled={!duration} type="range" min="0" max={duration} step="50" value={Math.min(time,duration)} onChange={e=>onSeek(Number(e.target.value))} aria-label="Round time" aria-valuetext={`${formatTime(time)} of ${formatTime(duration)}`} />
  </div>;
}
