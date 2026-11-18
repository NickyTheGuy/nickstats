import Button from '../../shared/components/buttons/Button.jsx';
import CheckboxGroup from '../../shared/components/forms/CheckboxGroup.jsx';
import ToggleGroup from '../../shared/components/forms/ToggleGroup.jsx';
import { matchesSide, roundKey, roundSections } from './state/round-selection.mjs';

export default function RoundPicker({ replays,selected,onToggle,onReplace,onRemove,onDownload,busy,phase,side,players,onPreset }) {
  return <div className="analyzer-round-picker">
    <ToggleGroup label="Round phase" options={[["all","All rounds"],["regulation","Regulation"],["overtime","Overtime"]]}
      value={phase} onChange={onPreset} buttonClassName="button button-secondary" />
    <Button className="button button-secondary" onClick={()=>onReplace([])}>Clear rounds</Button>
    {replays.map(replay=><section key={replay.match_uid} className="analyzer-replay">
      <header><strong title={replay.source_file}>{replay.source_file}</strong>
        <Button className="button button-secondary" onClick={()=>onDownload(replay)}>Save replay</Button>
        <Button className="button button-secondary" disabled={busy} aria-label={`Remove ${replay.source_file}`} onClick={()=>onRemove(replay.match_uid)}>Remove</Button>
      </header>
      {roundSections(replay).map(section=><div className="analyzer-half" key={section.key}>
        <Button className="analyzer-half-button" onClick={()=>onReplace(section.rounds.filter(r=>matchesSide(r,side,players)).map(r=>roundKey(replay,r)))}>{section.label}</Button>
        <CheckboxGroup label={`${section.label} in ${replay.source_file}`} className="analyzer-rounds" labelClassName="analyzer-round-chip"
          options={section.rounds.map(r=>[roundKey(replay,r),`R${r.number}`])} selected={selected} onChange={onToggle} />
      </div>)}
    </section>)}
  </div>;
}
