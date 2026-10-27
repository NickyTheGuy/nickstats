import Button from '../../shared/components/buttons/Button.jsx';
import PlayerIdentity from '../../shared/components/players/PlayerIdentity.jsx';
import ToggleGroup from '../../shared/components/forms/ToggleGroup.jsx';

const choices = [['include', 'Include', { 'data-choice': 'include' }], ['exclude', 'Exclude', { 'data-choice': 'exclude' }]];

export default function PlayerRoster({ players, onChoice, onRemove }) {
  return players.map(({ player, choice }) => <div key={player.id} className={`group-selected-player is-${choice}`}>
    <Button className="group-player-remove" aria-label={`Remove ${player.name}`} title={`Remove ${player.name}`}
      onClick={() => onRemove(player.id)}>×</Button>
    <PlayerIdentity player={player}><small>{player.match_count} matches</small></PlayerIdentity>
    <ToggleGroup className="group-roster-role" label={`Include or exclude ${player.name}`} options={choices}
      value={choice} onChange={value => onChoice(player.id, value)} />
  </div>);
}
