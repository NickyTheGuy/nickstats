import { Fragment, useLayoutEffect, useRef } from 'react';
import Button from '../buttons/Button.jsx';
import CloseButton from '../buttons/CloseButton.jsx';

export default function TabList({ id, label, options, value, onChange, className = '', tabClassName = '', itemClassName = '', hidden = false }) {
  const list = useRef(null), closing = useRef(false);
  useLayoutEffect(() => {
    if (!closing.current) return;
    if (hidden) { closing.current = false; return; }
    const selected = list.current.querySelector('[role="tab"][aria-selected="true"]:not(:disabled)');
    (selected || list.current.querySelector('[role="tab"]:not(:disabled)'))?.focus();
    // Routed tabs can disappear one render before the next hash is selected.
    // Retain the pending focus until that selection arrives.
    if (selected || value !== closing.current.value) closing.current = false;
  }, [options, value, hidden]);
  function close(action) { closing.current = { value }; action(); }
  function navigate(event) {
    const buttons = [...list.current.querySelectorAll('[role="tab"]:not(:disabled)')];
    const index = buttons.indexOf(event.target);
    if (index < 0) return;
    if (event.key === 'Delete') {
      const key = event.target.dataset.tabKey, action = options.find(([id]) => String(id) === key)?.[2]?.onClose;
      if (action) { event.preventDefault(); close(action); }
      return;
    }
    const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!direction && !['Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
      : (index + direction + buttons.length) % buttons.length;
    buttons[next].focus(); buttons[next].click();
  }
  return <nav id={id} ref={list} className={className} role="tablist" aria-label={label}
    aria-orientation="horizontal" onKeyDown={navigate} hidden={hidden}>
    {options.map(([key, text, config = {}]) => {
      const selected = value === key;
      const tab = <Button {...config.tabProps} role="tab" data-tab-key={key} disabled={config.disabled}
        className={[tabClassName, selected && 'active'].filter(Boolean).join(' ')}
        aria-selected={selected} tabIndex={selected ? 0 : -1} onClick={() => onChange(key)}>{text}</Button>;
      return itemClassName ? <div {...config.itemProps} key={key}
        className={[itemClassName, !config.onClose && 'single', selected && 'active'].filter(Boolean).join(' ')}>
        {tab}{config.onClose && <CloseButton label={config.closeLabel || `Close ${text}`} onClick={() => close(config.onClose)} />}
      </div> : <Fragment key={key}>{tab}</Fragment>;
    })}
  </nav>;
}
