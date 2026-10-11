import { useEffect, useRef, useState } from 'react';

export default function Dropdown({ summary, className, closeKey, children }) {
  const menu = useRef(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); }, [closeKey]);
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
    if (event.key !== 'Escape' || !open) return;
    event.preventDefault();
    setOpen(false);
    menu.current.querySelector('summary').focus();
  }
  return <details ref={menu} className={className} open={open} onToggle={event => setOpen(event.currentTarget.open)} onKeyDown={escape}>
    <summary>{summary}</summary>
    {children}
  </details>;
}
