export default function CheckboxGroup({ label, options, selected, onChange, className, labelClassName, descriptionId }) {
  return <div className={className} role="group" aria-label={label} aria-describedby={descriptionId}>
    {options.map(([value, text, props = {}]) => <label key={value} className={labelClassName}>
      <input {...props} type="checkbox" value={value} checked={selected.includes(value)} onChange={event => onChange(value, event.target.checked)} />
      <span>{text}</span>
    </label>)}
  </div>;
}
