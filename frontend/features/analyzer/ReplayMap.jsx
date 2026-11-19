import { useEffect, useMemo, useRef, useState } from 'react';
import Button from '../../shared/components/buttons/Button.jsx';
import ToggleButton from '../../shared/components/buttons/ToggleButton.jsx';
import { pointerToRadar,areaBounds,areaOnScreen } from './state/area-selection.mjs';
import { onLevel, positionAt, worldToRadar } from './state/replay.mjs';

import { drawUtility,drawUtilityHistory } from './state/draw-utility.mjs';
import { drawAim,drawCombat } from './state/combat.mjs';
import { useGrenadeIcons,useCombatIcons } from './hooks.js';
import useElementSize from '../../shared/hooks/useElementSize.js';
import SelectionMarkers from './SelectionMarkers.jsx';
import { selectionCandidates,candidatesInArea } from './state/map-selection.mjs';

export default function ReplayMap({ map, level, rounds, players, selected, colors, time, side, utilities, combatLayers, nameTags=false, area, areaSummary, onSelectItems=()=>{}, onClearSelection=()=>{}, onAreaStart=()=>{} }) {
  const icons=useGrenadeIcons(),combatIcons=useCombatIcons(rounds);
  const canvas = useRef(null), drag = useRef(null);
  const size=useElementSize(canvas);
  const [gestureMode,setGestureMode]=useState('select'),[preview,setPreview]=useState(null);
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const markerUnit=1024/Math.max(1,Math.min(size.width,size.height)*view.zoom);
  const candidates=useMemo(()=>selectionCandidates(rounds,{map,level,time,players:selected,side,utilities,layers:combatLayers,allSelected:selected.length===players.length,unit:markerUnit}),[rounds,map,level,time,selected,side,utilities,combatLayers,players,markerUnit]);
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
      drawCombat(ctx,round,{time,map,level,selected:selectedSet,side,colors,layers:combatLayers,icons:combatIcons,unit:markerUnit});
      drawUtilityHistory(ctx,round,{time,map,level,selected:selectedSet,side,utilities,icons,allSelected:selected.length===players.length});}
    ctx.globalAlpha = 1;
  }, [image,map,level,rounds,players,selected,colors,time,side,utilities,view,icons,combatLayers,combatIcons,markerUnit,nameTags,areaSummary]);
  const bounds=preview?.bounds;
  const rectangle=bounds?areaOnScreen(bounds,size,view):null;
  function pointerDown(event) {
    if(drag.current||event.isPrimary===false||![0,1].includes(event.button))return;
    const fromMarker=Boolean(event.target.closest?.('.combat-hit-target'));
    if(event.target!==canvas.current&&!fromMarker)return;
    const pan=gestureMode==='pan'||event.altKey||event.button===1;
    if(pan&&view.zoom===1)return;
    if(!fromMarker||pan){event.preventDefault();canvas.current.focus({preventScroll:true});event.currentTarget.setPointerCapture(event.pointerId);}
    const rect=canvas.current.getBoundingClientRect(),start={x:event.clientX,y:event.clientY};
    drag.current={kind:pan?'pan':'select',start,radar:pointerToRadar(start,rect,view),rect,view,fromMarker,captured:!fromMarker||pan,append:event.shiftKey||event.ctrlKey||event.metaKey};
    if(!pan){setPreview({bounds:null});onAreaStart();}
  }
  function pointerMove(event) {
    const current=drag.current;if(!current)return;
    if(current.kind==='select'&&Math.hypot(event.clientX-current.start.x,event.clientY-current.start.y)>=4&&!current.captured){event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);canvas.current.focus({preventScroll:true});current.captured=true;}
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
      const moved=Math.hypot(event.clientX-current.start.x,event.clientY-current.start.y)>=4;
      if(moved&&bounds)onSelectItems(candidatesInArea(candidates,bounds),current.append);
      else if(!current.fromMarker&&!current.append)onClearSelection();
    }
    drag.current=null;setPreview(null);if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function cancel(){drag.current=null;setPreview(null);}
  return <div className="analyzer-map" onKeyDownCapture={event=>{if(event.key==='Escape'){cancel();onClearSelection();}}} onPointerDownCapture={pointerDown} onPointerMoveCapture={pointerMove} onPointerUpCapture={pointerUp} onPointerCancelCapture={cancel} onLostPointerCapture={event=>{if(event.target===event.currentTarget)cancel();}}>
    <div className="analyzer-map-zoom" role="group" aria-label="Map zoom">
      <ToggleButton selected={gestureMode==='select'} aria-label="Select map area" onClick={()=>setGestureMode('select')}>Select</ToggleButton>
      <ToggleButton selected={gestureMode==='pan'} aria-label="Pan map" disabled={view.zoom===1} onClick={()=>setGestureMode('pan')}>Pan</ToggleButton>
      <Button aria-label="Zoom out" disabled={view.zoom===1} onClick={()=>zoom(-0.5)}>−</Button>
      <Button aria-label="Reset map view" onClick={()=>{setView({zoom:1,x:0,y:0});setGestureMode('select');}}>{view.zoom}×</Button>
      <Button aria-label="Zoom in" disabled={view.zoom===4} onClick={()=>zoom(0.5)}>+</Button>
    </div>
    <canvas ref={canvas} data-name-tags={nameTags?'on':'off'} style={{touchAction:'none',cursor:gestureMode==='pan'?'grab':'crosshair'}}
      tabIndex={0} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();cancel();onClearSelection();}}}
      width="1024" height="1024" role="img" aria-label={`2D round playback, ${level.id} level. Drag to select a map area. Shift, Ctrl or Command adds to selection. Alt-drag, middle-drag or choose Pan to move a zoomed map. Escape clears selection.`} />
    <SelectionMarkers candidates={candidates} players={players} view={view} selection={area?.items||[]} onSelect={(items,append)=>{onAreaStart();onSelectItems(items,append);}} />
    {rectangle&&<div className="analyzer-area-rectangle" style={rectangle} />}
    {!image && <span className="analyzer-map-status" role="status">{imageError ? 'Radar image could not load.' : 'Loading radar…'}</span>}
  </div>;
}
