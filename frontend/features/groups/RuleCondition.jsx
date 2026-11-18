import Button from '../../shared/components/buttons/Button.jsx';
import PlayerIdentity from '../../shared/components/players/PlayerIdentity.jsx';
import ToggleGroup from '../../shared/components/forms/ToggleGroup.jsx';

const choices = [['include', 'Include', { 'data-choice': 'include' }], ['exclude', 'Exclude', { 'data-choice': 'exclude' }]];
export default function RuleCondition({ node, player, bench = false, atom = false, selected, gestures, onChange, onRemove }) {
  const moving = { id: node.id, playerId: bench ? String(player.id) : null };
  return <div className={`group-selected-player group-rule-player is-${node.exclude ? 'exclude' : 'include'}${selected ? ' is-selected' : ''}`}
    data-movable-id={node.id} data-bench-player={bench ? player.id : undefined} data-root-atom={atom ? node.id : undefined}>
    <Button className="group-drag-handle" aria-label={`Select or move ${player.name}`} aria-pressed={selected}
      title="Drag to move; Shift-click or keyboard-select multiple cells"
      onPointerDown={event => gestures.begin(event, moving)}
      onClick={event => { if (event.detail === 0) gestures.select(node.id, true); }}>⠿</Button>
    <PlayerIdentity player={player}><small>{player.match_count || 0} matches</small></PlayerIdentity>
    <ToggleGroup className="group-roster-role" label={`Include or exclude ${player.name}`} options={choices}
      value={node.exclude ? 'exclude' : 'include'} onChange={value => onChange(value === 'exclude')} />
    <Button className="group-player-remove" aria-label={bench ? `Remove ${player.name}` : `Unassign ${player.name}`}
      title={bench ? 'Remove player' : 'Return to available players'} onClick={onRemove}>×</Button>
  </div>;
}
