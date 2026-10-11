import { useRef } from 'react';
import Button from './Button.jsx';

export default function TabList({ id, label, options, value, onChange, className = '', tabClassName = '' }) {
  const list = useRef(null);
  function navigate(event) {
    const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!direction && !['Home', 'End'].includes(event.key)) return;
    const buttons = [...list.current.querySelectorAll('[role="tab"]:not(:disabled)')];
    const index = buttons.indexOf(event.target);
    if (index < 0) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
      : (index + direction + buttons.length) % buttons.length;
    buttons[next].focus();
    buttons[next].click();
  }
  return <nav id={id} ref={list} className={className} role="tablist" aria-label={label}
    aria-orientation="horizontal" onKeyDown={navigate}>
    {options.map(([key, text]) => <Button key={key} role="tab"
      className={[tabClassName, value === key && 'active'].filter(Boolean).join(' ')}
      aria-selected={value === key} tabIndex={value === key ? 0 : -1}
      onClick={() => onChange(key)}>{text}</Button>)}
  </nav>;
}
