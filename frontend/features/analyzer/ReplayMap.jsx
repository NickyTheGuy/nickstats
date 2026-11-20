import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import useRememberedState from '../../shared/hooks/useRememberedState.js';
import { preference,viewPreferences } from './state/preferences.mjs';
import { pointerToRadar,areaBounds,areaOnScreen } from './state/area-selection.mjs';
import { onLevel, positionAt, worldToRadar } from './state/replay.mjs';

import { drawUtility,drawUtilityHistory } from './state/draw-utility.mjs';
import { drawAim,drawCombat } from './state/combat.mjs';
import { useGrenadeIcons,useCombatIcons } from './hooks.js';
import useElementSize from '../../shared/hooks/useElementSize.js';
import SelectionMarkers from './SelectionMarkers.jsx';
import { roundChannels,createDisplay } from './state/display.mjs';
import { viewport } from './state/viewport.mjs';
import { transformMapView,wheelZoomFactor,touchTransform } from './state/map-view.mjs';
import { drawPlayerState,playerAlive } from './state/player-state.mjs';
import { selectionCandidates,candidatesInArea,visibleMapCandidates } from './state/map-selection.mjs';

export default function ReplayMap({ map, level, viewKey, rounds, players, selected, colors, time, startTime=0, side, display=createDisplay(), enemyDisplay=createDisplay(), rosters=null, area, areaSummary, onSelectItems=()=>{}, onClearSelection=()=>{}, onAreaStart=()=>{},onVisibleCandidates }) {
  const icons=useGrenadeIcons(),combatIcons=useCombatIcons(rounds);
  const canvas = useRef(null),surface=useRef(null),drag = useRef(null),touches=useRef(new Map()),pinch=useRef(null),suppressClick=useRef(false);
  const size=useElementSize(canvas);
  const [panning,setPanning]=useState(false),[preview,setPreview]=useState(null);
  const [view, setView] = useRememberedState(preference(`view.${viewKey}`),()=>({ zoom: 1, x: 0, y: 0 }),viewPreferences);
  const markerUnit=1024/Math.max(1,Math.min(size.width,size.height)*view.zoom);
  const candidates=useMemo(()=>selectionCandidates(rounds,{map,level,time,startTime,players:selected,side,display,enemyDisplay,allSelected:selected.length===players.length,unit:markerUnit,rosters}),[rounds,map,level,time,startTime,selected,side,display,enemyDisplay,players,markerUnit,rosters]);
  const visible=useMemo(()=>visibleMapCandidates(candidates,size,view),[candidates,size.width,size.height,view]);
  useLayoutEffect(()=>{
    onVisibleCandidates?.(viewKey,visible.map(item=>item.entry));
    return()=>onVisibleCandidates?.(viewKey,null);
  },[onVisibleCandidates,viewKey,visible]);
  useEffect(()=>{
    const element=surface.current;
    function wheel(event){
      event.preventDefault();if(drag.current||pinch.current||!event.deltaY)return;
      const rect=canvas.current.getBoundingClientRect(),point={x:event.clientX,y:event.clientY},factor=wheelZoomFactor(event.deltaY,event.deltaMode,rect.height);
      setView(value=>transformMapView(value,factor,point,point,rect));
    }
    element.addEventListener('wheel',wheel,{passive:false});return()=>element.removeEventListener('wheel',wheel);
  },[setView]);
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
    const fromMarker=Boolean(event.target.closest?.('.combat-hit-target'));
    if(event.target!==canvas.current&&!fromMarker)return;
    if(event.pointerType==='touch') {
      if(!touches.current.size)suppressClick.current=false;
      touches.current.set(event.pointerId,{x:event.clientX,y:event.clientY});
      if(touches.current.size===2){
        event.preventDefault();suppressClick.current=true;drag.current=null;setPreview(null);setPanning(true);
        pinch.current={view,points:[...touches.current.values()],rect:canvas.current.getBoundingClientRect()};
        for(const id of touches.current.keys())event.currentTarget.setPointerCapture(id);
        return;
      }
    } else suppressClick.current=false;
    if(drag.current||event.isPrimary===false||![0,2].includes(event.button))return;
    const pan=event.button===2;
    if(pan&&view.zoom===1){event.preventDefault();canvas.current.focus({preventScroll:true});return;}
    if(!fromMarker||pan){event.preventDefault();canvas.current.focus({preventScroll:true});event.currentTarget.setPointerCapture(event.pointerId);}
    const rect=canvas.current.getBoundingClientRect(),start={x:event.clientX,y:event.clientY};
    drag.current={kind:pan?'pan':'select',start,radar:pointerToRadar(start,rect,view),rect,view,fromMarker,captured:!fromMarker||pan,append:event.shiftKey||event.ctrlKey||event.metaKey};
    if(pan)setPanning(true);else {setPreview({bounds:null});onAreaStart();}
  }
  function pointerMove(event) {
    if(touches.current.has(event.pointerId))touches.current.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(pinch.current){if(touches.current.size>=2)setView(touchTransform(pinch.current.view,pinch.current.points,[...touches.current.values()].slice(0,2),pinch.current.rect));return;}
    const current=drag.current;if(!current)return;
    if(current.kind==='select'&&Math.hypot(event.clientX-current.start.x,event.clientY-current.start.y)>=4&&!current.captured){event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);canvas.current.focus({preventScroll:true});current.captured=true;}
    if(current.kind==='select')setPreview({bounds:areaBounds(current.radar,pointerToRadar({x:event.clientX,y:event.clientY},current.rect,current.view))});
    else {
      setView(transformMapView(current.view,1,current.start,{x:event.clientX,y:event.clientY},current.rect));
    }
  }
  function pointerUp(event) {
    touches.current.delete(event.pointerId);
    if(pinch.current){event.preventDefault();pinch.current=null;drag.current=null;setPreview(null);setPanning(false);if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);return;}
    const current=drag.current;if(!current)return;
    if(current.kind==='select') {
      const bounds=areaBounds(current.radar,pointerToRadar({x:event.clientX,y:event.clientY},current.rect,current.view));
      const moved=Math.hypot(event.clientX-current.start.x,event.clientY-current.start.y)>=4;
      if(moved){suppressClick.current=true;if(bounds)onSelectItems(candidatesInArea(candidates,bounds),current.append);}
      else if(!current.fromMarker&&!current.append)onClearSelection();
    }
    drag.current=null;setPreview(null);setPanning(false);if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function cancel(){drag.current=null;pinch.current=null;touches.current.clear();setPreview(null);setPanning(false);}
  function keyboard(event){
    if(event.ctrlKey||event.metaKey||event.altKey)return;
    const rect=canvas.current.getBoundingClientRect(),center={x:rect.left+rect.width/2,y:rect.top+rect.height/2};
    if(['+','=','-','_'].includes(event.key)){event.preventDefault();setView(value=>transformMapView(value,['+','='].includes(event.key)?1.2:1/1.2,center,center,rect));}
    else if(event.key==='0'||event.key==='Home'){event.preventDefault();setView({zoom:1,x:0,y:0});}
    else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();const dx=event.key==='ArrowLeft'?32:event.key==='ArrowRight'?-32:0,dy=event.key==='ArrowUp'?32:event.key==='ArrowDown'?-32:0;setView(value=>transformMapView(value,1,center,{x:center.x+dx,y:center.y+dy},rect));}
  }
  return <div ref={surface} className="analyzer-map" data-panning={panning||undefined} onContextMenuCapture={event=>{event.preventDefault();event.stopPropagation();}} onClickCapture={event=>{if(suppressClick.current&&event.detail>0){event.preventDefault();event.stopPropagation();}}} onKeyDownCapture={event=>{if(event.key==='Escape'){cancel();onClearSelection();}}} onPointerDownCapture={pointerDown} onPointerMoveCapture={pointerMove} onPointerUpCapture={pointerUp} onPointerCancelCapture={cancel} onLostPointerCapture={event=>{if(event.target===event.currentTarget)cancel();}}>
    <canvas ref={canvas} data-player-cells={display.players?'on':'off'} data-utility-icons={display.utilityLayers.join(',')} data-name-tags={display.names?'on':'off'} style={{touchAction:'none',cursor:panning?'grabbing':'crosshair'}}
      tabIndex={0} onKeyDown={keyboard}
      role="img" aria-label={`2D round playback, ${level.id} level. Left-drag to select; right-drag to pan. Scroll or pinch to zoom. Two fingers pan on touchscreens. Shift, Ctrl or Command adds to selection. Plus/minus zoom, arrows pan, and 0 resets the focused map. I inverts visible markers. Escape clears selection.`} />
    <SelectionMarkers candidates={candidates} players={players} view={view} selection={area?.items||[]} onSelect={(items,append)=>{onAreaStart();onSelectItems(items,append,'toggle');}} />
    {rectangle&&<div className="analyzer-area-rectangle" style={rectangle} />}
    {!image && <span className="analyzer-map-status" role="status">{imageError ? 'Radar image could not load.' : 'Loading radar…'}</span>}
  </div>;
}
