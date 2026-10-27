import { useState } from 'react';
import TextField from '../components/TextField.jsx';
import FormMessage from '../components/FormMessage.jsx';
import Button from '../components/Button.jsx';
import Modal from '../components/Modal.jsx';
import useAsyncAction from '../hooks/useAsyncAction.js';

export default function LoginForm({ message, api, onLogin, onClose }) {
  const [username, setUsername] = useState(''), [password, setPassword] = useState('');
  const action = useAsyncAction();
  return <Modal id="demoAuthDialog" className="demo-auth-dialog" titleId="demoAuthTitle" descriptionId="demoAuthDescription"
    initialFocus="demoAuthUsername" busy={action.busy} onClose={onClose}>
    <form className="demo-auth-form" id="demoAuthForm" aria-busy={action.busy} onSubmit={event => {
      event.preventDefault(); action.run(() => api.login({ username, password }), onLogin);
    }}>
      <div className="eyebrow">Database access</div><h2 id="demoAuthTitle">Log in to NickStats</h2>
      <p id="demoAuthDescription">Log in to access your NickStats account and upload matches.</p>
      <TextField id="demoAuthUsername" label="Username" name="username" type="text" autoComplete="username" spellCheck={false} required disabled={action.busy} value={username} onChange={e => setUsername(e.target.value)} />
      <TextField id="demoAuthPassword" label="Password" name="password" type="password" autoComplete="current-password" required disabled={action.busy} value={password} onChange={e => setPassword(e.target.value)} />
      <FormMessage id="demoAuthError" className="demo-auth-error" error>{action.error || message}</FormMessage>
      <div className="demo-auth-actions">
        <Button className="button button-primary" type="submit" disabled={action.busy}>{action.busy ? 'Logging in…' : 'Log in'}</Button>
        <Button className="button button-secondary" id="demoAuthCancelButton" disabled={action.busy} onClick={onClose}>Not now</Button>
      </div>
    </form>
  </Modal>;
}
