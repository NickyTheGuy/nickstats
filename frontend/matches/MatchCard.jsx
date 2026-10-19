import Button from '../components/Button.jsx';
import MapArtwork from '../components/MapArtwork.jsx';
import StatPreview from '../components/StatPreview.jsx';
import MatchTagEditor from '../tags/MatchTagEditor.jsx';
import { matchEditorPanels } from '../state/match-editor.mjs';
import { teamsFor, matchScore, teamResult, formatMatchTime, matchDescription } from '../state/match-card.mjs';

function TeamScore({ team, opponent }) {
  return <span className={`match-list-team ${teamResult(team, opponent)}`}>
    <span className="match-list-team-name">{team?.name || 'Unknown team'}</span>
    <strong className="match-list-score">{matchScore(team) ?? '—'}</strong>
  </span>;
}
export default function MatchCard({ match, onOpen, scope, tags }) {
  const teams = teamsFor(match);
  const button = <Button className={`match-list-item${match.viewer_stats ? ' has-preview' : ''}`} aria-label={matchDescription(match)} onClick={() => onOpen(match)}>
    <MapArtwork name={match.map || 'Unknown map'} />
    <span className="match-list-identity"><strong>#{match.id}</strong><span className="match-list-meta">{formatMatchTime(Number(match.playedAt ?? match.played_at))}</span></span>
    <span className="match-list-result">{teams.length >= 2 ? <>
      <TeamScore team={teams[0]} opponent={teams[1]} /><span className="match-list-score-separator">–</span><TeamScore team={teams[1]} opponent={teams[0]} />
    </> : 'Score unavailable'}</span>
    {match.viewer_stats && <StatPreview stats={match.viewer_stats} />}
  </Button>;
  return tags ? <div className="manual-match-card" data-match-id={match.id}>
    {button}<div className="manual-match-editor"><MatchTagEditor api={tags} matchID={match.id} editorKey={`${scope}/${match.id}`} panels={matchEditorPanels} /></div>
  </div> : button;
}
