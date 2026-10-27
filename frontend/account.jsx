import { useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import Button from './components/Button.jsx';
import LoginForm from './account/LoginForm.jsx';
import AccountSettings from './account/AccountSettings.jsx';
import { createAccountAPI } from './state/account-api.mjs';

function AccountRoot({ store, api, actions }) {
  const { session, view, revision, message } = useSyncExternalStore(store.subscribe, store.getSnapshot);
  function finish(action, result) { store.close(); actions[action]?.(result); }
  function dismiss() { store.close(); if (view === 'login') actions.onCancel?.(); }
  return <>
    <Button id="demoAuthButton" className={`button button-secondary demo-auth-button app-account-button${session.authenticated ? ' authenticated' : ''}`}
      onClick={() => session.authenticated ? store.open('account') : store.open('login')}>
      {session.authenticated ? `${session.username} · Account` : 'Log in'}
    </Button>
    {createPortal(view === 'login'
      ? <LoginForm key={revision} api={api} message={message} onLogin={body => finish('onLogin', body)} onClose={dismiss} />
      : view === 'account' ? <AccountSettings key={revision} session={session} api={api} onPlayer={actions.onPlayer}
        onPassword={() => finish('onPassword')} onLogout={() => finish('onLogout')} onClose={dismiss} /> : null,
    document.getElementById('accountDialogsApp'))}
  </>;
}

window.NickStatsAccountUI = Object.freeze({
  create(actions) {
    let snapshot = { session: { authenticated: false }, view: null, revision: 0, message: '' };
    const listeners = new Set();
    const publish = patch => { snapshot = { ...snapshot, ...patch }; listeners.forEach(listener => listener()); };
    const store = {
      subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
      getSnapshot: () => snapshot,
      open(view, message = '') { publish({ view, message, revision: snapshot.revision + 1 }); },
      close() { publish({ view: null }); }
    };
    createRoot(document.getElementById('accountApp')).render(<AccountRoot store={store} api={createAccountAPI()} actions={actions} />);
    return {
      session(session) { publish({ session, ...(!session.authenticated && snapshot.view === 'account' ? { view: null } : {}) }); },
      login(message = '') { store.open('login', message); }
    };
  }
});
