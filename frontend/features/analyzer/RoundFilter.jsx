import ToggleGroup from '../../shared/components/forms/ToggleGroup.jsx';
import MultiToggleGroup from '../../shared/components/forms/MultiToggleGroup.jsx';
export default function RoundFilter({label,value,options,onChange,multiple=false}) {
  const Choices=multiple?MultiToggleGroup:ToggleGroup;
  return <div className="analyzer-round-filter"><span>{label}</span><Choices label={label} options={options} value={value} onChange={onChange} className="side-toggle" /></div>;
}
