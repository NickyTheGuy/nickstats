import { useLayoutEffect, useRef } from 'react';
import Button from '../../shared/components/buttons/Button.jsx';

export default function Autocomplete({ id, label, value, open, choices, index, onOpen, onInput, onMove, onEnter, onEscape, onChoose, inputRef }) {
  const list = useRef(null);
  useLayoutEffect(() => { if (open && index >= 0) list.current?.children[index]?.scrollIntoView({ block: 'nearest' }); }, [open, index]);
  const activeId = open && index >= 0 ? `${id.replace(/Metric$/, '')}Suggestion${index}` : undefined;
  const listId = id.replace(/Metric$/, 'Suggestions');
  return <div className="graph-statistic-field">
    <label htmlFor={id} id={`${id}Label`}>{label}</label>
    <input ref={inputRef} id={id} type="search" role="combobox" aria-label={label} aria-autocomplete="list"
      aria-controls={listId} aria-expanded={open} aria-activedescendant={activeId} autoComplete="off" spellCheck={false}
      value={value} onFocus={event => { event.target.select(); onOpen(); }} onChange={event => onInput(event.target.value)}
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); onEscape(); }
        else if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); onMove(event.key === 'ArrowDown' ? 1 : -1); }
        else if (event.key === 'Enter' && open) { event.preventDefault(); onEnter(); }
      }} />
    <div ref={list} className="graph-stat-suggestions" id={listId} role="listbox" aria-label={`${label} suggestions`} hidden={!open}>
      {!choices.length && <p>No matching statistics</p>}
      {choices.map((choice, position) => <Button key={choice.id} id={`${id.replace(/Metric$/, '')}Suggestion${position}`}
        role="option" aria-selected={position === index} tabIndex={-1} onPointerDown={event => event.preventDefault()} onClick={() => onChoose(choice.id)}>
        <span>{choice.label}</span><small>{choice.group}</small>
      </Button>)}
    </div>
  </div>;
}
