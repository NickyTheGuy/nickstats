import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import Autocomplete from '../components/Autocomplete.jsx';
import OptionDropdown from '../components/OptionDropdown.jsx';
import { metricSuggestions } from '../state/metric-picker.mjs';

export default function MetricPicker({ store, prefix, axis }) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const input = useRef(null), container = useRef(null);
  const base = `${prefix}Graph${axis === 'x' ? 'X' : ''}`;
  useEffect(() => {
    function outside(event) { if (!container.current?.contains(event.target)) store.close(); }
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [store]);
  useLayoutEffect(() => { if (state.focusKey) input.current?.focus(); }, [state.focusKey]);
  const choices = metricSuggestions(state.choices, state.category, state.query ?? '');
  return <div ref={container} className="react-metric-picker" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) store.close(); }}>
    <div className="graph-option-field"><span>Category</span>
      <OptionDropdown label={axis === 'x' ? 'X-axis category' : 'Category'} options={state.categories}
        value={state.category} onChange={store.category} />
    </div>
    <Autocomplete id={`${base}Metric`} label={axis === 'x' ? 'X-axis' : state.label} inputRef={input}
      value={state.query ?? state.choices.find(choice => choice.id === state.metricId)?.label ?? ''}
      open={state.open} choices={choices} index={state.index} onOpen={store.open} onInput={store.input}
      onMove={store.move} onEnter={() => store.enter()} onEscape={store.escape} onChoose={store.choose} />
  </div>;
}
