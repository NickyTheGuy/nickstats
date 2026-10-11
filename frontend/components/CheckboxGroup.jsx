export default function CheckboxGroup({ label, options, selected, onChange, className }) {
  return <div className={className} role="group" aria-label={label}>
    {options.map(([value, text]) => <label key={value}>
      <input type="checkbox" value={value} checked={selected.includes(value)} onChange={event => onChange(value, event.target.checked)} />
      <span>{text}</span>
    </label>)}
  </div>;
}
