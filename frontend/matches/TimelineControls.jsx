import OptionField from '../components/OptionField.jsx';
import CheckboxGroup from '../components/CheckboxGroup.jsx';

export default function TimelineControls({ metrics, metric, display, players, selected, onMetricChange, onDisplayChange, onPlayerChange }) {
  return <>
    <div className="round-timeline-heading">
      <div><h3>Round timeline</h3><p>Compare running totals at the end of each round. Hover to see what happened in that round. Round differential follows the cumulative team score.</p></div>
      <OptionField id="demoTimelineMetric" className="timeline-option-field" label="Timeline statistic" options={metrics} value={metric} onChange={onMetricChange} />
      <OptionField id="demoTimelineDisplay" className="timeline-option-field" label="Timeline display" options={[["line", "Line"], ["bars", "Bars"]]} value={display} onChange={onDisplayChange} />
    </div>
    <div className="graph-player-picker match-timeline-player-picker" id="demoTimelinePlayerPicker" hidden={metric === 'differential'}>
      <div><strong>Players</strong><span id="demoTimelinePlayerStatus">{selected.length} of {players.length} players selected</span></div>
      <CheckboxGroup label="Timeline players" descriptionId="demoTimelinePlayerStatus" className="graph-player-choices" labelClassName="graph-player-choice match-timeline-player-choice"
        options={players.map(player => [player.index, player.name, {}, { style: { '--series-color': player.color } }])}
        selected={selected} onChange={onPlayerChange} />
    </div>
  </>;
}
