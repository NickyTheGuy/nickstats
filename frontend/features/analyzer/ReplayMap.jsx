import { useEffect, useRef, useState } from 'react';
import Button from '../../shared/components/buttons/Button.jsx';
import { onLevel, positionAt, sampleIndex, worldToRadar } from './state/replay.mjs';

const utilityColors = { Smoke: '#dce3ee', Flash: '#fff48c', HE: '#ff6b59', Fire: '#ffad46', Decoy: '#c496ff' };

function drawTrack(ctx, samples, time, map, level, side, color) {
  ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.beginPath();
  let previous = null;
  const end = sampleIndex(samples, time);
  for (let i = Math.max(0, sampleIndex(samples, time - 5000)); i <= end; i++) {
    const s = samples[i];
    if (!s[4] || !onLevel(level, s[3]) || side && s[5] !== side) { previous = null; continue; }
    const point = worldToRadar(map, s[1], s[2]);
    if (!previous || s[0]-previous[0] > 600 || Math.hypot(s[1]-previous[1],s[2]-previous[2]) > 300) ctx.moveTo(...point);
    else ctx.lineTo(...point);
    previous = s;
  }
  ctx.stroke();
}

export default function ReplayMap({ map, level, rounds, players, selected, colors, time, side, utilities, trails }) {
  const canvas = useRef(null), drag = useRef(null);
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  useEffect(() => { setView({ zoom: 1, x: 0, y: 0 }); }, [map]);
  const zoom = delta => setView(v => {
    const next = Math.max(1, Math.min(4, v.zoom + delta)), max = (next - 1) * 512;
    return { zoom: next, x: Math.max(-max,Math.min(max,v.x)), y: Math.max(-max,Math.min(max,v.y)) };
  });
  const [image, setImage] = useState(null), [imageError, setImageError] = useState(false);
  useEffect(() => {
    setImage(null); setImageError(false);
    const img = new Image(); let cancelled = false;
    img.onload = () => { if (!cancelled) setImage(img); };
    img.onerror = () => { if (!cancelled) setImageError(true); };
    img.src = level.image;
    return () => { cancelled = true; };
  }, [level.image]);
  useEffect(() => {
    const ctx = canvas.current.getContext('2d');
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,1024,1024); ctx.fillStyle = '#151c25'; ctx.fillRect(0,0,1024,1024);
    ctx.translate(512+view.x,512+view.y); ctx.scale(view.zoom,view.zoom); ctx.translate(-512,-512);
    if (image) ctx.drawImage(image,0,0,1024,1024);
    if (!image) return;
    const selectedSet = new Set(selected), names = new Map(players.map(p => [p.id,p.name]));
    for (const round of rounds) {
      if (time > round.duration) continue;
      ctx.globalAlpha = rounds.length > 1 ? 0.65 : 0.9;
      for (const track of round.tracks) {
        if (!selectedSet.has(track.player)) continue;
        const color = colors.get(track.player);
        if (trails) drawTrack(ctx,track.samples,time,map,level,side,color);
        const s = positionAt(track.samples,time);
        if (!s || !onLevel(level,s[3]) || side && side !== s[5]) continue;
        const [x,y] = worldToRadar(map,s[1],s[2]);
        ctx.fillStyle = color; ctx.strokeStyle = '#101620'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x,y,7,0,Math.PI*2); ctx.fill(); ctx.stroke();
        ctx.font = 'bold 13px system-ui'; ctx.lineWidth = 3;
        const label = names.get(track.player) || '?'; ctx.strokeText(label,x+10,y+4); ctx.fillText(label,x+10,y+4);
      }
      for (const event of round.utility) {
        // Markers show actual detonation/start events for 1.5 seconds, not modeled cloud/flight geometry.
        if (!utilities.includes(event.type) || time < event.time || time > event.time+1500 || !onLevel(level,event.z)) continue;
        if (event.player ? !selectedSet.has(event.player) : selected.length !== players.length || side) continue;
        if (side) {
          const samples = round.tracks.find(t => t.player === event.player)?.samples;
          if (!samples || samples[sampleIndex(samples,event.time)]?.[5] !== side) continue;
        }
        const [x,y] = worldToRadar(map,event.x,event.y);
        ctx.fillStyle = utilityColors[event.type]; ctx.strokeStyle = '#131b28'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x,y,10,0,Math.PI*2); ctx.fill(); ctx.stroke();
        ctx.font = 'bold 12px system-ui'; ctx.fillStyle = '#111827'; ctx.textAlign = 'center';
        ctx.fillText(event.type[0],x,y+4); ctx.textAlign = 'start';
      }
    }
    ctx.globalAlpha = 1;
  }, [image,map,level,rounds,players,selected,colors,time,side,utilities,trails,view]);
  return <div className="analyzer-map">
    <div className="analyzer-map-zoom" role="group" aria-label="Map zoom">
      <Button aria-label="Zoom out" disabled={view.zoom===1} onClick={()=>zoom(-0.5)}>−</Button>
      <Button aria-label="Reset map view" onClick={()=>setView({zoom:1,x:0,y:0})}>{view.zoom}×</Button>
      <Button aria-label="Zoom in" disabled={view.zoom===4} onClick={()=>zoom(0.5)}>+</Button>
    </div>
    <canvas ref={canvas} style={{touchAction:view.zoom>1?'none':'auto',cursor:view.zoom>1?'grab':'auto'}}
      onPointerDown={e=>{ if (view.zoom===1 || e.button!==0) return; e.currentTarget.setPointerCapture(e.pointerId); drag.current={ x:e.clientX,y:e.clientY,view }; }}
      onPointerMove={e=>{ if (!drag.current) return; const ratio=1024/e.currentTarget.getBoundingClientRect().width,max=(view.zoom-1)*512;
        setView({...view,x:Math.max(-max,Math.min(max,drag.current.view.x+(e.clientX-drag.current.x)*ratio)),y:Math.max(-max,Math.min(max,drag.current.view.y+(e.clientY-drag.current.y)*ratio))}); }}
      onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}} width="1024" height="1024" role="img" aria-label={`2D round playback, ${level.id} level. Player labels and five-second trails are drawn on the radar.`} />
    {!image && <span className="analyzer-map-status" role="status">{imageError ? 'Radar image could not load.' : 'Loading radar…'}</span>}
  </div>;
}
