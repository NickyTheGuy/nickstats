import useManualTags from '../hooks/useManualTags.js';
import MatchCard from './MatchCard.jsx';

function Cards({ matches, onOpen, scope, tags }) {
  return matches.map(match => <MatchCard key={match.id} match={match} onOpen={onOpen} scope={scope} tags={tags} />);
}
function EditableCards(props) {
  const api = window.NickStatsManualFilters, view = useManualTags(api.store);
  return <Cards {...props} tags={view.account && view.ready ? api : null} />;
}
export default function MatchList({ editableTags = false, ...props }) {
  return editableTags ? <EditableCards {...props} /> : <Cards {...props} />;
}
