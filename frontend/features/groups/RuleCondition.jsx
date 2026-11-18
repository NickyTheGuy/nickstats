import Button from '../../shared/components/buttons/Button.jsx';
import OptionField from '../../shared/components/forms/OptionField.jsx';

export default function RuleCondition({ node, players, onChange, onRemove }) {
  return <div className="group-rule-condition">
    <OptionField label="Presence" value={node.exclude ? 'exclude' : 'include'}
      options={[["include", "Include"], ["exclude", "Exclude"]]}
      onChange={value => onChange({ ...node, exclude: value === 'exclude' })} />
    <OptionField label="Player" value={node.playerId}
      options={players.map(player => [String(player.id), player.name])}
      onChange={playerId => onChange({ ...node, playerId })} />
    <Button className="button button-secondary" onClick={onRemove} aria-label="Remove player condition">Remove</Button>
  </div>;
}
