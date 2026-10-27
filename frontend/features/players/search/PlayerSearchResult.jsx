import Button from '../../../shared/components/buttons/Button.jsx';
import PlayerIdentity from '../../../shared/components/players/PlayerIdentity.jsx';

export default function PlayerSearchResult({ player, prefix, onSelect }) {
  const count = Number(player.match_count) || 0;
  const matches = `${Math.round(count).toLocaleString()} match${count === 1 ? '' : 'es'}`;
  const group = prefix === 'group';
  return <Button className={`${prefix}-search-result`} onClick={() => onSelect(player)}>
    <PlayerIdentity player={player} className={`${prefix}-result-identity`}>
      {group && <small>{matches} · {player.steam_id || 'No Steam ID'}</small>}
    </PlayerIdentity>
    {!group && <span className="player-result-count">{matches}</span>}
    <span className={`${prefix}-result-${group ? 'add' : 'open'}`}>{group ? '+ Add' : 'Open profile →'}</span>
  </Button>;
}
