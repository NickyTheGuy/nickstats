import ReplayMap from './ReplayMap.jsx';
import ResizableSplit from '../../shared/components/layout/ResizableSplit.jsx';

export default function MapWindow({map,mapName,controls,visuals,actions,status,roundStrip,areaOverlay,combatOverlay,clockOverlay,playback:playbackControls,...playback}) {
  return <div className={`analyzer-map-window${roundStrip?' has-match-rounds':''}`}>
    {roundStrip&&<div className="analyzer-match-toolbar"><div className="analyzer-menu-buttons">{controls}{visuals}</div>{roundStrip}<div className="analyzer-file-actions">{actions}</div></div>}
    <ResizableSplit key={mapName} className="analyzer-levels" orientation="auto" label="Map level split">
      {map?.levels.map(level=><section className="analyzer-level" key={level.id}>
        {map.levels.length>1 && <h3>{level.id==='default'?'Upper level':'Lower level'}</h3>}
        <ReplayMap map={map} level={level} {...playback} />
      </section>)}
    </ResizableSplit>
    {!map && mapName && <p className="analyzer-map-status" role="status">No calibrated radar is available for {mapName} yet.</p>}
    {!roundStrip&&<><div className="analyzer-menu-buttons">{controls}{visuals}</div><div className="analyzer-file-actions">{actions}</div></>}
    <div className="analyzer-messages">{status}</div>
    {clockOverlay}
    {combatOverlay}
    {areaOverlay}
    {playbackControls}
  </div>;
}
