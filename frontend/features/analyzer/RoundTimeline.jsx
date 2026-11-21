import RangeSlider from '../../shared/components/forms/RangeSlider.jsx';
import TimelineMarkers from './TimelineMarkers.jsx';
import { roundSegments } from './state/round-clock.mjs';
import { formatTime } from './state/replay.mjs';
export default function RoundTimeline({
  events,
  round,
  time,
  duration,
  onSeek,
  onEventSeek,
  startTime = 0,
  onStart,
}) {
  return (
    <div
      className={`analyzer-timeline${events.length ? ' has-events' : ''}${round ? ' state-timeline' : ''}`}
    >
      <TimelineMarkers
        events={events}
        duration={duration}
        startTime={startTime}
        time={time}
        onSeek={onEventSeek}
      />
      <RangeSlider
        start={startTime}
        end={time}
        min={0}
        max={duration}
        step={50}
        onStart={onStart}
        onEnd={onSeek}
        disabled={!duration}
        startLabel="Event start time"
        endLabel="Round time"
        startText={`${formatTime(startTime)}; events before this are hidden`}
        endText={`${formatTime(time)} of ${formatTime(duration)}`}
      >
        {round && (
          <div className="analyzer-state-track" aria-hidden="true">
            {roundSegments(round).map((segment, i) => (
              <span
                key={i}
                data-state={segment.state}
                style={{
                  left: `${(100 * segment.start) / duration}%`,
                  width: `${(100 * (segment.end - segment.start)) / duration}%`,
                }}
              />
            ))}
          </div>
        )}
      </RangeSlider>
    </div>
  );
}
