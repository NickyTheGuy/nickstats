import Button from '../components/buttons/Button.jsx';
import ToggleButton from '../components/buttons/ToggleButton.jsx';
import ToggleGroup from '../components/forms/ToggleGroup.jsx';
import { valueModes, defaultSections } from '../../features/comparisons/state/comparison.mjs';

export default function ComparisonControls({ model, sectionsId, defaults = defaultSections, modes = valueModes, bare = false }) {
  function toggleSection(key) {
    const selected = new Set(model.sections.filter(section => section.active).map(section => section.key));
    selected.has(key) ? selected.delete(key) : selected.add(key);
    model.actions.sections(selected);
  }
  const controls = <>
      <div className="scoreboard-section-bar scoreboard-control-row">
        <strong>Sections</strong>
        <div className="scoreboard-button-group scoreboard-section-buttons">
          <Button className="scoreboard-preset-button" onClick={() => model.actions.sections(defaults)}>Default</Button>
          <Button className="scoreboard-preset-button" onClick={() => model.actions.sections(model.sections.map(section => section.key))}>All</Button>
          {model.sections.map(section => <ToggleButton key={section.key} selected={section.active}
            className={`scoreboard-section-button ${section.style}-heading`}
            onClick={() => toggleSection(section.key)}>{section.label}</ToggleButton>)}
        </div>
      </div>
      <div className="scoreboard-value-toggle scoreboard-control-row">
        <strong>Values</strong>
        <ToggleGroup label="Scoreboard values" options={modes} value={model.valueMode} onChange={model.actions.valueMode} />
        <div className="scoreboard-utility-basis">
          <span>Utility yields</span>
          <ToggleButton disabled={model.valueMode === 'totals'} selected={model.perGrenadeUtility} title="Use each relevant grenade type for damage, flash effects, and flash-assist yields"
            onClick={() => model.actions.utilityBasis()}>Per grenade</ToggleButton>
        </div>
        <small className="scoreboard-control-note">{model.modeNote}</small>
      </div>
  </>;
  return bare ? controls : <div className="quick-comparison-controls">
    <div className="quick-comparison-sections" id={sectionsId}>{controls}</div>
  </div>;
}
