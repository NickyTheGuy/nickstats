import { useEffect, useRef, useState } from 'react';

export default function Dropdown({ summary, className, closeKey, children, open: controlledOpen, onOpenChange, summaryLabel, onKeyDown }) {
  const menu = useRef(null);
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  const setOpen = onOpenChange || setLocalOpen;
  useEffect(() => { if (closeKey !== undefined) setOpen(false); }, [closeKey]);
  useEffect(() => {
    if (!open) return;
    function dismiss(event) {
      if (!menu.current.contains(event.target)) setOpen(false);
    }
    // Check containment before child events update options or filtered data.
    document.addEventListener('pointerdown', dismiss, true);
    return () => document.removeEventListener('pointerdown', dismiss, true);
  }, [open]);
  function escape(event) {
    onKeyDown?.(event);
    if (event.defaultPrevented || event.key !== 'Escape' || !open) return;
    event.preventDefault();
    event.stopPropagation();
    setOpen(false);
    menu.current.querySelector('summary').focus();
  }
  return <details ref={menu} className={className} open={open} onToggle={event => { if (event.currentTarget.open !== open) setOpen(event.currentTarget.open); }} onKeyDown={escape}>
    <summary aria-label={summaryLabel}>{summary}</summary>
    {children}
  </details>;
}
