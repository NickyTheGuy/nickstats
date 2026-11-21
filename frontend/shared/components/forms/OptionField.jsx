import OptionDropdown from './OptionDropdown.jsx';

export default function OptionField({
  id,
  label,
  options,
  value,
  onChange,
  hidden = false,
  className = 'graph-option-field',
  align = 'center',
}) {
  return (
    <div className={className} id={id} hidden={hidden}>
      <span>{label}</span>
      <OptionDropdown
        align={align}
        label={label}
        options={options}
        value={value}
        onChange={onChange}
      />
    </div>
  );
}
