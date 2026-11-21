import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPlayerSearch } from '../players/state/player-search.mjs';
import { friendsStore } from './state/friends.mjs';
import TextField from '../../shared/components/forms/TextField.jsx';
import Button from '../../shared/components/buttons/Button.jsx';
import IconButton from '../../shared/components/buttons/IconButton.jsx';
import FormMessage from '../../shared/components/feedback/FormMessage.jsx';
import useAsyncAction from '../../shared/hooks/useAsyncAction.js';
export default function FriendsSettings({ username }) {
  const [search] = useState(() => createPlayerSearch({ limit: 10 })),
    result = useSyncExternalStore(search.subscribe, search.getSnapshot),
    friends = useSyncExternalStore(friendsStore.subscribe, friendsStore.getSnapshot),
    action = useAsyncAction();
  useEffect(() => {
    friendsStore.sync(username);
    return () => search.destroy();
  }, [username, search]);
  const ids = new Set(friends.friends.map((p) => String(p.id)));
  return (
    <section className="demo-account-section" aria-labelledby="accountFriendsTitle">
      <h3 id="accountFriendsTitle">Friends</h3>
      <form
        className="demo-account-player-search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          search.submit();
        }}
      >
        <TextField
          id="accountFriendsSearch"
          autoComplete="off"
          spellCheck={false}
          label="Find a friend by name or Steam ID"
          type="search"
          value={result.query}
          onChange={(e) => search.input(e.target.value)}
          action={
            <Button type="submit" className="button button-secondary">
              Search
            </Button>
          }
        />
      </form>
      <FormMessage error={Boolean(result.error || friends.error || action.error)}>
        {action.error || friends.error || result.message}
      </FormMessage>
      {friends.error && (
        <Button
          className="button button-secondary"
          onClick={() => friendsStore.sync(username, true)}
        >
          Retry friends
        </Button>
      )}
      <div className="demo-account-player-results" aria-busy={action.busy || friends.loading}>
        {result.players
          .filter((p) => !ids.has(String(p.id)))
          .map((player) => (
            <Button
              key={player.id}
              className="demo-account-player-result"
              disabled={action.busy}
              onClick={() => action.run(() => friendsStore.set(player, true))}
            >
              <strong>{player.name}</strong>
              <span>Add friend</span>
            </Button>
          ))}
        {friends.friends.map((player) => (
          <div key={player.id} className="account-friend-row">
            <span>{player.name}</span>
            <IconButton
              label={`Remove ${player.name} from friends`}
              controlSize={28}
              disabled={action.busy}
              onClick={() => action.run(() => friendsStore.set(player, false))}
            >
              <path d="m6 6 12 12M6 18 18 6" />
            </IconButton>
          </div>
        ))}
      </div>
    </section>
  );
}
