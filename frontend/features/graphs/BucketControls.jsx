import OptionDropdown from '../../shared/components/forms/OptionDropdown.jsx';
import NumberStepper from '../../shared/components/forms/NumberStepper.jsx';
import { graphSettingChoices } from './state/graph-settings.mjs';

export default function BucketControls({ prefix, state, store }) {
  const key = store.bucketKey(), values = state.ranges.get(key) || ['', '', ''];
  return <div className="graph-bucket-control" id={`${prefix}GraphBucketControl`}
    hidden={state.scope === 'round' || state.type === 'trend'}>
    <div className="graph-bucket-settings">
      <div className="graph-bucket-mode"><span>Buckets</span>
        <OptionDropdown label="Buckets" options={graphSettingChoices.mode} value={state.mode} onChange={value => store.set('mode', value)} />
      </div>
      <div hidden={state.mode !== 'auto'}><NumberStepper prefix={prefix} value={state.bucketCount} min={4} max={24} onStep={store.step} /></div>
      <div className="graph-bucket-range" id={`${prefix}GraphBucketRange`} hidden={state.mode !== 'range'}>
        {['From', 'To', 'Increment'].map((label, index) => <label key={label}>{label}
          <input id={`${prefix}GraphBucket${label}`} type="number" step="any" min={index === 2 ? 0 : undefined}
            aria-describedby={`${prefix}GraphNote`} aria-invalid={state.mode === 'range' && !!state.error}
            placeholder={['0', '30', '5'][index]} value={values[index]} onChange={event => store.range(index, event.target.value)} />
        </label>)}
      </div>
      <label className="graph-bucket-manual" id={`${prefix}GraphBucketManual`} hidden={state.mode !== 'manual'}>Cutoffs
        <input id={`${prefix}GraphBucketCutoffs`} type="text" inputMode="decimal" aria-describedby={`${prefix}GraphNote`}
          aria-invalid={state.mode === 'manual' && !!state.error} placeholder="5, 10, 15"
          value={state.cutoffs.get(key) || ''} onChange={event => store.manual(event.target.value)} />
      </label>
    </div>
  </div>;
}
