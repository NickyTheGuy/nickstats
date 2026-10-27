import { useState } from 'react';

export default function Disclosure({ summary, children, className, ...props }) {
  const [open, setOpen] = useState(false);
  return <details {...props} className={className} open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{summary}</summary>
    {children}
  </details>;
}
