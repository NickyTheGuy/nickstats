import { useSyncExternalStore } from 'react';
import useManualTags from '../hooks/useManualTags.js';
import Dropdown from '../components/Dropdown.jsx';
import ToggleGroup from '../components/ToggleGroup.jsx';
import TagCreateForm from '../components/TagCreateForm.jsx';
import TagValueForm from '../components/TagValueForm.jsx';
import Button from '../components/Button.jsx';

const states = [['true', 'True'], ['false', 'False'], ['unknown', 'Unknown']];
const display = value => typeof value === 'number' ? String(value) : value[0].toUpperCase() + value.slice(1);

export default function MatchTagEditor({ api, matchID, editorKey, panels }) {
  const { store, displayName } = api;
  const view = useManualTags(store);
  const active = useSyncExternalStore(panels.subscribe, panels.getSnapshot);
  if (!view.account || !view.ready) return null;
  return <Dropdown key={view.account} summary="⋯" summaryLabel={`Tags for match ${matchID}`} className="manual-match-menu"
    open={active === editorKey} onOpenChange={open => panels.set(open ? editorKey : null)}>
    <div className="map-filter-options manual-match-options">
      <strong>Match #{matchID} · Tags</strong>
      <p className="manual-filter-help">Edit your tags here. Shared tags are read-only.</p>
      {view.filters.map(tag => {
        const value = store.stateFor(tag, matchID), pending = view.loading || view.pending.has(tag.id);
        return <div key={tag.id} className="manual-match-state">
          <span>{displayName(tag)}</span>
          {!store.canEdit(tag) ? <span className="manual-filter-help">{display(value)}</span> : tag.kind === 'number'
            ? <TagValueForm label={tag.name} value={value} pending={pending} onSave={next => store.assign(tag.id, matchID, next)} />
            : <ToggleGroup label={tag.name} options={states} value={value} disabled={pending}
              className="side-toggle" onChange={next => store.assign(tag.id, matchID, next)} />}
        </div>;
      })}
      {!view.filters.length && <p className="manual-filter-help">Create a tag to start labeling matches.</p>}
      {view.error && <><p role="alert" className="manual-filter-error">{view.error}</p>
        <Button className="button button-secondary" disabled={view.loading} onClick={() => store.load()}>Reload tags</Button></>}
      <TagCreateForm store={store} view={view} />
    </div>
  </Dropdown>;
}
