import { artworkFor, matchScore, teamResult, formatMatchTime } from '../state/match-card.mjs';

export default function MatchBanner({ result, accountSteamID }) {
  const teams = result.teams || [];
  const viewer = accountSteamID && teams.findIndex(team => (team.players || []).some(player => String(player.steam_id) === accountSteamID));
  const [first, second] = viewer === 1 ? [teams[1], teams[0]] : teams;
  const map = result.map || 'Unknown map', artwork = artworkFor(map);
  const firstResult = teamResult(first, second), secondResult = teamResult(second, first);
  const date = formatMatchTime(result.played_at);
  const identity = result.provider_match_id || (result.demo_sha256 ? `SHA ${String(result.demo_sha256).slice(0, 12)}…` : 'Match ID unavailable');
  const fullIdentity = result.provider_match_id || (result.demo_sha256 ? `SHA ${result.demo_sha256}` : 'Match ID unavailable');
  return <section id="demoMatchBanner" className={`match-banner${artwork ? '' : ' unknown'}`}
    style={artwork ? { backgroundImage: `url("./assets/maps-v2/${artwork.file}")`, backgroundPosition: artwork.position } : undefined}
    aria-label={`${first?.name || 'Unknown team'} ${matchScore(first) ?? '—'} to ${matchScore(second) ?? '—'} ${second?.name || 'Unknown team'} on ${map.replace(/^de_/i, '')}`}>
    <div className="match-banner-top"><span className="match-banner-identity" title={fullIdentity}>{identity}</span>
      <time className="match-banner-date" dateTime={Number.isFinite(result.played_at) && result.played_at > 0 ? new Date(result.played_at * 1000).toISOString() : undefined}>{date === 'Unknown' ? 'Date unavailable' : date}</time>
    </div>
    <div className="match-banner-bottom"><div className="match-banner-scoreline">
      <span className={`match-banner-team first ${firstResult}`}>{first?.name || 'Unknown team'}</span>
      <strong className={`match-banner-score first ${firstResult}`}>{matchScore(first) ?? '—'}</strong><span className="match-banner-score-separator">–</span>
      <strong className={`match-banner-score second ${secondResult}`}>{matchScore(second) ?? '—'}</strong>
      <span className={`match-banner-team second ${secondResult}`}>{second?.name || 'Unknown team'}</span>
    </div></div>
  </section>;
}
