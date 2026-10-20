import { useSyncExternalStore } from 'react';
import SearchForm from '../components/SearchForm.jsx';
import PlayerSearchResult from './PlayerSearchResult.jsx';

export default function PlayerSearch({ store, prefix, onSelect, excluded }) {
  const { query, players, message, error, loading } = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const group = prefix === 'group';
  return <>
    <div className={`section-head ${group ? 'group-builder' : 'player-search'}-heading`}>
      <div><div className="eyebrow">{group ? 'Conditional groups' : 'Player profiles'}</div>
        <h2>{group ? 'Add players, then mark each one Include or Exclude for the group condition.' : 'Search for anyone in any uploaded match.'}</h2>
      </div>
      <SearchForm prefix={prefix} query={query} onChange={store.input} onSubmit={store.submit}
        primary={!group} submitLabel={group ? 'Find player' : 'Search'} />
    </div>
    <div className={`${prefix}-search-status${error ? ' error' : ''}`} id={`${prefix}SearchStatus`} role="status" aria-live="polite">{message}</div>
    <div className={`${prefix}-search-results`} id={`${prefix}SearchResults`} aria-busy={loading}>
      {players.filter(player => !excluded?.(String(player.id))).map(player =>
        <PlayerSearchResult key={player.id} player={player} prefix={prefix} onSelect={onSelect} />)}
    </div>
  </>;
}
