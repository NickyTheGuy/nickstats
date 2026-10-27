import Button from '../../shared/components/buttons/Button.jsx';
import PlayerIdentity from '../../shared/components/players/PlayerIdentity.jsx';

export default function RecentPlayers({ players, onSelect, onClear }) {
  return <>
    <header><h3>Recently viewed</h3><Button id="playerRecentClear" onClick={onClear}>Clear</Button></header>
    <div className="player-recent-list" id="playerRecentList">
      {players.map(player => <Button key={player.id} className="player-recent-chip" onClick={() => onSelect(player.id)}>
        <PlayerIdentity player={player} unwrapped><span>{player.steam_id || 'Open profile'}</span></PlayerIdentity>
      </Button>)}
    </div>
  </>;
}
