import { useState } from 'react';
import Button from '../../shared/components/buttons/Button.jsx';
import StatPreview from './StatPreview.jsx';
import MatchList from './MatchList.jsx';

const date = timestamp => new Date(timestamp * 1000).toLocaleString(undefined,
  { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
function SessionCard({ session, onOpen, onSession, openSessions, scope }) {
  const [expanded, setExpanded] = useState(openSessions.has(session.id));
  const title = session.start == null ? 'Date unknown' : session.start === session.lastStart ? date(session.start) : `${date(session.start)} – ${date(session.lastStart)}`;
  function expand(next) {
    setExpanded(next);
    next ? openSessions.add(session.id) : openSessions.delete(session.id);
  }
  return <details className="player-match-session" open={expanded} onToggle={event => { if (event.currentTarget.open !== expanded) expand(event.currentTarget.open); }}>
    <summary onClick={event => { event.preventDefault(); onSession(session.id); }}>
      <strong>{title}</strong>
      <span className="session-record"><span>{session.matches.length} match{session.matches.length === 1 ? '' : 'es'} · </span>
        <span className="session-win">{session.record.wins}W </span><span className="session-loss">{session.record.losses}L </span><span className="session-draw">{session.record.draws}D </span>
      </span>
      <StatPreview stats={session.preview} className="session-preview" />
      <Button className="session-expand" aria-expanded={expanded} onClick={event => { event.preventDefault(); event.stopPropagation(); expand(!expanded); }}>{expanded ? 'Hide matches' : 'Show matches'}</Button>
    </summary>
    <div className="match-list"><MatchList matches={session.matches} onOpen={onOpen} scope={`${scope}/${session.id}`} editableTags /></div>
  </details>;
}
export default function SessionHistory({ sessions, scope, ...props }) {
  return sessions.map(session => <SessionCard key={session.id} session={session} scope={scope} {...props} />);
}
