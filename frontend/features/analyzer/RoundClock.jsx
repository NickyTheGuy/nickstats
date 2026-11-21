import Readout from '../../shared/components/feedback/Readout.jsx';
import { clockAt, countdownText } from './state/round-clock.mjs';
export default function RoundClock({ round, time }) {
  const clock = clockAt(round, time),
    status = {
      normal: 'Round',
      planted: 'Bomb planted',
      defused: 'Defused',
      exploded: 'Exploded',
      ended: 'Round ended',
    }[clock.state];
  return (
    <Readout
      className="analyzer-round-clock"
      data-state={clock.state}
      aria-label="Round countdown"
      aria-live="off"
      title={
        clock.estimated
          ? 'Standard timer values; a new movement capture records the configured clock.'
          : status
      }
    >
      <span>{status}</span>
      <strong>
        {clock.estimated ? '≈ ' : ''}
        {countdownText(clock.remaining)}
      </strong>
    </Readout>
  );
}
