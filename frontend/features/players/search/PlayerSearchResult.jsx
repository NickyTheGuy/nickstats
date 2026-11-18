import Button from '../../../shared/components/buttons/Button.jsx';
import PlayerIdentity from '../../../shared/components/players/PlayerIdentity.jsx';

export default function PlayerSearchResult({ player, prefix, onSelect, variant }) {
  const count = Number(player.match_count) || 0;
  const matches = `${Math.round(count).toLocaleString()} match${count === 1 ? '' : 'es'}`;
  const group = variant === 'group' || prefix === 'group', stylePrefix=group?'group':prefix;
  return <Button className={`${stylePrefix}-search-result`} onClick={() => onSelect(player)}>
    <PlayerIdentity player={player} className={`${stylePrefix}-result-identity`}>
      {group && <small>{matches} · {player.steam_id || 'No Steam ID'}</small>}
    </PlayerIdentity>
    {!group && <span className="player-result-count">{matches}</span>}
    <span className={`${stylePrefix}-result-${group ? 'add' : 'open'}`}>{group ? '+ Add' : 'Open profile →'}</span>
  </Button>;
}
