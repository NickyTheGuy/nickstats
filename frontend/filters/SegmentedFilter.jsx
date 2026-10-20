import { useSyncExternalStore } from 'react';
import ToggleGroup from '../components/ToggleGroup.jsx';

export default function SegmentedFilter({ store, config }) {
  const view = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const options = config.options.map(([value, label, props = {}]) => [value, label,
    { ...props, [config.attribute]: value, disabled: view.disabled.includes(value) }]);
  return <ToggleGroup label={config.label} className={config.className} buttonClassName={config.buttonClassName}
    options={options} value={view.value} onChange={store.choose} />;
}
