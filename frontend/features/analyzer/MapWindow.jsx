import { invertSelectionShortcut } from './state/map-selection.mjs';
import { useCallback, useRef } from 'react';
import useElementSize from '../../shared/hooks/useElementSize.js';
import ReplayMap from './ReplayMap.jsx';
import ResizableSplit from '../../shared/components/layout/ResizableSplit.jsx';

export default function MapWindow({
  map,
  mapName,
  controls,
  visuals,
  utility,
  status,
  roundStrip,
  areaOverlay,
  combatOverlay,
  clockOverlay,
  playback: playbackControls,
  ...playback
}) {
  const toolbar = useRef(null),
    size = useElementSize(toolbar),
    visible = useRef(new Map());
  const reportVisible = useCallback((key, items) => {
    if (items === null) visible.current.delete(key);
    else visible.current.set(key, items);
  }, []);
  return (
    <div
      className={`analyzer-map-window${roundStrip ? ' has-match-rounds' : ''}`}
      style={{ '--analyzer-header-height': `${Math.ceil(size.height) + 20}px` }}
      onKeyDownCapture={(event) => {
        if (invertSelectionShortcut(event)) {
          event.preventDefault();
          event.stopPropagation();
          playback.onSelectItems([...visible.current.values()].flat(), true, 'invert');
        }
      }}
    >
      <div
        ref={toolbar}
        className={`analyzer-match-toolbar${roundStrip ? '' : ' analyzer-group-toolbar'}`}
      >
        <div className="analyzer-menu-buttons">
          {controls}
          {visuals}
          {utility}
        </div>
        {roundStrip}
      </div>
      <ResizableSplit
        key={mapName}
        className="analyzer-levels"
        orientation="auto"
        label="Map level split"
        preferenceKey={`analyzer.split.${mapName}`}
      >
        {map?.levels.map((level) => (
          <section className="analyzer-level" key={level.id}>
            {map.levels.length > 1 && (
              <h3>{level.id === 'default' ? 'Upper level' : 'Lower level'}</h3>
            )}
            <ReplayMap
              map={map}
              level={level}
              viewKey={`${mapName}.${level.id}`}
              onVisibleCandidates={reportVisible}
              {...playback}
            />
          </section>
        ))}
      </ResizableSplit>
      {!map && mapName && (
        <p className="analyzer-map-status" role="status">
          No calibrated radar is available for {mapName} yet.
        </p>
      )}
      <div className="analyzer-messages">{status}</div>
      {clockOverlay}
      {combatOverlay}
      {areaOverlay}
      {playbackControls}
    </div>
  );
}
