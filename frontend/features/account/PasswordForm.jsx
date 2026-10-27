import { useState } from 'react';
import TextField from '../../shared/components/forms/TextField.jsx';
import FormMessage from '../../shared/components/feedback/FormMessage.jsx';
import Button from '../../shared/components/buttons/Button.jsx';

export default function PasswordForm({ busy, error, onSubmit }) {
  const [fields, setFields] = useState({ currentPassword: '', newPassword: '', confirmation: '' });
  const [validation, setValidation] = useState('');
  const options = [
    ['currentPassword', 'demoCurrentPassword', 'Current password', 'current-password'],
    ['newPassword', 'demoNewPassword', 'New password', 'new-password'],
    ['confirmation', 'demoConfirmPassword', 'Confirm new password', 'new-password']
  ];
  return <form className="demo-account-section demo-account-password" id="demoPasswordForm" aria-busy={busy} onSubmit={event => {
    event.preventDefault();
    if (fields.newPassword !== fields.confirmation) { setValidation('The new passwords do not match.'); return; }
    setValidation(''); onSubmit(fields);
  }}>
    <h3>Change password</h3>
    {options.map(([key, id, label, autocomplete]) => <TextField key={key} id={id} label={label} name={id} type="password" autoComplete={autocomplete}
      minLength={key === 'currentPassword' ? undefined : 12} required disabled={busy} value={fields[key]}
      onChange={event => { setFields(current => ({ ...current, [key]: event.target.value })); setValidation(''); }} />)}
    <FormMessage id="demoPasswordError" className="demo-auth-error" error>{validation || error}</FormMessage>
    <Button className="button button-primary" type="submit" disabled={busy}>Change password</Button>
  </form>;
}
