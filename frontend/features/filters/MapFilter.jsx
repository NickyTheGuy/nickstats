import { useSyncExternalStore } from 'react';
import Dropdown from '../../shared/components/forms/Dropdown.jsx';
import CheckboxGroup from '../../shared/components/forms/CheckboxGroup.jsx';

export default function MapFilter({ store }) {
  const { options, selected, closeKey } = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return <Dropdown summary={store.summary()} className="map-filter-menu" closeKey={closeKey}>
    <CheckboxGroup label="Map selection" className="map-filter-options"
      options={[["ALL", "All maps"], ...options.map(value => [value, store.formatLabel(value)])]}
      selected={selected.length ? selected : ['ALL']} onChange={store.choose} />
  </Dropdown>;
}
