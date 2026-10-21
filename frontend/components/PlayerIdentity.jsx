export default function PlayerIdentity({ player, className = '', children, unwrapped = false }) {
  const identity = <><strong>{player.name || 'Unknown player'}</strong>
    {children || <span>{player.steam_id || 'No Steam ID'}</span>}</>;
  return unwrapped ? identity : <span className={className}>{identity}</span>;
}
