import { useLayoutEffect, useRef, useState } from 'react';
import Dropdown from './Dropdown.jsx';
import Button from '../buttons/Button.jsx';

export default function OptionDropdown({ label, options, value, onChange, className }) {
  const [open, setOpen] = useState(false), container = useRef(null);
  const pending = useRef(null);
  useLayoutEffect(() => {
    if (!open || pending.current == null) return;
    container.current.querySelectorAll('button:not(:disabled)')[pending.current]?.focus();
    pending.current = null;
  }, [open]);
  const text = options.find(([key]) => key === value)?.[1] || 'Choose an option';
  function choose(key) {
    if (options.find(([value]) => value === key)?.[2]?.disabled) return;
    setOpen(false); onChange(key);
    container.current.querySelector('summary').focus();
  }
  function navigate(event) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation(); setOpen(true);
    const buttons = [...container.current.querySelectorAll('button:not(:disabled)')];
    const index = buttons.indexOf(document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : index < 0
      ? event.key === 'ArrowUp' ? buttons.length - 1 : 0 : (index + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length;
    if (open) buttons[next]?.focus(); else pending.current = next;
  }
  return <div ref={container} className={className}>
    <Dropdown className="stats-dropdown" summary={text} summaryLabel={`${label}: ${text}`} open={open} onOpenChange={setOpen} onKeyDown={navigate}>
      <div className="stats-dropdown-menu" role="group" aria-label={label}>
        {options.map(([key, title, props = {}]) => <Button {...props} key={key} aria-current={value === key} onClick={() => choose(key)}>{title}</Button>)}
      </div>
    </Dropdown>
  </div>;
}
