import ToggleButton from '../../shared/components/buttons/ToggleButton.jsx';
import Button from '../../shared/components/buttons/Button.jsx';
import { combinedSections } from './state/round-selection.mjs';

function BatchChip({keys,selected,onToggle,children,label}) {
  const set=new Set(selected),all=keys.length>0&&keys.every(key=>set.has(key)),some=keys.some(key=>set.has(key));
  return <ToggleButton selected={all} disabled={!keys.length} className={`selection-chip ${some&&!all?'partial':''}`}
    aria-label={label} title={label} onClick={()=>onToggle(keys)}>{children}</ToggleButton>;
}
export default function RoundPicker({replays,selected,onToggleSet,onClear,filters}) {
  const sections=combinedSections(replays,filters),all=sections.flatMap(s=>s.keys);
  return <div className="analyzer-round-picker">
    <div className="selection-chips" role="group" aria-label="Round presets">
      {[["all","All rounds"],["regulation","Regulation"],["overtime","Overtime"]].map(([phase,label])=>
        <BatchChip key={phase} keys={phase==='all'?all:sections.filter(s=>s.phase===phase).flatMap(s=>s.keys)} selected={selected} onToggle={onToggleSet} label={label}>{label}</BatchChip>)}
      <Button className="selection-chip" onClick={onClear}>Clear rounds</Button>
    </div>
    {sections.map(section=><div className="analyzer-half" key={section.key}>
      <div><BatchChip keys={section.keys} selected={selected} onToggle={onToggleSet} label={section.label}>{section.label}</BatchChip></div>
      <div className="selection-chips" role="group" aria-label={section.label}>
        {section.numbers.map(([number,keys])=><BatchChip key={number} keys={keys} selected={selected} onToggle={onToggleSet} label={`Round ${number} · ${section.label}`}>{number}</BatchChip>)}
      </div>
    </div>)}
  </div>;
}
