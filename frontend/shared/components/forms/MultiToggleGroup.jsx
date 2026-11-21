import ToggleButton from '../buttons/ToggleButton.jsx';

// Empty selection means All. Individual choices accumulate; clearing the last
// choice returns to All, so a filter never becomes an accidental empty set.
export default function MultiToggleGroup({
  label,
  options,
  value,
  onChange,
  className = 'segmented-control',
  buttonClassName = '',
  disabled = false,
  allValue = 'all',
}) {
  const selected = Array.isArray(value) ? value : value === allValue ? [] : [value];
  function choose(key) {
    if (key === allValue) onChange([]);
    else
      onChange(
        selected.includes(key) ? selected.filter((item) => item !== key) : [...selected, key],
      );
  }
  return (
    <div className={className} role="group" aria-label={label}>
      {options.map(([key, text, props = {}]) => (
        <ToggleButton
          {...props}
          key={key}
          className={buttonClassName}
          disabled={disabled || props.disabled}
          selected={key === allValue ? selected.length === 0 : selected.includes(key)}
          onClick={() => choose(key)}
        >
          {text}
        </ToggleButton>
      ))}
    </div>
  );
}
