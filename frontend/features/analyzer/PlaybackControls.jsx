import Button from '../../shared/components/buttons/Button.jsx';
import OptionField from '../../shared/components/forms/OptionField.jsx';
import { formatTime } from './state/replay.mjs';

export default function PlaybackControls({ time, duration, playing, setPlaying, onSeek, speed, setSpeed }) {
  return <div className="analyzer-playback">
    <Button className="button button-secondary" onClick={() => { onSeek(0); setPlaying(false); }} aria-label="Restart round">↺</Button>
    <Button className="button button-primary" onClick={() => { if (time >= duration) onSeek(0); setPlaying(!playing); }} aria-label={playing ? 'Pause playback' : 'Play playback'}>{playing ? 'Pause' : 'Play'}</Button>
    <input type="range" min="0" max={duration} step="50" value={Math.min(time,duration)} onChange={e => onSeek(Number(e.target.value))} aria-label="Round time" aria-valuetext={`${formatTime(time)} of ${formatTime(duration)}`} />
    <output>{formatTime(time)} / {formatTime(duration)}</output>
    <OptionField label="Speed" value={String(speed)} options={[[0.5,'0.5×'],[1,'1×'],[2,'2×'],[4,'4×']].map(([v,l])=>[String(v),l])} onChange={v=>setSpeed(Number(v))} />
  </div>;
}
