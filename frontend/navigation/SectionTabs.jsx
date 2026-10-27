import { useSyncExternalStore } from 'react';
import TabList from '../components/TabList.jsx';

export default function SectionTabs({ store, config }) {
  const { value } = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return <TabList {...config} value={value} onChange={store.choose} />;
}
