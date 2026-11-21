import Button from '../../shared/components/buttons/Button.jsx';
import PlayerIdentity from '../../shared/components/players/PlayerIdentity.jsx';

export default function RuleCondition({
  node,
  player,
  excluded = false,
  atom = false,
  selected,
  gestures,
  onRemove,
}) {
  return (
    <div
      className={`group-selected-player group-rule-player is-${excluded ? 'exclude' : 'include'}${selected ? ' is-selected' : ''}`}
      data-movable-id={node.id}
      data-root-atom={atom ? node.id : undefined}
    >
      <Button
        className="group-drag-handle"
        aria-label={`Select or move ${player.name}`}
        aria-pressed={selected}
        onPointerDown={(event) => gestures.begin(event, { id: node.id })}
        onClick={(event) => {
          if (event.detail === 0) gestures.select(node.id, true);
        }}
      >
        ⠿
      </Button>
      <PlayerIdentity player={player}>
        {player.match_count != null && <small>{player.match_count} matches</small>}
      </PlayerIdentity>
      <Button
        className="group-player-remove"
        aria-label={`Remove ${player.name}`}
        onClick={onRemove}
      >
        ×
      </Button>
    </div>
  );
}
