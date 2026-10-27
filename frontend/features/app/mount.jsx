import { useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import Button from '../../shared/components/buttons/Button.jsx';
import Pagination from '../../shared/components/navigation/Pagination.jsx';
import TabList from '../../shared/components/navigation/TabList.jsx';
import MatchBanner from '../matches/MatchBanner.jsx';
import { shellElements } from './state/elements.mjs';

function Text({ as: Tag = 'span', text, error, className = '', ...props }) {
  return <Tag {...props} className={`${className}${error ? ' error' : ''}`}>{text}</Tag>;
}
function Warnings({ messages = [] }) { return messages.map((text, index) => <div key={index} className="warning">{text}</div>); }
function View({ store, Component }) {
  const props = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return <Component {...props} />;
}
function mount(id, Component, initial, target = `${id}App`) {
  let snapshot = initial;
  const listeners = new Set();
  const store = {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    update(patch) { snapshot = { ...snapshot, ...patch }; listeners.forEach(listener => listener()); }
  };
  const node = document.getElementById(target);
  if (!node) throw new Error(`Missing React mount: ${target}`);
  createRoot(node).render(<View store={store} Component={Component} />);
  return store;
}
window.NickStatsShellUI = Object.freeze({
  button(id, onClick) {
    const { as, text, ...props } = shellElements[id];
    return mount(id, Button, { id, ...props, children: text, onClick });
  },
  text(id) { return mount(id, Text, { id, ...shellElements[id] }); },
  pagination(id, onPrevious, onNext) { return mount(id, Pagination, { id, ...shellElements[id], onPrevious, onNext }); },
  warnings(id) { return mount(id, Warnings, {}, id); },
  tabs(id, props) { return mount(id, TabList, { id, ...props }); },
  banner() { return mount('demoMatchBanner', MatchBanner, { result: {} }); }
});
