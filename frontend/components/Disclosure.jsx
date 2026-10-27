import { useState } from 'react';

export default function Disclosure({ summary, children, className }) {
  const [open, setOpen] = useState(false);
  return <details className={className} open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{summary}</summary>
    {children}
  </details>;
}
