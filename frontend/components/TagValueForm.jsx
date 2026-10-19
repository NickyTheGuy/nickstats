import { useEffect, useRef, useState } from 'react';
import Button from './Button.jsx';

const display = value => typeof value === 'number' ? String(value) : '';
export default function TagValueForm({ label, value, pending, onSave }) {
  const [draft, setDraft] = useState(display(value));
  const [editing, setEditing] = useState(false);
  const currentDraft = useRef(draft);
  currentDraft.current = draft;
  useEffect(() => { if (!editing) setDraft(display(value)); }, [value, editing]);
  async function submit(event) {
    event.preventDefault();
    const submitted = draft;
    const result = await onSave(submitted.trim() === '' ? 'unknown' : Number(submitted));
    // Preserve any new input typed while the previous value was saving.
    if (result && currentDraft.current === submitted) setEditing(false);
  }
  return <form className="manual-tag-value" onSubmit={submit}>
    <input type="number" step="any" placeholder="Unknown" aria-label={`${label} value`} value={draft}
      onChange={event => { setEditing(true); setDraft(event.target.value); }} />
    <Button type="submit" className="button button-secondary" disabled={pending}>Save</Button>
  </form>;
}
