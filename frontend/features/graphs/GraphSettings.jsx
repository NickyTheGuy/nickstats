import { useSyncExternalStore } from 'react';
import OptionField from '../../shared/components/forms/OptionField.jsx';
import BucketControls from './BucketControls.jsx';
import { graphSettingChoices } from './state/graph-settings.mjs';

export default function GraphSettings({ store, prefix }) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const scopes = graphSettingChoices.scope.map(([key, label]) => [key, label, { disabled: key === 'round' ? !state.supportsRounds : state.roundOnly }]);
  return <fieldset className="graph-display-controls">
    <legend>Graph settings</legend><div>
      <OptionField id={`${prefix}GraphScopeControl`} label="View" options={scopes} value={state.scope} onChange={value => store.set('scope', value)} />
      <OptionField id={`${prefix}GraphTypeControl`} label="Graph type" options={graphSettingChoices.type} value={state.type} hidden={state.scope === 'round'} onChange={value => store.set('type', value)} />
      <OptionField id={`${prefix}GraphDistributionStyleControl`} label="Display" options={graphSettingChoices.style} value={state.style} onChange={value => store.set('style', value)} />
      <BucketControls prefix={prefix} state={state} store={store} />
    </div>
  </fieldset>;
}
