import ComparisonControls from './ComparisonControls.jsx';
import Scoreboard from './Scoreboard.jsx';

export default function ComparisonBody({ model, prefix, mapsLabel, emptyMessage }) {
  if (!model) return null;
  return <>
    <ComparisonControls model={model} sectionsId={`${prefix}QuickSections`} />
    <nav id={`${prefix}QuickMaps`} className="match-browser-tabs quick-comparison-map-tabs" role="tablist" aria-label={mapsLabel}>
      {model.maps.map(([value, label]) => <button key={value} type="button" role="tab"
        className={`match-browser-tab${model.map === value ? ' active' : ''}`}
        aria-selected={model.map === value} tabIndex={model.map === value ? 0 : -1}
        onClick={() => model.actions.map(value)}>{label}</button>)}
    </nav>
    <Scoreboard model={model} tableId={`${prefix}QuickTable`} />
    <p id={`${prefix}QuickEmpty`} className="quick-comparison-empty" hidden={!model.empty}>{emptyMessage}</p>
  </>;
}
