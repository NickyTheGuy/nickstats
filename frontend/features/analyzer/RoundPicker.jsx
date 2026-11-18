import Button from '../../shared/components/buttons/Button.jsx';
import CheckboxGroup from '../../shared/components/forms/CheckboxGroup.jsx';

export default function RoundPicker({ replays, map, selected, onToggle, onRemove, onDownload, busy }) {
  return <div className="analyzer-round-picker">
    {replays.filter(r=>r.map===map).map(replay => <section key={replay.match_uid} className="analyzer-replay">
      <header><strong title={replay.source_file}>{replay.source_file}</strong>
        <Button className="button button-secondary" onClick={()=>onDownload(replay)}>Save replay</Button>
        <Button className="button button-secondary" disabled={busy} aria-label={`Remove ${replay.source_file}`} onClick={()=>onRemove(replay.match_uid)}>Remove</Button>
      </header>
      <CheckboxGroup label={`Rounds in ${replay.source_file}`} className="analyzer-rounds" labelClassName="analyzer-round-chip"
        options={replay.rounds.map(r=>[`${replay.match_uid}:${r.number}`,`R${r.number}`])} selected={selected} onChange={onToggle} />
    </section>)}
  </div>;
}
