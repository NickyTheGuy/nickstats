import OptionDropdown from './OptionDropdown.jsx';

export default function OptionField({ id, label, options, value, onChange, hidden = false, className = "graph-option-field" }) {
  return <div className={className} id={id} hidden={hidden}>
    <span>{label}</span><OptionDropdown label={label} options={options} value={value} onChange={onChange} />
  </div>;
}
