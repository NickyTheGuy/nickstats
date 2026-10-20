export default function PlayerIdentity({ player, className = '', children }) {
  return <span className={className}><strong>{player.name || 'Unknown player'}</strong>
    {children || <span>{player.steam_id || 'No Steam ID'}</span>}
  </span>;
}
