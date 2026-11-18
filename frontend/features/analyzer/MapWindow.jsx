import OptionField from '../../shared/components/forms/OptionField.jsx';
import ReplayMap from './ReplayMap.jsx';
import ResizableSplit from '../../shared/components/layout/ResizableSplit.jsx';

export default function MapWindow({map,mapName,layout,setLayout,controls,...playback}) {
  return <div className="analyzer-map-window">
    <ResizableSplit key={mapName} className="analyzer-levels" orientation={layout} label="Map level split">
      {map?.levels.map(level=><section className="analyzer-level" key={level.id}>
        {map.levels.length>1 && <h3>{level.id==='default'?'Upper level':'Lower level'}</h3>}
        <ReplayMap map={map} level={level} {...playback} />
      </section>)}
    </ResizableSplit>
    {!map && <p className="analyzer-map-status" role="status">No calibrated radar is available for {mapName} yet.</p>}
    {map?.levels.length>1 && <div className="analyzer-layout-control"><OptionField label="Levels" value={layout}
      options={[["auto","Auto"],["columns","Side by side"],["rows","Stacked"]]} onChange={setLayout} /></div>}
    {controls}
  </div>;
}
