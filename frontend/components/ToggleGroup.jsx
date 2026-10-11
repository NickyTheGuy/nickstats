import ToggleButton from './ToggleButton.jsx';

export default function ToggleGroup({ label, options, value, onChange, className = 'scoreboard-button-group' }) {
  return <div className={className} role="group" aria-label={label}>
    {options.map(([key, text]) => <ToggleButton key={key} selected={value === key}
      onClick={() => onChange(key)}>{text}</ToggleButton>)}
  </div>;
}
