import { useRef } from 'react';
import useElementSize from '../../shared/hooks/useElementSize.js';
import ReplayMap from './ReplayMap.jsx';
import ResizableSplit from '../../shared/components/layout/ResizableSplit.jsx';

export default function MapWindow({map,mapName,controls,visuals,utility,status,roundStrip,areaOverlay,combatOverlay,clockOverlay,playback:playbackControls,...playback}) {
  const toolbar=useRef(null),size=useElementSize(toolbar);
  return <div className={`analyzer-map-window${roundStrip?' has-match-rounds':''}`} style={{'--analyzer-header-height':`${Math.ceil(size.height)+20}px`}}>
    <div ref={toolbar} className={`analyzer-match-toolbar${roundStrip?'':' analyzer-group-toolbar'}`}><div className="analyzer-menu-buttons">{controls}{visuals}{utility}</div>{roundStrip}</div>
    <ResizableSplit key={mapName} className="analyzer-levels" orientation="auto" label="Map level split">
      {map?.levels.map(level=><section className="analyzer-level" key={level.id}>
        {map.levels.length>1 && <h3>{level.id==='default'?'Upper level':'Lower level'}</h3>}
        <ReplayMap map={map} level={level} {...playback} />
      </section>)}
    </ResizableSplit>
    {!map && mapName && <p className="analyzer-map-status" role="status">No calibrated radar is available for {mapName} yet.</p>}
    <div className="analyzer-messages">{status}</div>
    {clockOverlay}
    {combatOverlay}
    {areaOverlay}
    {playbackControls}
  </div>;
}
