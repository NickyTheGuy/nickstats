import ComparisonControls from '../../shared/scoreboard/ComparisonControls.jsx';
import TabList from '../../shared/components/navigation/TabList.jsx';
import Scoreboard from '../../shared/scoreboard/Scoreboard.jsx';

export default function ComparisonBody({ model, prefix, mapsLabel, emptyMessage }) {
  if (!model) return null;
  return <>
    <ComparisonControls model={model} sectionsId={`${prefix}QuickSections`} />
    <TabList id={`${prefix}QuickMaps`} label={mapsLabel} options={model.maps} value={model.map}
      onChange={model.actions.map} className="match-browser-tabs quick-comparison-map-tabs" tabClassName="match-browser-tab" />
    <Scoreboard model={model} tableId={`${prefix}QuickTable`} />
    <p id={`${prefix}QuickEmpty`} className="quick-comparison-empty" hidden={!model.empty}>{emptyMessage}</p>
  </>;
}
