import { useState } from 'react';
import Button from '../../shared/components/buttons/Button.jsx';
import Dropdown from '../../shared/components/forms/Dropdown.jsx';

export default function TagShareMenu({ tag, store, pending }) {
  const [username, setUsername] = useState('');
  async function submit(event) {
    event.preventDefault();
    if (username.trim() && await store.share(tag.id, username.trim())) setUsername('');
  }
  return <Dropdown summary="Share" className="tag-share-menu">
    <div className="tag-share-panel">
      <p className="manual-filter-help">Recipients can filter and graph these values. Only you can edit them.</p>
      {(tag.shared_with || []).map(name => <div className="tag-share-recipient" key={name}>
        <span>{name}</span><Button className="button button-secondary" disabled={pending}
          aria-label={`Stop sharing ${tag.name} with ${name}`} onClick={() => store.share(tag.id, name, true)}>Remove</Button>
      </div>)}
      <form className="manual-filter-create" onSubmit={submit}>
        <input required maxLength={64} placeholder="Account username" aria-label={`Share ${tag.name} with account`} value={username} onChange={event => setUsername(event.target.value)} />
        <Button type="submit" className="button button-secondary" disabled={pending}>Share</Button>
      </form>
    </div>
  </Dropdown>;
}
