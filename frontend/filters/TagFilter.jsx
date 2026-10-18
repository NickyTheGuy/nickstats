import { Fragment, useSyncExternalStore } from 'react';
import Button from '../components/Button.jsx';
import Dropdown from '../components/Dropdown.jsx';
import TagCreateForm from '../components/TagCreateForm.jsx';
import TagShareMenu from '../components/TagShareMenu.jsx';
import TagCondition from '../components/TagCondition.jsx';

export default function TagFilter({ control, api }) {
  const view = useSyncExternalStore(control.subscribe, control.getSnapshot);
  if (!view.account) return null;
  const { store, displayName } = api;
  function toggle(tag, checked) {
    const initial = tag.kind === 'number' ? { op: 'gte', value: null } : 'true';
    control.select(tag.id, checked ? initial : null);
  }
  return <Fragment key={view.account}>
    <span className="manual-filter-heading">Tags</span>
    <Dropdown summary={view.selected.size ? `${view.selected.size} tag${view.selected.size === 1 ? '' : 's'}` : 'All matches'} className="map-filter-menu manual-filter-menu" closeKey={view.closeKey}>
      <div className="map-filter-options manual-filter-options">
        <p className="manual-filter-help">Unknown values are excluded; all selected conditions must match.</p>
        {view.loading && <p className="manual-filter-help">Loading tags…</p>}
        {view.error && <><p className="manual-filter-error" role="alert">{view.error}</p><Button className="button button-secondary" onClick={() => store.load()}>Reload tags</Button></>}
        {view.ready && <>
          <label><input type="checkbox" checked={!view.selected.size} onChange={() => control.reset({ notify: true })} /><span>All matches</span></label>
          {view.filters.map(tag => <div key={tag.id} className={`manual-filter-option${tag.kind === 'number' ? ' manual-filter-numeric' : ''}`}>
            <label><input type="checkbox" checked={view.selected.has(tag.id)} onChange={event => toggle(tag, event.target.checked)} /><span>{displayName(tag)}</span></label>
            <TagCondition tag={tag} condition={view.selected.get(tag.id)} onChange={value => control.select(tag.id, value)} />
            {store.canEdit(tag) && <div className="manual-filter-actions">
              {view.supportsSharing && <TagShareMenu tag={tag} store={store} pending={view.pending.has(tag.id)} />}
              <Button className="manual-filter-delete" disabled={view.pending.has(tag.id)} aria-label={`Delete ${tag.name} tag`}
                onClick={() => { if (window.confirm(`Delete “${tag.name}” and its match assignments from your account?`)) store.remove(tag.id); }}>×</Button>
            </div>}
          </div>)}
        </>}
        <TagCreateForm store={store} view={view} />
      </div>
    </Dropdown>
  </Fragment>;
}
