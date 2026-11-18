import { useEffect, useRef, useState } from 'react';
import Button from '../../shared/components/buttons/Button.jsx';
import ToggleButton from '../../shared/components/buttons/ToggleButton.jsx';
import { pointerToRadar,areaBounds,areaOnScreen } from './state/area-selection.mjs';
import { onLevel, positionAt, worldToRadar } from './state/replay.mjs';

import { drawUtility,drawUtilityHistory } from './state/draw-utility.mjs';
import { drawAim,drawCombat } from './state/combat.mjs';
import { useGrenadeIcons,useCombatIcons } from './hooks.js';
import useElementSize from '../../shared/hooks/useElementSize.js';
import CombatTooltips from './CombatTooltips.jsx';
import UtilityTooltips from './UtilityTooltips.jsx';

export default function ReplayMap({ map, level, rounds, players, selected, colors, time, side, utilities, combatLayers, nameTags=false, selectionTarget='Players', onSelectionTarget=()=>{}, area, areaSummary, onArea=()=>{}, onAreaStart=()=>{} }) {
  const icons=useGrenadeIcons(),combatIcons=useCombatIcons(rounds);
  const canvas = useRef(null), drag = useRef(null);
  const size=useElementSize(canvas);
  const [gestureMode,setGestureMode]=useState('select'),[preview,setPreview]=useState(null);
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const markerUnit=1024/Math.max(1,Math.min(size.width,size.height)*view.zoom);
  useEffect(() => { setView({ zoom: 1, x: 0, y: 0 }); }, [map]);
  const zoom = delta => setView(v => {
    const next = Math.max(1, Math.min(4, v.zoom + delta)), max = (next - 1) * 512;
    if(next===1)setGestureMode('select');
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
      ctx.globalAlpha = areaSummary?(areaSummary.matched.has(round)?.95:.18):rounds.length > 1 ? 0.65 : 0.9;
      for (const track of round.tracks) {
        if (!selectedSet.has(track.player)) continue;
        const color = colors.get(track.player);
        const s = positionAt(track.samples,time);
        if (!s || !onLevel(level,s[3]) || side && side !== s[5]) continue;
        const [x,y] = worldToRadar(map,s[1],s[2]);
        if(combatLayers.includes('Aim'))drawAim(ctx,s,x,y,color);
        ctx.fillStyle = color; ctx.strokeStyle = '#101620'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x,y,7,0,Math.PI*2); ctx.fill(); ctx.stroke();
        if(nameTags){ctx.font = 'bold 13px system-ui';ctx.lineWidth = 3;
          const label = names.get(track.player) || '?';ctx.strokeText(label,x+10,y+4);ctx.fillText(label,x+10,y+4);}
      }
      drawUtility(ctx,round,{time,map,level,selected:selectedSet,side,utilities,icons,allSelected:selected.length===players.length});
    }
    // Combat markers sit above every overlaid round's living-player markers.
    ctx.globalAlpha = rounds.length > 1 ? 0.85 : 1;
    for(const round of rounds){ctx.globalAlpha=areaSummary?(areaSummary.matched.has(round)?.9:.12):rounds.length>1?.85:1;
      drawCombat(ctx,round,{time,map,level,selected:selectedSet,side,colors,layers:combatLayers,icons:combatIcons,unit:markerUnit,preferredRole:selectionTarget==='Kills'?'kill':selectionTarget==='Deaths'?'death':null});
      drawUtilityHistory(ctx,round,{time,map,level,selected:selectedSet,side,utilities,icons,target:selectionTarget});}
    ctx.globalAlpha = 1;
  }, [image,map,level,rounds,players,selected,colors,time,side,utilities,view,icons,combatLayers,combatIcons,markerUnit,nameTags,areaSummary,selectionTarget]);
  const bounds=preview?preview.bounds:area?.level===level.id?area.bounds:null;
  const rectangle=bounds?areaOnScreen(bounds,size,view):null;
  function pointerDown(event) {
    if(drag.current||event.isPrimary===false||![0,1].includes(event.button))return;
    const pan=gestureMode==='pan'||event.shiftKey||event.button===1;
    if(pan&&view.zoom===1)return;
    event.preventDefault();event.currentTarget.focus({preventScroll:true});event.currentTarget.setPointerCapture(event.pointerId);
    const rect=event.currentTarget.getBoundingClientRect(),start={x:event.clientX,y:event.clientY};
    drag.current={kind:pan?'pan':'select',start,radar:pointerToRadar(start,rect,view),rect,view};
    if(!pan){setPreview({bounds:null});onAreaStart();}
  }
  function pointerMove(event) {
    const current=drag.current;if(!current)return;
    if(current.kind==='select')setPreview({bounds:areaBounds(current.radar,pointerToRadar({x:event.clientX,y:event.clientY},current.rect,current.view))});
    else {
      const ratio=1024/Math.min(current.rect.width,current.rect.height),max=(current.view.zoom-1)*512;
      setView({...current.view,x:Math.max(-max,Math.min(max,current.view.x+(event.clientX-current.start.x)*ratio)),y:Math.max(-max,Math.min(max,current.view.y+(event.clientY-current.start.y)*ratio))});
    }
  }
  function pointerUp(event) {
    const current=drag.current;if(!current)return;
    if(current.kind==='select') {
      const bounds=areaBounds(current.radar,pointerToRadar({x:event.clientX,y:event.clientY},current.rect,current.view));
      onArea(bounds&&Math.hypot(event.clientX-current.start.x,event.clientY-current.start.y)>=4?{level:level.id,bounds}:null);
    }
    drag.current=null;setPreview(null);if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function cancel(){drag.current=null;setPreview(null);}
  function selectMarker({target,x,y}) {
    const radius=12*markerUnit,bounds=areaBounds({x:x-radius,y:y-radius},{x:x+radius,y:y+radius});if(!bounds)return;
    onAreaStart();onSelectionTarget(target);onArea({level:level.id,bounds});
  }
  return <div className="analyzer-map">
    <div className="analyzer-map-zoom" role="group" aria-label="Map zoom">
      <ToggleButton selected={gestureMode==='select'} aria-label="Select map area" onClick={()=>setGestureMode('select')}>{selectionTarget==='Players'?'Select':`Select ${selectionTarget}`}</ToggleButton>
      <ToggleButton selected={gestureMode==='pan'} aria-label="Pan map" disabled={view.zoom===1} onClick={()=>setGestureMode('pan')}>Pan</ToggleButton>
      <Button aria-label="Zoom out" disabled={view.zoom===1} onClick={()=>zoom(-0.5)}>−</Button>
      <Button aria-label="Reset map view" onClick={()=>{setView({zoom:1,x:0,y:0});setGestureMode('select');}}>{view.zoom}×</Button>
      <Button aria-label="Zoom in" disabled={view.zoom===4} onClick={()=>zoom(0.5)}>+</Button>
    </div>
    <canvas ref={canvas} data-name-tags={nameTags?'on':'off'} style={{touchAction:'none',cursor:gestureMode==='pan'?'grab':'crosshair'}}
      onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={cancel} onLostPointerCapture={cancel}
      tabIndex={0} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();cancel();onArea(null);}}}
      width="1024" height="1024" role="img" aria-label={`2D round playback, ${level.id} level. Drag to select a map area. Shift-drag or choose Pan to move a zoomed map. Escape clears selection.`} />
    <CombatTooltips map={map} level={level} rounds={rounds} selected={selected} players={players} time={time} side={side} view={view} layers={combatLayers} unit={markerUnit} onSelectMarker={selectMarker} preferredRole={selectionTarget==='Kills'?'kill':selectionTarget==='Deaths'?'death':null} />
    <UtilityTooltips map={map} level={level} rounds={rounds} selected={selected} players={players} time={time} side={side} view={view} utilities={utilities} target={selectionTarget} onSelectMarker={selectMarker} />
    {rectangle&&<div className="analyzer-area-rectangle" style={rectangle} />}
    {!image && <span className="analyzer-map-status" role="status">{imageError ? 'Radar image could not load.' : 'Loading radar…'}</span>}
  </div>;
}
