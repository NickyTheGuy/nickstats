import OptionDropdown from './OptionDropdown.jsx';

export default function OptionField({ id, label, options, value, onChange, hidden = false }) {
  return <div className="graph-option-field" id={id} hidden={hidden}>
    <span>{label}</span><OptionDropdown label={label} options={options} value={value} onChange={onChange} />
  </div>;
}
