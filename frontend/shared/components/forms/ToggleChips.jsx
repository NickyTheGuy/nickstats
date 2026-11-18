import ToggleButton from '../buttons/ToggleButton.jsx';

export default function ToggleChips({label,options,selected,onChange,className=''}) {
  return <div role="group" aria-label={label} className={`selection-chips ${className}`}>
    {options.map(([value,text,props={}])=><ToggleButton {...props} key={value} className={`selection-chip ${props.className||''}`}
      selected={selected.includes(value)} onClick={()=>onChange(value,!selected.includes(value))}>{text}</ToggleButton>)}
  </div>;
}
