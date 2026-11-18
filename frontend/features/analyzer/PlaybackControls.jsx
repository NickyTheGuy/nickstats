import { useLayoutEffect, useRef, useState } from 'react';
import Button from '../../shared/components/buttons/Button.jsx';
import FullscreenButton from '../../shared/components/buttons/FullscreenButton.jsx';
import Readout from '../../shared/components/feedback/Readout.jsx';
import OptionField from '../../shared/components/forms/OptionField.jsx';
import { formatTime } from './state/replay.mjs';

export default function PlaybackControls({ time, duration, playing, setPlaying, onSeek, speed, setSpeed }) {
  const host=useRef(null),[bottom,setBottom]=useState(10);
  useLayoutEffect(()=>{
    const controls=host.current,frame=controls.parentElement;
    const locate=()=>{const box=frame.getBoundingClientRect(),height=controls.getBoundingClientRect().height;
      setBottom(Math.max(10,Math.min(box.height-height-66,box.bottom-innerHeight+10)));};
    const observer=new ResizeObserver(locate);observer.observe(frame);observer.observe(controls);
    window.addEventListener('scroll',locate,true);window.addEventListener('resize',locate);locate();
    return ()=>{observer.disconnect();window.removeEventListener('scroll',locate,true);window.removeEventListener('resize',locate);};
  },[]);
  return <div ref={host} className="analyzer-playback" style={{bottom}}>
    <Button className="button button-primary" disabled={!duration} onClick={() => { if (time >= duration) onSeek(0); setPlaying(!playing); }} aria-label={playing ? 'Pause playback' : 'Play playback'}>{playing ? 'Pause' : 'Play'}</Button>
    <input disabled={!duration} type="range" min="0" max={duration} step="50" value={Math.min(time,duration)} onChange={e => onSeek(Number(e.target.value))} aria-label="Round time" aria-valuetext={`${formatTime(time)} of ${formatTime(duration)}`} />
    <Readout aria-label="Playback time" aria-live="off">{formatTime(time)} / {formatTime(duration)}</Readout>
    <OptionField label="Speed" value={String(speed)} options={[[0.5,'0.5×'],[1,'1×'],[2,'2×'],[4,'4×']].map(([v,l])=>[String(v),l])} onChange={v=>setSpeed(Number(v))} />
    <FullscreenButton getTarget={()=>host.current?.parentElement} className="button button-secondary playback-fullscreen" />
  </div>;
}
