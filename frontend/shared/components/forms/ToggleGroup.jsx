import ToggleButton from '../buttons/ToggleButton.jsx';

export default function ToggleGroup({ label, options, value, onChange, disabled = false, className = 'scoreboard-button-group', buttonClassName = '' }) {
  return <div className={className} role="group" aria-label={label}>
    {options.map(([key, text, props = {}]) => <ToggleButton {...props} key={key} className={buttonClassName} disabled={disabled || props.disabled} selected={value === key}
      onClick={() => onChange(key)}>{text}</ToggleButton>)}
  </div>;
}
