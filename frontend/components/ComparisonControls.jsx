const valueModes = [['totals', 'Totals'], ['round', 'Per round'], ['match', 'Per match']];
const defaults = ['overview', 'opening', 'rounds'];

export default function ComparisonControls({ model }) {
  function toggleSection(key) {
    const selected = new Set(model.sections.filter(section => section.active).map(section => section.key));
    selected.has(key) ? selected.delete(key) : selected.add(key);
    model.actions.sections(selected);
  }
  return <div className="quick-comparison-controls">
    <div className="quick-comparison-sections">
      <div className="scoreboard-section-bar scoreboard-control-row">
        <strong>Sections</strong>
        <div className="scoreboard-button-group scoreboard-section-buttons">
          <button type="button" className="scoreboard-preset-button" onClick={() => model.actions.sections(defaults)}>Default</button>
          <button type="button" className="scoreboard-preset-button" onClick={() => model.actions.sections(model.sections.map(section => section.key))}>All</button>
          {model.sections.map(section => <button key={section.key} type="button"
            className={`scoreboard-section-button ${section.style}-heading${section.active ? ' active' : ''}`}
            aria-pressed={section.active} onClick={() => toggleSection(section.key)}>{section.label}</button>)}
        </div>
      </div>
      <div className="scoreboard-value-toggle scoreboard-control-row">
        <strong>Values</strong>
        <div className="scoreboard-button-group">
          {valueModes.map(([value, label]) => <button key={value} type="button" className={model.valueMode === value ? 'active' : undefined}
            aria-pressed={model.valueMode === value} onClick={() => model.actions.valueMode(value)}>{label}</button>)}
        </div>
        <div className="scoreboard-utility-basis">
          <span>Utility yields</span>
          <button type="button" disabled={model.valueMode === 'totals'} className={model.perGrenadeUtility ? 'active' : undefined}
            aria-pressed={model.perGrenadeUtility} title="Use each relevant grenade type for damage, flash effects, and flash-assist yields"
            onClick={() => model.actions.utilityBasis()}>Per grenade</button>
        </div>
        <small className="scoreboard-control-note">{model.modeNote}</small>
      </div>
    </div>
  </div>;
}
