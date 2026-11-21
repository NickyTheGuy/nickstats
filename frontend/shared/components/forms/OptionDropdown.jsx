import { useLayoutEffect, useRef, useState } from 'react';
import Dropdown from './Dropdown.jsx';
import Button from '../buttons/Button.jsx';

export default function OptionDropdown({
  label,
  options,
  value,
  onChange,
  className,
  align = 'center',
}) {
  const [open, setOpen] = useState(false),
    container = useRef(null);
  const pending = useRef(null);
  useLayoutEffect(() => {
    if (!open || pending.current == null) return;
    container.current.querySelectorAll('button:not(:disabled)')[pending.current]?.focus();
    pending.current = null;
  }, [open]);
  const text = options.find(([key]) => key === value)?.[1] || 'Choose an option';
  function choose(key) {
    if (options.find(([value]) => value === key)?.[2]?.disabled) return;
    setOpen(false);
    onChange(key);
    container.current.querySelector('summary').focus();
  }
  function navigate(event) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    setOpen(true);
    const buttons = [...container.current.querySelectorAll('button:not(:disabled)')];
    const index = buttons.indexOf(document.activeElement);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? buttons.length - 1
          : index < 0
            ? event.key === 'ArrowUp'
              ? buttons.length - 1
              : 0
            : (index + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length;
    if (open) buttons[next]?.focus();
    else pending.current = next;
  }
  return (
    <div ref={container} className={className}>
      <Dropdown
        className="stats-dropdown"
        align={align}
        summary={
          <span className="ui-dropdown-content">
            <span className="ui-dropdown-value">{text}</span>
            <svg
              className="ui-dropdown-caret"
              width="8"
              height="8"
              viewBox="0 0 8 8"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <path d="m1.5 2.5 2.5 3 2.5-3" />
            </svg>
          </span>
        }
        summaryLabel={`${label}: ${text}`}
        open={open}
        onOpenChange={setOpen}
        onKeyDown={navigate}
      >
        <div className="stats-dropdown-menu" role="group" aria-label={label}>
          {options.map(([key, title, props = {}]) => (
            <Button
              {...props}
              align="start"
              key={key}
              aria-current={value === key}
              onClick={() => choose(key)}
            >
              {title}
            </Button>
          ))}
        </div>
      </Dropdown>
    </div>
  );
}
