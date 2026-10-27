import { tagOperators } from '../filters/state/tag-filter.mjs';

export default function TagCondition({ tag, condition, onChange }) {
  const numeric = tag.kind === 'number', enabled = condition != null;
  const value = numeric ? condition?.op || 'gte' : condition || 'true';
  return <div className="manual-filter-conditions">
    <select aria-label={`${tag.name} condition`} value={value} disabled={!enabled}
      onChange={event => onChange(numeric ? { ...condition, op: event.target.value } : event.target.value)}>
      {(numeric ? Object.entries(tagOperators) : [['true', 'True'], ['false', 'False']]).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
    </select>
    {numeric && ['value', ...(condition?.op === 'between' ? ['max'] : [])].map(key => <input key={key} type="number" step="any"
      aria-label={`${tag.name} ${key === 'max' ? 'maximum' : 'value'}`} disabled={!enabled} value={condition?.[key] ?? ''}
      placeholder={key === 'max' ? 'Maximum' : condition?.op === 'between' ? 'Minimum' : 'Value'}
      onChange={event => onChange({ ...condition, [key]: event.target.value.trim() === '' ? null : Number(event.target.value) })} />)}
  </div>;
}
