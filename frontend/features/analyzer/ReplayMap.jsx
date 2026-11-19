import { useEffect, useMemo, useRef, useState } from 'react';
import Button from '../../shared/components/buttons/Button.jsx';
import useRememberedState from '../../shared/hooks/useRememberedState.js';
import { preference,viewPreferences } from './state/preferences.mjs';
import ToggleButton from '../../shared/components/buttons/ToggleButton.jsx';
import { pointerToRadar,areaBounds,areaOnScreen } from './state/area-selection.mjs';
import { onLevel, positionAt, worldToRadar } from './state/replay.mjs';

import { drawUtility,drawUtilityHistory } from './state/draw-utility.mjs';
import { drawAim,drawCombat } from './state/combat.mjs';
import { useGrenadeIcons,useCombatIcons } from './hooks.js';
import useElementSize from '../../shared/hooks/useElementSize.js';
import SelectionMarkers from './SelectionMarkers.jsx';
import { roundChannels,createDisplay } from './state/display.mjs';
import { viewport } from './state/viewport.mjs';
import { drawPlayerState,playerAlive } from './state/player-state.mjs';
import { selectionCandidates,candidatesInArea } from './state/map-selection.mjs';

export default function ReplayMap({ map, level, viewKey, rounds, players, selected, colors, time, startTime=0, side, display=createDisplay(), enemyDisplay=createDisplay(), rosters=null, area, areaSummary, onSelectItems=()=>{}, onClearSelection=()=>{}, onAreaStart=()=>{} }) {
  const icons=useGrenadeIcons(),combatIcons=useCombatIcons(rounds);
  const canvas = useRef(null), drag = useRef(null);
  const size=useElementSize(canvas);
  const [gestureMode,setGestureMode]=useState('select'),[preview,setPreview]=useState(null);
  const [view, setView] = useRememberedState(preference(`view.${viewKey}`),()=>({ zoom: 1, x: 0, y: 0 }),viewPreferences);
  const markerUnit=1024/Math.max(1,Math.min(size.width,size.height)*view.zoom);
  const candidates=useMemo(()=>selectionCandidates(rounds,{map,level,time,startTime,players:selected,side,display,enemyDisplay,allSelected:selected.length===players.length,unit:markerUnit,rosters}),[rounds,map,level,time,startTime,selected,side,display,enemyDisplay,players,markerUnit,rosters]);
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
    const frame=viewport(size,view,window.devicePixelRatio||1),element=canvas.current;
    const width=Math.round(frame.width*frame.pixelRatio),height=Math.round(frame.height*frame.pixelRatio);
    if(element.width!==width)element.width=width;if(element.height!==height)element.height=height;
    const ctx=element.getContext('2d');ctx.setTransform(frame.pixelRatio,0,0,frame.pixelRatio,0,0);
    ctx.clearRect(0,0,frame.width,frame.height);ctx.fillStyle='#151c25';ctx.fillRect(0,0,frame.width,frame.height);
    ctx.translate(frame.x,frame.y);ctx.scale(frame.scale,frame.scale);ctx.translate(-512,-512);
    if(image)ctx.drawImage(image,0,0,1024,1024);else return;
    const names=new Map(players.map(p=>[p.id,p.name]));
    for(const round of rounds) {
      const channels=roundChannels(round,{rosters,players:selected,side,display,enemyDisplay});
      ctx.globalAlpha=areaSummary?(areaSummary.matched.has(round)?.95:.18):rounds.length>1?.65:.9;
      if(time<=round.duration)for(const channel of channels) {
        const settings=channel.display;
        if(settings.players)for(const track of round.tracks) {
          if(!channel.ids.has(track.player)||!playerAlive(round,track.player,time))continue;
          const point=positionAt(track.samples,time);
          if(!point||!onLevel(level,point[3])||channel.side&&channel.side!==point[5])continue;
          const [x,y]=worldToRadar(map,point[1],point[2]),color=colors.get(track.player)||'#ff7373',radius=Math.max(7,5*markerUnit);
          if(settings.combat.includes('Aim'))drawAim(ctx,point,x,y,color);
          ctx.fillStyle=color;ctx.strokeStyle='#101620';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,radius,0,2*Math.PI);ctx.fill();ctx.stroke();
          drawPlayerState(ctx,round,track.player,time,x,y,{display:settings,icons:combatIcons,unit:markerUnit,radius});
          if(settings.names){ctx.font='bold 13px system-ui';ctx.lineWidth=3;const label=names.get(track.player)||'?';ctx.strokeText(label,x+10,y-6);ctx.fillStyle=color;ctx.fillText(label,x+10,y-6);}
        }
        if(settings.utilityLayers.includes('Live'))drawUtility(ctx,round,{time,map,level,selected:channel.ids,side:channel.side,utilities:settings.utilities,icons,allSelected:channel.ids.size===players.length});
      }
    }
    for(const round of rounds) {
      ctx.globalAlpha=areaSummary?(areaSummary.matched.has(round)?.9:.12):rounds.length>1?.85:1;
      for(const channel of roundChannels(round,{rosters,players:selected,side,display,enemyDisplay})) {
        const settings=channel.display;
        drawCombat(ctx,round,{time,startTime,map,level,selected:channel.ids,side:channel.side,colors,layers:settings.combat,icons:combatIcons,unit:markerUnit,singleRound:rounds.length===1,cellDeaths:rounds.length===1&&settings.players});
        if(settings.utilityLayers.includes('History'))drawUtilityHistory(ctx,round,{time,startTime,map,level,selected:channel.ids,side:channel.side,utilities:settings.utilities,icons,allSelected:channel.ids.size===players.length,liveEffects:settings.utilityLayers.includes('Live')});
      }
    }
    ctx.globalAlpha=1;
  },[image,map,level,rounds,players,selected,colors,time,startTime,side,display,enemyDisplay,view,icons,combatIcons,markerUnit,rosters,areaSummary,size.width,size.height]);
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
    <canvas ref={canvas} data-player-cells={display.players?'on':'off'} data-utility-icons={display.utilityLayers.join(',')} data-name-tags={display.names?'on':'off'} style={{touchAction:'none',cursor:gestureMode==='pan'?'grab':'crosshair'}}
      tabIndex={0} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();cancel();onClearSelection();}}}
      role="img" aria-label={`2D round playback, ${level.id} level. Drag to select a map area. Shift, Ctrl or Command adds to selection. Alt-drag, middle-drag or choose Pan to move a zoomed map. Escape clears selection.`} />
    <SelectionMarkers candidates={candidates} players={players} view={view} selection={area?.items||[]} onSelect={(items,append)=>{onAreaStart();onSelectItems(items,append);}} />
    {rectangle&&<div className="analyzer-area-rectangle" style={rectangle} />}
    {!image && <span className="analyzer-map-status" role="status">{imageError ? 'Radar image could not load.' : 'Loading radar…'}</span>}
  </div>;
}
