import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPlayerSearch } from '../state/player-search.mjs';
import Modal from '../components/Modal.jsx';
import TextField from '../components/TextField.jsx';
import FormMessage from '../components/FormMessage.jsx';
import Button from '../components/Button.jsx';
import PasswordForm from './PasswordForm.jsx';
import useAsyncAction from '../hooks/useAsyncAction.js';

export default function AccountSettings({ session, api, onPlayer, onPassword, onLogout, onClose }) {
  const [search] = useState(() => createPlayerSearch({ limit: 10 }));
  const result = useSyncExternalStore(search.subscribe, search.getSnapshot);
  useEffect(() => () => search.destroy(), [search]);
  const mutation = useAsyncAction();
  const [operation, setOperation] = useState('');
  function changePlayer(player) {
    setOperation('player');
    mutation.run(() => api.player(player), body => {
      onPlayer(body);
      search.reset(player ? `${body.player_name || player.name} now represents this account.` : 'Selected player cleared.');
    });
  }
  const playerMessage = mutation.busy && operation === 'player' ? 'Saving player…'
    : operation === 'player' && mutation.error ? mutation.error : result.message;
  return <Modal id="demoAccountDialog" className="demo-auth-dialog" titleId="demoAccountTitle" initialFocus="demoAccountPlayerSearch" busy={mutation.busy} onClose={onClose}>
    <div className="demo-auth-form">
      <div className="eyebrow">Account</div><h2 id="demoAccountTitle">Account settings</h2>
      <p>Logged in as <strong id="demoAccountUsername">{session.username}</strong></p>
      <section className="demo-account-section" aria-labelledby="demoAccountPlayerTitle">
        <h3 id="demoAccountPlayerTitle">Your player</h3>
        <p className="demo-account-player-current" id="demoAccountPlayerCurrent">{session.player_id == null ? 'No player selected.' : `${session.player_name || 'Selected player'} · player #${session.player_id}`}</p>
        <form className="demo-account-player-search" id="demoAccountPlayerForm" role="search" onSubmit={event => { event.preventDefault(); search.submit(); }}>
          <TextField id="demoAccountPlayerSearch" label="Find yourself by name or Steam ID" type="search" autoComplete="off" spellCheck={false} disabled={mutation.busy}
            value={result.query} onChange={event => { setOperation(''); search.input(event.target.value); }}
            action={<Button className="button button-secondary" type="submit" disabled={mutation.busy}>Search</Button>} />
        </form>
        <FormMessage id="demoAccountPlayerStatus" className="demo-account-player-status" error={result.error || operation === 'player' && Boolean(mutation.error)}>{playerMessage}</FormMessage>
        <div className="demo-account-player-results" id="demoAccountPlayerResults" aria-busy={result.loading || mutation.busy}>
          {result.players.map(player => <Button key={player.id} className="demo-account-player-result" disabled={mutation.busy} onClick={() => changePlayer(player)}>
            <strong>{player.name || 'Unknown player'}</strong><span>{player.steam_id || `Player #${player.id}`}</span>
          </Button>)}
        </div>
        <Button className="button button-secondary demo-account-player-clear" id="demoAccountPlayerClear" hidden={session.player_id == null} disabled={mutation.busy} onClick={() => changePlayer(null)}>Clear selected player</Button>
      </section>
      <PasswordForm busy={mutation.busy} error={operation === 'password' ? mutation.error : ''} onSubmit={fields => {
        setOperation('password'); mutation.run(() => api.password(fields), onPassword);
      }} />
      <FormMessage id="demoLogoutError" className="demo-auth-error" error>{operation === 'logout' ? mutation.error : ''}</FormMessage>
      <div className="demo-auth-actions">
        <Button className="button button-secondary" id="demoLogoutButton" disabled={mutation.busy} onClick={() => {
          setOperation('logout'); mutation.run(api.logout, onLogout);
        }}>Log out</Button>
        <Button className="button button-secondary" id="demoAccountCloseButton" disabled={mutation.busy} onClick={onClose}>Close</Button>
      </div>
    </div>
  </Modal>;
}
