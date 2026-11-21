import { useSyncExternalStore } from 'react';
import SearchForm from '../../../shared/components/forms/SearchForm.jsx';
import PlayerSearchResult from './PlayerSearchResult.jsx';

export default function PlayerSearch({ store, prefix, onSelect, excluded, variant }) {
  const { query, players, message, error, loading } = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
  );
  const group = variant === 'group' || prefix === 'group';
  return (
    <>
      <div className={`section-head ${group ? 'group-builder' : 'player-search'}-heading`}>
        {!group && (
          <div>
            <div className="eyebrow">Player profiles</div>
            <h2>Search for anyone in any uploaded match.</h2>
          </div>
        )}
        <SearchForm
          prefix={prefix}
          query={query}
          onChange={store.input}
          onSubmit={store.submit}
          className={group ? 'group-search-form' : undefined}
          primary={!group}
          submitLabel={group ? 'Find player' : 'Search'}
        />
      </div>
      <div
        className={`${group ? 'group' : prefix}-search-status${error ? ' error' : ''}`}
        id={`${prefix}SearchStatus`}
        role="status"
        aria-live="polite"
      >
        {message}
      </div>
      <div
        className={`${group ? 'group' : prefix}-search-results`}
        id={`${prefix}SearchResults`}
        aria-busy={loading}
      >
        {players
          .filter((player) => !excluded?.(String(player.id)))
          .map((player) => (
            <PlayerSearchResult
              key={player.id}
              player={player}
              prefix={prefix}
              variant={group ? 'group' : 'profile'}
              onSelect={onSelect}
            />
          ))}
      </div>
    </>
  );
}
