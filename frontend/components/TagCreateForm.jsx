import { useRef, useState } from 'react';
import Button from './Button.jsx';

export default function TagCreateForm({ store, view }) {
  const [name, setName] = useState(''), [kind, setKind] = useState('boolean');
  const input = useRef(null);
  async function submit(event) {
    event.preventDefault();
    if (!name.trim()) return;
    if (await store.create(name.trim(), kind)) setName(''); else input.current?.focus();
  }
  return <form className="manual-filter-create manual-tag-create" onSubmit={submit}>
    <input ref={input} type="text" maxLength={64} required placeholder="New tag name" aria-label="New tag name" value={name} onChange={event => setName(event.target.value)} />
    <select aria-label="Tag type" value={kind} onChange={event => setKind(event.target.value)}>
      <option value="boolean">True/False</option><option value="number" disabled={!view.supportsNumeric}>Number</option>
    </select>
    <Button type="submit" className="button button-secondary" disabled={!view.ready || view.loading || view.pending.has('create')}>+ Add</Button>
  </form>;
}
